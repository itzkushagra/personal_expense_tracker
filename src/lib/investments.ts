import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvestmentHolding, InvestmentTransaction } from "@/types";
import { fetchAll } from "@/lib/ledger";
import {
  type HoldingSummary,
  type PortfolioSummary,
  isMissingTable,
  summarizeHolding,
  summarizePortfolio,
} from "@/lib/portfolio";

export interface HoldingWithSummary extends InvestmentHolding {
  transactions: InvestmentTransaction[];
  summary: HoldingSummary;
}

export interface PortfolioData {
  /** False until the investment_portfolio migration has been applied. */
  available: boolean;
  holdings: HoldingWithSummary[];
  summary: PortfolioSummary;
  /**
   * "Investments" expenses recorded before portfolio tracking. Their cash already left your
   * accounts but which holding they bought can't be known, so they aren't turned into holdings.
   */
  legacy: { count: number; total: number };
}

const EMPTY_SUMMARY: PortfolioSummary = {
  invested: 0,
  current_value: 0,
  unrealized_gain: 0,
  unrealized_pct: null,
  realized_gain: 0,
  allocation: [],
  holding_count: 0,
};

/** Every holding with its transactions and figures, plus the portfolio totals. */
export async function loadPortfolio(
  supabase: SupabaseClient,
  userId: string,
  { includeLegacy = false }: { includeLegacy?: boolean } = {}
): Promise<PortfolioData> {
  const { data: holdings, error } = await supabase
    .from("investment_holdings")
    .select("*")
    .eq("user_id", userId)
    .order("name");

  const legacy = includeLegacy ? await legacyInvestmentExpenses(supabase, userId) : { count: 0, total: 0 };
  if (error) {
    if (isMissingTable(error)) return { available: false, holdings: [], summary: EMPTY_SUMMARY, legacy };
    throw new Error(error.message);
  }

  const txns = await fetchAll<InvestmentTransaction>((f, t) =>
    supabase.from("investment_transactions").select("*").eq("user_id", userId).order("date").order("created_at").range(f, t)
  );
  const byHolding = new Map<string, InvestmentTransaction[]>();
  for (const t of txns) {
    const list = byHolding.get(t.holding_id) ?? [];
    list.push(t);
    byHolding.set(t.holding_id, list);
  }

  const rows: HoldingWithSummary[] = ((holdings || []) as InvestmentHolding[]).map((h) => {
    const list = byHolding.get(h.id) ?? [];
    return { ...h, transactions: list, summary: summarizeHolding(h, list) };
  });

  return { available: true, holdings: rows, summary: summarizePortfolio(rows), legacy };
}

async function legacyInvestmentExpenses(supabase: SupabaseClient, userId: string) {
  const rows = await fetchAll<{ amount: number }>((f, t) =>
    supabase.from("expenses").select("amount").eq("user_id", userId).eq("category", "Investments").range(f, t)
  );
  return { count: rows.length, total: Math.round(rows.reduce((s, r) => s + Number(r.amount), 0) * 100) / 100 };
}
