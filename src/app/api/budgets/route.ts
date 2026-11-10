import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pick, WRITABLE } from "@/lib/api-fields";
import { todayInAppZone } from "@/lib/dates";
import { budgetSpent, budgetWindow, spanOf } from "@/lib/budgets";
import { fetchAll } from "@/lib/ledger";

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

  // Each budget is measured over its own period (this month, this week's cycle, or its
  // custom dates) in India's time zone, not always over the whole month.
  const today = todayInAppZone();
  const windows = (budgets || []).map((b) => budgetWindow(b, today));
  const span = spanOf(windows);

  type Row = Parameters<typeof budgetSpent>[2][number];
  const categories = [...new Set((budgets || []).map((b) => b.category))];
  // Paged: a long custom budget can cover more than one response's worth of rows.
  const expenses = span
    ? await fetchAll<Row>((from, to) =>
        supabase
          .from("expenses")
          .select("date, category, amount, is_reimbursable, reimbursement_status, reimbursed_amount")
          .eq("user_id", user.id)
          .in("category", categories)
          .gte("date", span.start)
          .lte("date", span.end)
          .order("id")
          .range(from, to)
      )
    : [];

  // Company-reimbursable spends and savings don't eat into your own budget (outOfPocket).
  const enriched = (budgets || []).map((b, i) => {
    const spent = budgetSpent(b, windows[i], expenses);
    return {
      ...b,
      window_start: windows[i].start,
      window_end: windows[i].end,
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
