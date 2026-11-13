import { depositLeft, depositUsed } from "@/lib/deposit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type Account, type Debt, type LoanDirection, loanBalance, reimbursementDue } from "@/types";
import { withLiveBalances } from "@/lib/ledger";
import { todayInAppZone } from "@/lib/dates";
import { loadPortfolio } from "@/lib/investments";

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
    /** Income for months that have ended but isn't received yet (e.g. salary due with F&F). */
    pending_income: number;
    /** Held for, or borrowed from, friends & family. */
    owed_by_you: number;
    /** Lent to friends & family. */
    owed_to_you: number;
    /** Active Debt Tracker balances not already counted as accounts. */
    tracked_debt: number;
    /** Investment holdings at their latest entered value (cost when none entered). */
    investments: number;
  };
  account_count: number;
}

/**
 * Unreceived income that counts as money owed to you: only income for a month that has
 * already ended (salary or F&F you have earned). Expected income for this month or later
 * isn't yours yet, so it stays out of net worth until it is earned.
 */
export function earnedIncomeDue(
  pending: { amount: number; for_month: string; is_received?: boolean }[],
  today: string
): number {
  const thisMonth = `${today.slice(0, 7)}-01`;
  return pending
    .filter((i) => i.is_received !== true && i.for_month.slice(0, 10) < thisMonth)
    .reduce((s, i) => s + Number(i.amount), 0);
}

/**
 * Debt Tracker entries that add to liabilities. An entry linked to an account that is
 * counted (debts.account_id) is the same card or loan, so it is left out; everything
 * else is counted on its own. Each underlying liability is therefore counted once.
 */
export function countedDebts<D extends Pick<Debt, "name" | "current_balance" | "account_id">>(
  debts: D[],
  countedAccountIds: Set<string>
): { debt: D; balance: number }[] {
  return debts
    .filter((d) => !(d.account_id && countedAccountIds.has(d.account_id)))
    .map((debt) => ({ debt, balance: Math.max(0, Number(debt.current_balance)) }))
    .filter((x) => x.balance > 0);
}

export async function computeNetWorth(supabase: SupabaseClient, userId: string): Promise<NetWorthBreakdown> {
  const [{ data: rawAccounts }, { data: rental }, { data: loans }, { data: debts }, { data: claims }, { data: pendingIncome }] = await Promise.all([
    supabase.from("accounts").select("*").eq("user_id", userId).eq("is_active", true),
    supabase.from("rentals").select("security_deposit").eq("user_id", userId).maybeSingle(),
    supabase
      .from("held_funds")
      .select("direction, entries:held_fund_entries(type, amount)")
      .eq("user_id", userId)
      .eq("is_settled", false),
    supabase.from("debts").select("id, name, current_balance, account_id").eq("user_id", userId).eq("is_active", true),
    supabase
      .from("expenses")
      .select("amount, is_reimbursable, reimbursement_status")
      .eq("user_id", userId)
      .eq("is_reimbursable", true)
      .in("reimbursement_status", ["pending", "submitted"]),
    supabase.from("incomes").select("amount, for_month").eq("user_id", userId).eq("is_received", false),
  ]);

  // Balances are calculated from every linked transaction, not typed in.
  const [accounts, portfolio] = await Promise.all([
    withLiveBalances(supabase, userId, (rawAccounts || []) as Account[]),
    loadPortfolio(supabase, userId),
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

  // Investment holdings are assets. Buying one moved cash out of an account (counted above),
  // so the holding takes its place and net worth doesn't drop at the moment of purchase.
  const investments = portfolio.summary.current_value;
  if (investments > 0) {
    breakdown["Investment portfolio"] = investments;
    totalAssets += investments;
  }

  // Refundable rent deposit and pending company claims are money owed to you. Rent already
  // paid out of the deposit (notice period) is no longer owed back.
  const deposit = rental ? depositLeft(Number(rental.security_deposit || 0), await depositUsed(supabase, userId)) : 0;
  if (deposit > 0) {
    breakdown["Rent security deposit"] = deposit;
    totalAssets += deposit;
  }
  const claimsDue = (claims || []).reduce((s, e) => s + reimbursementDue(e), 0);
  if (claimsDue > 0) {
    breakdown["Pending reimbursements"] = claimsDue;
    totalAssets += claimsDue;
  }

  // Salary / F&F earned for a finished month but not received yet.
  const incomeDue = earnedIncomeDue(pendingIncome || [], todayInAppZone());
  if (incomeDue > 0) {
    breakdown["Income still to receive"] = incomeDue;
    totalAssets += incomeDue;
  }

  // Debt Tracker entries (EMIs, personal loans, credit cards) are liabilities, except
  // those linked to an account above: that account's balance already counts them.
  let trackedDebt = 0;
  for (const { debt, balance } of countedDebts(debts || [], new Set(accounts.map((a) => a.id)))) {
    breakdown[`Debt: ${debt.name}`] = -balance;
    trackedDebt += balance;
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
      pending_income: incomeDue,
      owed_by_you: owedByYou,
      owed_to_you: owedToYou,
      tracked_debt: trackedDebt,
      investments,
    },
    account_count: (accounts || []).length,
  };
}
