import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { currentMonthInAppZone, monthRange } from "@/lib/dates";
import { generateTips } from "@/lib/gemini";
import { outOfPocket } from "@/types";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const now = currentMonthInAppZone();
  const month = parseInt(searchParams.get("month") || String(now.month));
  const year = parseInt(searchParams.get("year") || String(now.year));

  const { data: existing } = await supabase
    .from("monthly_summaries")
    .select("*")
    .eq("user_id", user.id)
    .eq("month", month)
    .eq("year", year)
    .single();

  if (existing) {
    return NextResponse.json({ data: existing });
  }

  return NextResponse.json({ data: null });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { month, year } = await request.json();

  const { start: startDate, end: endDate } = monthRange(Number(year), Number(month));

  const { data: expenses } = await supabase
    .from("expenses")
    .select("*")
    .eq("user_id", user.id)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("amount", { ascending: false });

  if (!expenses || expenses.length === 0) {
    return NextResponse.json(
      { error: "No expenses found for this month" },
      { status: 404 }
    );
  }

  const totalSpent = expenses.reduce((sum, e) => sum + outOfPocket(e), 0);

  const categoryBreakdown: Record<string, number> = {};
  for (const expense of expenses) {
    const own = outOfPocket(expense);
    if (own > 0) {
      categoryBreakdown[expense.category] =
        (categoryBreakdown[expense.category] || 0) + own;
    }
  }

  const topExpenses = expenses.slice(0, 5);

  let comparison = null;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const { start: prevStartDate, end: prevEndDate } = monthRange(prevYear, prevMonth);

  const { data: prevExpenses } = await supabase
    .from("expenses")
    .select("amount, category, is_reimbursable, reimbursement_status, reimbursed_amount")
    .eq("user_id", user.id)
    .gte("date", prevStartDate)
    .lte("date", prevEndDate);

  if (prevExpenses && prevExpenses.length > 0) {
    const prevTotal = prevExpenses.reduce(
      (sum, e) => sum + outOfPocket(e),
      0
    );
    comparison = {
      prev_total: prevTotal,
      change_pct: ((totalSpent - prevTotal) / prevTotal) * 100,
    };
  }

  let tips: string[] = [];
  try {
    tips = await generateTips(
      categoryBreakdown,
      totalSpent,
      comparison?.prev_total ?? null
    );
  } catch (error) {
    console.error("Tips generation error:", error);
    tips = ["Track your daily expenses to identify spending patterns."];
  }

  const { data, error } = await supabase
    .from("monthly_summaries")
    .upsert(
      {
        user_id: user.id,
        month,
        year,
        total_spent: totalSpent,
        category_breakdown: categoryBreakdown,
        top_expenses: topExpenses,
        tips,
        comparison,
      },
      { onConflict: "user_id,month,year" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
