import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateTips } from "@/lib/gemini";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { month, year } = await request.json();
  const m = month || new Date().getMonth() + 1;
  const y = year || new Date().getFullYear();

  const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
  const endDate = new Date(y, m, 0).toISOString().split("T")[0];

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

  const totalSpent = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  const categoryBreakdown: Record<string, number> = {};
  for (const expense of expenses) {
    categoryBreakdown[expense.category] =
      (categoryBreakdown[expense.category] || 0) + Number(expense.amount);
  }

  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  const prevStartDate = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
  const prevEndDate = new Date(prevYear, prevMonth, 0).toISOString().split("T")[0];

  const { data: prevExpenses } = await supabase
    .from("expenses")
    .select("amount")
    .eq("user_id", user.id)
    .gte("date", prevStartDate)
    .lte("date", prevEndDate);

  const prevTotal =
    prevExpenses && prevExpenses.length > 0
      ? prevExpenses.reduce((sum, e) => sum + Number(e.amount), 0)
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
