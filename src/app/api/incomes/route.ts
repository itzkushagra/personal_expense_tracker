import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayInAppZone } from "@/lib/dates";
import { movesBalanceForInsert, writeErrorMessage } from "@/lib/record-only";

/** First day of the month containing a YYYY-MM-DD date. */
function monthStart(date: string) {
  return `${date.slice(0, 7)}-01`;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");
  const year = searchParams.get("year");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const pending = searchParams.get("pending");

  let query = supabase
    .from("incomes")
    .select("*")
    .eq("user_id", user.id)
    .order("for_month", { ascending: false })
    .order("date", { ascending: false });

  // Month filters apply to the month the income was earned for (for_month), not the
  // day it arrived: salary paid on 10 September is August's salary.
  if (month && year) {
    query = query.eq("for_month", `${year}-${month.padStart(2, "0")}-01`);
  } else {
    if (from) query = query.gte("for_month", monthStart(from));
    if (to) query = query.lte("for_month", monthStart(to));
  }
  if (pending) query = query.eq("is_received", false);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { amount, source, type, date, for_month, is_received, note, account_id } = body;
  if (!(Number(amount) > 0) || !source) {
    return NextResponse.json({ error: "Amount and source are required" }, { status: 400 });
  }

  const day = date || todayInAppZone();
  const { data, error } = await supabase
    .from("incomes")
    .insert({
      user_id: user.id,
      amount: Number(amount),
      source,
      type: type || "salary",
      date: day,
      for_month: monthStart(for_month || day),
      is_received: is_received ?? true,
      account_id: account_id || null,
      note: note || "",
      ...movesBalanceForInsert(body),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: writeErrorMessage(error) }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
