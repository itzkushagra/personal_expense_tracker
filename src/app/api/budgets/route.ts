import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pick, WRITABLE } from "@/lib/api-fields";
import { currentMonthInAppZone, monthRange } from "@/lib/dates";
import { outOfPocket } from "@/types";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: budgets, error } = await supabase
    .from("budgets")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("category");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // "This month" in India, even when the server clock runs on UTC.
  const now = currentMonthInAppZone();
  const { start: monthStart, end: monthEnd } = monthRange(now.year, now.month);

  const { data: expenses } = await supabase
    .from("expenses")
    .select("category, amount, is_reimbursable, reimbursement_status, reimbursed_amount")
    .eq("user_id", user.id)
    .gte("date", monthStart)
    .lte("date", monthEnd);

  // Company-reimbursable spends don't eat into your own budget.
  const spentByCategory: Record<string, number> = {};
  for (const exp of expenses || []) {
    spentByCategory[exp.category] = (spentByCategory[exp.category] || 0) + outOfPocket(exp);
  }

  const enriched = (budgets || []).map((b) => {
    const spent = spentByCategory[b.category] || 0;
    return {
      ...b,
      spent,
      remaining: Math.max(0, Number(b.amount) - spent),
      percentage: Number(b.amount) > 0 ? (spent / Number(b.amount)) * 100 : 0,
    };
  });

  return NextResponse.json({ data: enriched });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { data, error } = await supabase
    .from("budgets")
    .insert({ ...pick(body, WRITABLE.budgets), user_id: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
