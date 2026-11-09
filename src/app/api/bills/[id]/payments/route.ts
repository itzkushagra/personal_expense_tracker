import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pick, WRITABLE } from "@/lib/api-fields";
import { addDays, addMonths } from "@/lib/dates";

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

  // The bill must be the caller's own: row security alone would let a payment
  // row point at someone else's bill id.
  const { data: owned } = await supabase.from("bills").select("id").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!owned) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("bill_payments")
    .insert({ ...pick(body, WRITABLE.bill_payments), bill_id: id, user_id: user.id })
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
    const { error: expenseError } = await supabase.from("expenses").insert({
      user_id: user.id,
      amount: data.amount_paid,
      description: bill.name,
      category: bill.category || "Bills & Utilities",
      date: data.paid_date,
      input_method: "manual",
      ai_categorized: false,
      is_recurring: true,
    });
    // Previously ignored: the payment was saved but the expense silently wasn't.
    if (expenseError) {
      await supabase.from("bill_payments").delete().eq("id", data.id).eq("user_id", user.id);
      return NextResponse.json(
        { error: `Could not add the payment to expenses: ${expenseError.message}` },
        { status: 500 }
      );
    }
  }

  if (bill) {
    // Plain date maths: no UTC shift, and 31 Jan + 1 month lands on 28/29 Feb, not 3 Mar.
    const due: string = bill.next_due_date;
    const next =
      bill.frequency === "weekly" ? addDays(due, 7)
      : bill.frequency === "quarterly" ? addMonths(due, 3)
      : bill.frequency === "yearly" ? addMonths(due, 12)
      : addMonths(due, 1);
    await supabase
      .from("bills")
      .update({ next_due_date: next })
      .eq("id", id)
      .eq("user_id", user.id);
  }

  return NextResponse.json({ data }, { status: 201 });
}

// Removes a payment record (?payment_id=). Any expense it created stays in Expenses and can be deleted there.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const paymentId = new URL(request.url).searchParams.get("payment_id");
  if (!paymentId) return NextResponse.json({ error: "payment_id is required" }, { status: 400 });

  const { error } = await supabase
    .from("bill_payments")
    .delete()
    .eq("id", paymentId)
    .eq("bill_id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
