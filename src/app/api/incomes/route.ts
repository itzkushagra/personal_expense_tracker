import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { monthRange, todayInAppZone } from "@/lib/dates";

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
  const pending = searchParams.get("pending");

  let query = supabase
    .from("incomes")
    .select("*")
    .eq("user_id", user.id)
    .order("date", { ascending: false });

  // Month filters use the day the money arrives (or is expected), because
  // that is the month it is there to spend: October's salary paid on
  // 3 November is November's money. for_month only records which month the
  // work was for.
  if (month && year) {
    const { start, end } = monthRange(Number(year), Number(month));
    query = query.gte("date", start).lte("date", end);
  } else if (from) {
    query = query.gte("date", monthStart(from));
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

  const { amount, source, type, date, for_month, is_received, note } = await request.json();
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
      note: note || "",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
