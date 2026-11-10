import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { InvestmentTransaction } from "@/types";
import { validateTransactions } from "@/lib/portfolio";

/** Delete one transaction, unless a later sale would then be selling units you no longer had. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; txId: string }> }
) {
  const { id, txId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: txns, error: loadError } = await supabase
    .from("investment_transactions")
    .select("id, type, date, quantity, price, fees, created_at")
    .eq("holding_id", id)
    .eq("user_id", user.id);
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  const list = (txns || []) as InvestmentTransaction[];
  if (!list.some((t) => t.id === txId)) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  const problem = validateTransactions(list.filter((t) => t.id !== txId));
  if (problem) {
    return NextResponse.json({ error: `Delete the later sale first. Without this entry: ${problem}` }, { status: 400 });
  }

  const { error } = await supabase
    .from("investment_transactions")
    .delete()
    .eq("id", txId)
    .eq("holding_id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
