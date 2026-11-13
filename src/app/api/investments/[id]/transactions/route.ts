import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { InvestmentTransaction } from "@/types";
import { parseTransactionInput, transactionRow, validateTransactions } from "@/lib/portfolio";
import { writeErrorMessage } from "@/lib/record-only";

/** Record a buy, a sale, or units you already own ("opening") on one of your holdings. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = parseTransactionInput(await request.json());
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data: holding } = await supabase
    .from("investment_holdings")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!holding) return NextResponse.json({ error: "Holding not found" }, { status: 404 });

  // A sale can't sell more units than are held on its date (earlier sales included).
  const { data: existing, error: loadError } = await supabase
    .from("investment_transactions")
    .select("type, date, quantity, price, fees, created_at")
    .eq("holding_id", id)
    .eq("user_id", user.id);
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  const problem = validateTransactions([
    ...((existing || []) as InvestmentTransaction[]),
    { ...parsed.value, created_at: new Date().toISOString() },
  ]);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const { data, error } = await supabase
    .from("investment_transactions")
    .insert({ ...transactionRow(parsed.value), holding_id: id, user_id: user.id })
    .select()
    .single();
  if (error) {
    // uq_investment_transactions_sip_month: one instalment per SIP per month.
    if (error.code === "23505" && parsed.value.sip_id) {
      return NextResponse.json({ error: "This SIP is already logged for that month" }, { status: 409 });
    }
    return NextResponse.json({ error: writeErrorMessage(error) }, { status: 400 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
