import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/ledger";
import { cashAmount } from "@/lib/portfolio";
import type { InvestmentPurchase } from "@/lib/invested";

const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/**
 * Cash put into holdings between ?from and ?to (inclusive, YYYY-MM-DD): one row per buy,
 * for the "invested" totals on Income, Yearly and Budgets. Sales and units already owned
 * ("opening") aren't money invested in the period, so they're left out.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  if (!isDate(from) || !isDate(to) || from > to) {
    return NextResponse.json({ error: "from and to must be dates (YYYY-MM-DD), from on or before to" }, { status: 400 });
  }

  try {
    // Before the portfolio migration the table doesn't exist: no purchases.
    const rows = await fetchAll<{ date: string; type: "buy"; quantity: number; price: number; fees: number }>(
      (f, t) =>
        supabase
          .from("investment_transactions")
          .select("date, type, quantity, price, fees")
          .eq("user_id", user.id)
          .eq("type", "buy")
          .gte("date", from)
          .lte("date", to)
          .order("date")
          .range(f, t),
      { optional: true }
    );
    const data: InvestmentPurchase[] = rows.map((r) => ({ date: r.date, amount: cashAmount(r) }));
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load purchases" }, { status: 500 });
  }
}
