import type { SupabaseClient } from "@supabase/supabase-js";
import { type LoanDirection, loanBalance, reimbursementDue } from "@/types";

export interface NetWorthBreakdown {
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  /** Account balances plus deposit / reimbursements / held money adjustments. */
  breakdown: Record<string, number>;
  /** Money owed to you or by you beyond plain account balances. */
  adjustments: {
    security_deposit: number;
    pending_reimbursements: number;
    /** Held for, or borrowed from, friends & family. */
    owed_by_you: number;
    /** Lent to friends & family. */
    owed_to_you: number;
    /** Active Debt Tracker balances not already counted as accounts. */
    tracked_debt: number;
  };
  account_count: number;
}

export async function computeNetWorth(supabase: SupabaseClient, userId: string): Promise<NetWorthBreakdown> {
  const [{ data: accounts }, { data: rental }, { data: loans }, { data: debts }, { data: claims }] = await Promise.all([
    supabase.from("accounts").select("name, type, balance").eq("user_id", userId).eq("is_active", true),
    supabase.from("rentals").select("security_deposit").eq("user_id", userId).maybeSingle(),
    supabase
      .from("held_funds")
      .select("direction, entries:held_fund_entries(type, amount)")
      .eq("user_id", userId)
      .eq("is_settled", false),
    supabase.from("debts").select("name, current_balance").eq("user_id", userId).eq("is_active", true),
    supabase
      .from("expenses")
      .select("amount, is_reimbursable, reimbursement_status")
      .eq("user_id", userId)
      .eq("is_reimbursable", true)
      .in("reimbursement_status", ["pending", "submitted"]),
  ]);

  const breakdown: Record<string, number> = {};
  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const acc of accounts || []) {
    breakdown[acc.name] = Number(acc.balance);
    if (acc.type === "credit_card" || acc.type === "loan") {
      totalLiabilities += Math.abs(Number(acc.balance));
    } else {
      totalAssets += Number(acc.balance);
    }
  }

  // Refundable rent deposit and pending company claims are money owed to you.
  const deposit = Number(rental?.security_deposit || 0);
  if (deposit > 0) {
    breakdown["Rent security deposit"] = deposit;
    totalAssets += deposit;
  }
  const claimsDue = (claims || []).reduce((s, e) => s + reimbursementDue(e), 0);
  if (claimsDue > 0) {
    breakdown["Pending reimbursements"] = claimsDue;
    totalAssets += claimsDue;
  }

  // Debt Tracker entries (EMIs, personal loans, credit cards) are liabilities.
  // Credit-card accounts already carry their own balance, so only count tracked
  // debts by name when no account of the same name exists.
  const accountNames = new Set((accounts || []).map((a) => a.name.trim().toLowerCase()));
  let trackedDebt = 0;
  for (const d of debts || []) {
    if (accountNames.has(d.name.trim().toLowerCase())) continue;
    const bal = Math.max(0, Number(d.current_balance));
    if (bal > 0) {
      breakdown[`Debt: ${d.name}`] = -bal;
      trackedDebt += bal;
    }
  }
  totalLiabilities += trackedDebt;

  // People & Loans: money you hold for / borrowed from others is a liability,
  // money you lent out is an asset.
  let owedByYou = 0;
  let owedToYou = 0;
  for (const l of (loans || []) as { direction: LoanDirection; entries: { type: "in" | "out"; amount: number }[] }[]) {
    const { balance } = loanBalance(l.direction, l.entries || []);
    if (balance <= 0) continue;
    if (l.direction === "lent") owedToYou += balance;
    else owedByYou += balance;
  }
  if (owedByYou > 0) {
    breakdown["Owed to friends & family"] = -owedByYou;
    totalLiabilities += owedByYou;
  }
  if (owedToYou > 0) {
    breakdown["Lent to friends & family"] = owedToYou;
    totalAssets += owedToYou;
  }

  return {
    total_assets: totalAssets,
    total_liabilities: totalLiabilities,
    net_worth: totalAssets - totalLiabilities,
    breakdown,
    adjustments: {
      security_deposit: deposit,
      pending_reimbursements: claimsDue,
      owed_by_you: owedByYou,
      owed_to_you: owedToYou,
      tracked_debt: trackedDebt,
    },
    account_count: (accounts || []).length,
  };
}
