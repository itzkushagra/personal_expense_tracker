import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayInAppZone } from "@/lib/dates";
import { movesBalanceForInsert, writeErrorMessage } from "@/lib/record-only";
import {
  type LoanDirection,
  type PersonLoan,
  type PersonLoanEntry,
  type PersonLoanWithBalance,
  loanBalance,
  loanEntryTypes,
} from "@/types";

const DIRECTIONS: LoanDirection[] = ["holding", "borrowed", "lent"];

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: loans, error } = await supabase
    .from("held_funds")
    .select("*, entries:held_fund_entries(*)")
    .eq("user_id", user.id)
    .order("is_settled", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const data: PersonLoanWithBalance[] = (loans || []).map((l: PersonLoan & { entries: PersonLoanEntry[] }) => {
    const entries = [...(l.entries || [])].sort((a, b) => b.date.localeCompare(a.date));
    return { ...l, entries, ...loanBalance(l.direction, entries) };
  });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { amount, date, note, person_name, relation, direction, purpose, expected_return_date, account_id } = body;
  if (!person_name || !(Number(amount) > 0) || !DIRECTIONS.includes(direction)) {
    return NextResponse.json({ error: "Person, type and a positive amount are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("held_funds")
    .insert({
      user_id: user.id,
      person_name,
      relation: relation || "friend",
      direction,
      purpose: purpose || "",
      expected_return_date: expected_return_date || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { error: entryError } = await supabase.from("held_fund_entries").insert({
    held_fund_id: data.id,
    user_id: user.id,
    type: loanEntryTypes(direction).principal,
    amount: Number(amount),
    date: date || todayInAppZone(),
    note: note || "",
    account_id: account_id || null,
    ...movesBalanceForInsert(body),
  });

  if (entryError) {
    await supabase.from("held_funds").delete().eq("id", data.id).eq("user_id", user.id);
    return NextResponse.json({ error: writeErrorMessage(entryError) }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
