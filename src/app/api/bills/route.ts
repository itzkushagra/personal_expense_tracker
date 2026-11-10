import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pick, WRITABLE } from "@/lib/api-fields";
import { validateBillSetup } from "@/lib/bill-payments";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("bills")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("next_due_date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Part payments already made toward each bill's current due date.
  const bills = data || [];
  const paid: Record<string, number> = {};
  if (bills.length) {
    const { data: payments } = await supabase
      .from("bill_payments")
      .select("bill_id, occurrence_date, amount_paid")
      .eq("user_id", user.id)
      .is("reversed_at", null)
      .in("bill_id", bills.map((b) => b.id));
    for (const p of payments || []) {
      const bill = bills.find((b) => b.id === p.bill_id);
      if (bill && p.occurrence_date === bill.next_due_date) paid[p.bill_id] = (paid[p.bill_id] || 0) + Number(p.amount_paid);
    }
  }
  return NextResponse.json({ data: bills.map((b) => ({ ...b, paid_toward_due: paid[b.id] || 0 })) });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  // A card or EMI bill must say what it pays off, or marking it paid can't be accounted for.
  if (body.kind !== undefined) {
    const setupError = validateBillSetup(body);
    if (setupError) return NextResponse.json({ error: setupError }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("bills")
    .insert({ ...pick(body, WRITABLE.bills), user_id: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
