import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { HeldFund, HeldFundEntry, HeldFundWithBalance } from "@/types";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: funds, error } = await supabase
    .from("held_funds")
    .select("*, entries:held_fund_entries(*)")
    .eq("user_id", user.id)
    .order("is_settled", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const data: HeldFundWithBalance[] = (funds || []).map((f: HeldFund & { entries: HeldFundEntry[] }) => {
    const entries = [...(f.entries || [])].sort((a, b) => b.date.localeCompare(a.date));
    const total_received = entries.filter((e) => e.type === "received").reduce((s, e) => s + Number(e.amount), 0);
    const total_returned = entries.filter((e) => e.type === "returned").reduce((s, e) => s + Number(e.amount), 0);
    return { ...f, entries, total_received, total_returned, balance: total_received - total_returned };
  });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { amount, date, note, ...fund } = await request.json();
  if (!fund.person_name || !(Number(amount) > 0)) {
    return NextResponse.json({ error: "Person and a positive amount are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("held_funds")
    .insert({ ...fund, user_id: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { error: entryError } = await supabase.from("held_fund_entries").insert({
    held_fund_id: data.id,
    user_id: user.id,
    type: "received",
    amount: Number(amount),
    date: date || new Date().toISOString().split("T")[0],
    note: note || "",
  });

  if (entryError) {
    await supabase.from("held_funds").delete().eq("id", data.id).eq("user_id", user.id);
    return NextResponse.json({ error: entryError.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
