import { uncoveredInvestmentExpenses } from "@/lib/invested";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvestmentHolding, InvestmentSip, InvestmentTransaction } from "@/types";
import { fetchAll } from "@/lib/ledger";
import { todayInAppZone } from "@/lib/dates";
import {
  type HoldingSummary,
  type PortfolioSummary,
  type SipStatus,
  isMissingTable,
  sipStatus,
  summarizeHolding,
  summarizePortfolio,
} from "@/lib/portfolio";

export interface HoldingWithSummary extends InvestmentHolding {
  transactions: InvestmentTransaction[];
  summary: HoldingSummary;
}

export interface SipWithStatus extends InvestmentSip {
  holding_name: string;
  status: SipStatus;
}

export interface PortfolioData {
  /** False until the investment_portfolio migration has been applied. */
  available: boolean;
  /** False until the investment_sips migration (SIPs, fund categories) has been applied. */
  sips_available: boolean;
  holdings: HoldingWithSummary[];
  sips: SipWithStatus[];
  summary: PortfolioSummary;
  /**
   * "Investments" expenses the portfolio doesn't account for: no buy in the same month and no
   * "already owned" entry after them. Their cash already left your accounts but which holding
   * they bought can't be known, so they aren't turned into holdings.
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
  by_fund_category: [],
  holding_count: 0,
};

/** Every holding with its transactions and figures, SIPs with this month's status, and totals. */
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

  const legacyRows = includeLegacy ? await investmentExpenses(supabase, userId) : [];
  if (error) {
    if (isMissingTable(error)) {
      const legacy = uncoveredInvestmentExpenses(legacyRows, []);
      return { available: false, sips_available: false, holdings: [], sips: [], summary: EMPTY_SUMMARY, legacy };
    }
    throw new Error(error.message);
  }

  const [txns, sipRows] = await Promise.all([
    fetchAll<InvestmentTransaction>((f, t) =>
      supabase.from("investment_transactions").select("*").eq("user_id", userId).order("date").order("created_at").range(f, t)
    ),
    supabase.from("investment_sips").select("*").eq("user_id", userId).order("day_of_month"),
  ]);
  const sipsAvailable = !isMissingTable(sipRows.error);
  if (sipRows.error && sipsAvailable) throw new Error(sipRows.error.message);

  const byHolding = new Map<string, InvestmentTransaction[]>();
  for (const t of txns) {
    const list = byHolding.get(t.holding_id) ?? [];
    list.push(t);
    byHolding.set(t.holding_id, list);
  }

  const rows: HoldingWithSummary[] = ((holdings || []) as InvestmentHolding[]).map((h) => {
    const list = byHolding.get(h.id) ?? [];
    return { ...h, fund_category: h.fund_category ?? "", transactions: list, summary: summarizeHolding(h, list) };
  });

  const today = todayInAppZone();
  const names = new Map(rows.map((h) => [h.id, h.name]));
  const sips: SipWithStatus[] = ((sipsAvailable ? sipRows.data : []) as InvestmentSip[] | null ?? []).map((s) => ({
    ...s,
    holding_name: names.get(s.holding_id) ?? "",
    status: sipStatus(s, byHolding.get(s.holding_id) ?? [], today),
  }));

  return {
    available: true,
    sips_available: sipsAvailable,
    holdings: rows,
    sips,
    summary: summarizePortfolio(rows),
    legacy: uncoveredInvestmentExpenses(legacyRows, txns),
  };
}

function investmentExpenses(supabase: SupabaseClient, userId: string) {
  return fetchAll<{ date: string; amount: number }>((f, t) =>
    supabase.from("expenses").select("date, amount").eq("user_id", userId).eq("category", "Investments").range(f, t)
  );
}
