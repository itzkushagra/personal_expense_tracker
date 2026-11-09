import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");
  const year = searchParams.get("year");
  const from = searchParams.get("from");

  let query = supabase
    .from("incomes")
    .select("*")
    .eq("user_id", user.id)
    .order("date", { ascending: false });

  if (month && year) {
    const startDate = `${year}-${month.padStart(2, "0")}-01`;
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
    query = query.gte("date", startDate).lte("date", `${year}-${month.padStart(2, "0")}-${lastDay}`);
  } else if (from) {
    query = query.gte("date", from);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { amount, source, type, date, note } = await request.json();
  if (!(Number(amount) > 0) || !source) {
    return NextResponse.json({ error: "Amount and source are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("incomes")
    .insert({
      user_id: user.id,
      amount: Number(amount),
      source,
      type: type || "salary",
      date: date || new Date().toISOString().split("T")[0],
      note: note || "",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
