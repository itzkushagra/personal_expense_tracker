import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

  const { data: expenses } = await supabase
    .from("expenses")
    .select("category, amount")
    .eq("user_id", user.id)
    .gte("date", monthStart)
    .lte("date", monthEnd);

  const spentByCategory: Record<string, number> = {};
  for (const exp of expenses || []) {
    spentByCategory[exp.category] = (spentByCategory[exp.category] || 0) + Number(exp.amount);
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
    .insert({ ...body, user_id: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
