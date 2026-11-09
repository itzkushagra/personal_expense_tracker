import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("bill_payments")
    .select("*")
    .eq("bill_id", id)
    .eq("user_id", user.id)
    .order("paid_date", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // create_expense (default true) also records the payment as an expense, so
  // marking a bill paid shows up in spending and budgets without a second entry.
  const { create_expense = true, ...body } = await request.json();
  const { data, error } = await supabase
    .from("bill_payments")
    .insert({ ...body, bill_id: id, user_id: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: bill } = await supabase
    .from("bills")
    .select("name, category, frequency, next_due_date")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (bill && create_expense) {
    await supabase.from("expenses").insert({
      user_id: user.id,
      amount: data.amount_paid,
      description: bill.name,
      category: bill.category || "Bills & Utilities",
      date: data.paid_date,
      input_method: "manual",
      ai_categorized: false,
      is_recurring: true,
    });
  }

  if (bill) {
    const next = new Date(bill.next_due_date);
    switch (bill.frequency) {
      case "weekly": next.setDate(next.getDate() + 7); break;
      case "monthly": next.setMonth(next.getMonth() + 1); break;
      case "quarterly": next.setMonth(next.getMonth() + 3); break;
      case "yearly": next.setFullYear(next.getFullYear() + 1); break;
    }
    await supabase
      .from("bills")
      .update({ next_due_date: next.toISOString().split("T")[0] })
      .eq("id", id);
  }

  return NextResponse.json({ data }, { status: 201 });
}
