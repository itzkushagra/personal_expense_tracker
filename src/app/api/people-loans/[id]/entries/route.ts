import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type LoanDirection, loanBalance, loanEntryTypes } from "@/types";

async function getLoan(supabase: SupabaseClient, id: string, userId: string) {
  const { data } = await supabase
    .from("held_funds")
    .select("id, direction, entries:held_fund_entries(type, amount)")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  return data as { id: string; direction: LoanDirection; entries: { type: "in" | "out"; amount: number }[] } | null;
}

async function syncSettled(supabase: SupabaseClient, id: string, userId: string) {
  const loan = await getLoan(supabase, id, userId);
  if (!loan) return 0;
  const { balance } = loanBalance(loan.direction, loan.entries);
  await supabase
    .from("held_funds")
    .update({ is_settled: balance <= 0, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  return balance;
}

/**
 * Body: { kind: "principal" | "repayment", amount, date?, note? }
 * principal = more money added to the record; repayment = paying back / being paid back.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { kind, amount, date, note } = await request.json();
  const value = Number(amount);
  if ((kind !== "principal" && kind !== "repayment") || !(value > 0)) {
    return NextResponse.json({ error: "Invalid entry" }, { status: 400 });
  }

  const loan = await getLoan(supabase, id, user.id);
  if (!loan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (kind === "repayment") {
    const { balance } = loanBalance(loan.direction, loan.entries);
    if (value > balance + 0.005) {
      return NextResponse.json(
        { error: `Only ₹${balance.toLocaleString("en-IN")} is outstanding` },
        { status: 400 }
      );
    }
  }

  const types = loanEntryTypes(loan.direction);
  const { data, error } = await supabase
    .from("held_fund_entries")
    .insert({
      held_fund_id: id,
      user_id: user.id,
      type: kind === "principal" ? types.principal : types.repayment,
      amount: value,
      date: date || new Date().toISOString().split("T")[0],
      note: note || "",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const balance = await syncSettled(supabase, id, user.id);
  return NextResponse.json({ data, balance }, { status: 201 });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entryId = new URL(request.url).searchParams.get("entry_id");
  if (!entryId) return NextResponse.json({ error: "entry_id is required" }, { status: 400 });

  const { error } = await supabase
    .from("held_fund_entries")
    .delete()
    .eq("id", entryId)
    .eq("held_fund_id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const balance = await syncSettled(supabase, id, user.id);
  return NextResponse.json({ success: true, balance });
}
