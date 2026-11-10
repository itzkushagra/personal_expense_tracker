import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** How many records aren't linked to any account yet. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const count = async (table: string, extra?: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
    let q = base(table);
    if (extra) q = extra(q);
    const { count } = await q;
    return count || 0;
  };
  const base = (table: string) =>
    supabase.from(table).select("id", { count: "exact", head: true }).eq("user_id", user.id).is("account_id", null);

  const [expenses, incomes, loan_entries] = await Promise.all([
    count("expenses"),
    count("incomes", (q) => q.eq("is_received", true)),
    count("held_fund_entries"),
  ]);
  return NextResponse.json({ data: { expenses, incomes, loan_entries } });
}

/**
 * Link every unlinked record of the given kinds to one account.
 * Body: { account_id, kinds: ("expenses" | "incomes" | "loan_entries")[], from?: "YYYY-MM-DD" }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { account_id, kinds, from } = await request.json();
  if (!account_id || !Array.isArray(kinds) || kinds.length === 0) {
    return NextResponse.json({ error: "account_id and kinds are required" }, { status: 400 });
  }
  const { data: account } = await supabase.from("accounts").select("id").eq("id", account_id).eq("user_id", user.id).maybeSingle();
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const tables: Record<string, string> = { expenses: "expenses", incomes: "incomes", loan_entries: "held_fund_entries" };
  const linked: Record<string, number> = {};
  for (const kind of kinds) {
    const table = tables[kind];
    if (!table) continue;
    let q = supabase.from(table).update({ account_id }, { count: "exact" }).eq("user_id", user.id).is("account_id", null);
    if (from) q = q.gte("date", from);
    const { error, count } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    linked[kind] = count || 0;
  }
  return NextResponse.json({ data: linked });
}
