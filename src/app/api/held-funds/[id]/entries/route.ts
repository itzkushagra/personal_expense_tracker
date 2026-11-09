import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

async function getBalance(supabase: SupabaseClient, fundId: string, userId: string) {
  const { data } = await supabase
    .from("held_fund_entries")
    .select("type, amount")
    .eq("held_fund_id", fundId)
    .eq("user_id", userId);
  return (data || []).reduce(
    (s, e) => s + (e.type === "received" ? Number(e.amount) : -Number(e.amount)),
    0
  );
}

async function syncSettled(supabase: SupabaseClient, fundId: string, userId: string) {
  const balance = await getBalance(supabase, fundId, userId);
  await supabase
    .from("held_funds")
    .update({ is_settled: balance <= 0, updated_at: new Date().toISOString() })
    .eq("id", fundId)
    .eq("user_id", userId);
  return balance;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { type, amount, date, note } = await request.json();
  const value = Number(amount);
  if ((type !== "received" && type !== "returned") || !(value > 0)) {
    return NextResponse.json({ error: "Invalid entry" }, { status: 400 });
  }

  const { data: fund } = await supabase
    .from("held_funds")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!fund) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (type === "returned") {
    const balance = await getBalance(supabase, id, user.id);
    if (value > balance + 0.005) {
      return NextResponse.json(
        { error: `You only hold ₹${balance.toLocaleString("en-IN")} for this person` },
        { status: 400 }
      );
    }
  }

  const { data, error } = await supabase
    .from("held_fund_entries")
    .insert({
      held_fund_id: id,
      user_id: user.id,
      type,
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
