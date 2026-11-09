import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateTips } from "@/lib/gemini";
import { currentMonthInAppZone, monthRange } from "@/lib/dates";
import { outOfPocket } from "@/types";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { month, year } = await request.json();
  const now = currentMonthInAppZone();
  const m = Number(month) || now.month;
  const y = Number(year) || now.year;
  const { start: startDate, end: endDate } = monthRange(y, m);

  const { data: expenses } = await supabase
    .from("expenses")
    .select("*")
    .eq("user_id", user.id)
    .gte("date", startDate)
    .lte("date", endDate);

  if (!expenses || expenses.length === 0) {
    return NextResponse.json({
      tips: ["Start adding expenses to get personalized saving tips!"],
    });
  }

  // Same rules as the dashboard: savings and company-reimbursed spends aren't your spending.
  const totalSpent = expenses.reduce((sum, e) => sum + outOfPocket(e), 0);

  const categoryBreakdown: Record<string, number> = {};
  for (const expense of expenses) {
    const own = outOfPocket(expense);
    if (own > 0) categoryBreakdown[expense.category] = (categoryBreakdown[expense.category] || 0) + own;
  }

  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  const { start: prevStartDate, end: prevEndDate } = monthRange(prevYear, prevMonth);

  const { data: prevExpenses } = await supabase
    .from("expenses")
    .select("amount, category, is_reimbursable, reimbursement_status, reimbursed_amount")
    .eq("user_id", user.id)
    .gte("date", prevStartDate)
    .lte("date", prevEndDate);

  const prevTotal =
    prevExpenses && prevExpenses.length > 0
      ? prevExpenses.reduce((sum, e) => sum + outOfPocket(e), 0)
      : null;

  try {
    const tips = await generateTips(categoryBreakdown, totalSpent, prevTotal);
    return NextResponse.json({ tips });
  } catch (error) {
    console.error("Tips error:", error);
    return NextResponse.json({
      tips: ["Track your expenses regularly to build better spending habits."],
    });
  }
}
