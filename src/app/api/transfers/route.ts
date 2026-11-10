import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("transfers")
    .select("*")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { from_account_id, to_account_id, amount, date, note } = await request.json();
  if (!from_account_id || !to_account_id || from_account_id === to_account_id || !(Number(amount) > 0)) {
    return NextResponse.json({ error: "Pick two different accounts and a positive amount" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("transfers")
    .insert({
      user_id: user.id,
      from_account_id,
      to_account_id,
      amount: Number(amount),
      date: date || new Date().toISOString().split("T")[0],
      note: note || "",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
