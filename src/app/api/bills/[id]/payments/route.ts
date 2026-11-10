import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { planBillPayment, type PaymentDebt } from "@/lib/bill-payments";
import { withLiveBalances } from "@/lib/ledger";
import type { Account, Bill } from "@/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Duplicate-payment and already-reversed refusals are conflicts, not bad input. */
function statusFor(error: { code?: string }) {
  return error.code === "SW409" || error.code === "23505" ? 409 : 400;
}

/** All payments for a bill, newest first, including reversed ones (kept for history). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("bill_payments")
    .select("*")
    .eq("bill_id", id)
    .eq("user_id", user.id)
    .order("paid_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

/**
 * Record a payment. Body: { amount_paid, paid_date, status?, account_id?, create_expense?,
 * interest_amount?, fees_amount?, occurrence_date?, settles?, idempotency_key? }
 *
 * - occurrence_date: the due date being paid (defaults to the bill's next due date).
 *   A due date that is already paid is refused with 409.
 * - settles: true = this completes the due date; false = part payment; omitted =
 *   completes it once payments toward it reach the bill amount.
 * - idempotency_key: a UUID per payment attempt. Sending the same key again
 *   (retry, double submit) returns the original payment with replayed: true.
 *
 * The database function record_bill_payment does all of it in one transaction.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const key = body.idempotency_key ?? null;
  if (key !== null && !UUID.test(String(key))) {
    return NextResponse.json({ error: "idempotency_key must be a UUID" }, { status: 400 });
  }
  if (body.occurrence_date && !DATE.test(String(body.occurrence_date))) {
    return NextResponse.json({ error: "occurrence_date must be YYYY-MM-DD" }, { status: 400 });
  }

  const { data: bill } = await supabase
    .from("bills")
    .select("id, kind, account_id, to_account_id, debt_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

  let debt: PaymentDebt | null = null;
  if (bill.debt_id) {
    const { data } = await supabase
      .from("debts")
      .select("current_balance, interest_rate, account_id")
      .eq("id", bill.debt_id)
      .eq("user_id", user.id)
      .maybeSingle();
    debt = data;
    // Linked to a card / loan account: what is owed is that account's live balance.
    if (data?.account_id) {
      const { data: account } = await supabase.from("accounts").select("*").eq("id", data.account_id).eq("user_id", user.id).maybeSingle();
      if (account) {
        const [live] = await withLiveBalances(supabase, user.id, [account as Account]);
        debt = { ...data, current_balance: live.balance };
      }
    }
  }

  const result = planBillPayment(
    bill as Pick<Bill, "kind" | "account_id" | "to_account_id" | "debt_id">,
    {
      amount: Number(body.amount_paid),
      accountId: body.account_id || null,
      createExpense: body.create_expense !== false,
      interest: body.interest_amount ?? null,
      fees: body.fees_amount ?? null,
    },
    debt
  );
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  const { plan } = result;

  const { data, error } = await supabase.rpc("record_bill_payment", {
    p_bill_id: id,
    p_amount: Number(body.amount_paid),
    p_paid_date: body.paid_date || new Date().toISOString().split("T")[0],
    p_status: body.status || "paid",
    p_account_id: body.account_id || null,
    p_create_expense: body.create_expense !== false,
    p_principal: plan.kind === "loan_emi" ? plan.principal : null,
    p_interest: plan.kind === "loan_emi" ? plan.interest : null,
    p_fees: plan.kind === "loan_emi" ? plan.fees : 0,
    p_occurrence_date: body.occurrence_date || null,
    p_settles: typeof body.settles === "boolean" ? body.settles : null,
    p_idempotency_key: key,
  });

  if (error) {
    // Two requests with the same key raced past each other: return the one that won.
    if (error.code === "23505" && key) {
      const { data: existing } = await supabase
        .from("bill_payments")
        .select("*")
        .eq("user_id", user.id)
        .eq("idempotency_key", key)
        .maybeSingle();
      if (existing) return NextResponse.json({ data: existing, plan, replayed: true }, { status: 200 });
    }
    return NextResponse.json({ error: error.message }, { status: statusFor(error) });
  }

  const { payment, replayed } = data as { payment: unknown; replayed: boolean };
  return NextResponse.json({ data: payment, plan, replayed }, { status: replayed ? 200 : 201 });
}

/**
 * Reverse a payment (?payment_id=, optional &reason=). The payment stays in the
 * history, marked reversed; its expense(s) and card transfer are removed, loan
 * principal is restored and the due date reopens — all in one transaction.
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const paymentId = url.searchParams.get("payment_id");
  if (!paymentId || !UUID.test(paymentId)) return NextResponse.json({ error: "payment_id is required" }, { status: 400 });

  const { data, error } = await supabase.rpc("reverse_bill_payment", {
    p_payment_id: paymentId,
    p_reason: url.searchParams.get("reason") || null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: statusFor(error) });
  return NextResponse.json({ data });
}
