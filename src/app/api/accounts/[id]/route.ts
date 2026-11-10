import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pickAccountFields } from "@/lib/accounts";
import { withLiveBalances } from "@/lib/ledger";
import type { Account } from "@/types";
import { reconciliationDelta } from "@/lib/accounts";
import { todayInAppZone } from "@/lib/dates";
import { isMissingTable } from "@/lib/portfolio";

/**
 * Body: account fields, and optionally { actual_balance } to reconcile. Reconciling adds one
 * dated adjustment (account_adjustments) for the difference between the calculated balance and
 * what your bank shows. Past entries and the opening balance are left alone, so history stays
 * as it was and the statement shows exactly what was corrected and when.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const row = pickAccountFields(body);

  if (body.actual_balance !== undefined && body.actual_balance !== null && body.actual_balance !== "") {
    const actual = Number(body.actual_balance);
    if (!Number.isFinite(actual)) return NextResponse.json({ error: "Enter the balance as a number" }, { status: 400 });
    const { data: current } = await supabase.from("accounts").select("*").eq("id", id).eq("user_id", user.id).single();
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const [live] = await withLiveBalances(supabase, user.id, [{ ...current, ...row } as Account]);
    const delta = reconciliationDelta(live, actual);
    if (delta !== 0) {
      const { error: adjError } = await supabase.from("account_adjustments").insert({
        user_id: user.id,
        account_id: id,
        date: todayInAppZone(),
        amount: delta,
        previous_balance: live.balance,
        new_balance: actual,
        note: typeof body.adjustment_note === "string" ? body.adjustment_note.slice(0, 200) : "",
      });
      if (adjError) {
        const status = isMissingTable(adjError) ? 503 : 500;
        const message = isMissingTable(adjError)
          ? "Balance matching needs the 20261110200000_account_balance_adjustments migration applied first"
          : adjError.message;
        return NextResponse.json({ error: message }, { status });
      }
    }
  }

  if (row.is_default) {
    await supabase.from("accounts").update({ is_default: false }).eq("user_id", user.id).neq("id", id);
  }

  const { data, error } = await supabase
    .from("accounts")
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Linked expenses/income keep their records (account is cleared); transfers involving it are removed.
  const { error } = await supabase
    .from("accounts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
