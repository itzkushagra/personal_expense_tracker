import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type Account,
  type LedgerEntry,
  type LedgerKind,
  LIABILITY_ACCOUNT_TYPES,
  LOAN_DIRECTION_LABELS,
  type LoanDirection,
} from "@/types";
import { cashDelta, isMissingTable } from "@/lib/portfolio";

/** A movement of money through one account. delta: + money in, − money out. */
export interface Flow {
  account_id: string;
  kind: LedgerKind;
  id: string;
  date: string;
  description: string;
  detail: string;
  delta: number;
}

/** PostgREST caps responses at 1000 rows, so page through everything. */
type QueryError = { message: string; code?: string } | null;

export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: QueryError }>,
  { optional = false }: { optional?: boolean } = {}
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    // optional: a table added by a migration that hasn't been applied yet counts as empty.
    if (error && optional && isMissingTable(error)) return [];
    if (error) throw new Error(error.message);
    const page = (data as T[] | null) || [];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

type ExpenseRow = { id: string; date: string; amount: number; description: string; category: string; account_id: string };
type PayoutRow = { id: string; reimbursed_date: string | null; reimbursed_amount: number; description: string; reimbursed_account_id: string };
type IncomeRow = { id: string; date: string; amount: number; source: string; type: string; account_id: string };
type LoanEntryRow = {
  id: string;
  date: string;
  amount: number;
  type: "in" | "out";
  note: string;
  account_id: string;
  loan: { person_name: string; direction: LoanDirection } | { person_name: string; direction: LoanDirection }[] | null;
};
type TransferRow = { id: string; date: string; amount: number; note: string; from_account_id: string; to_account_id: string };
type AdjustmentRow = { id: string; date: string; amount: number; note: string; account_id: string };
type InvestmentTxnRow = {
  id: string;
  date: string;
  type: "buy" | "sell" | "opening";
  quantity: number;
  price: number;
  fees: number;
  note: string;
  account_id: string;
  holding: { name: string } | { name: string }[] | null;
};
export type DebtPaymentRow = {
  id: string;
  paid_date: string;
  principal_amount: number;
  kind: string;
  account_id: string;
  bill: { name: string } | { name: string }[] | null;
};

/**
 * Principal paid to a Debt Tracker loan or card through a bill leaves the
 * pay-from account. (Card bills paid to a card account are transfers instead,
 * and EMI interest is an expense; both are counted from their own rows.)
 */
export function debtPaymentFlows(rows: DebtPaymentRow[]): Flow[] {
  return rows
    .filter((p) => p.account_id && Number(p.principal_amount) > 0)
    .map((p) => {
      const bill = Array.isArray(p.bill) ? p.bill[0] : p.bill;
      return {
        account_id: p.account_id,
        kind: "debt_payment" as const,
        id: p.id,
        date: p.paid_date,
        description: bill?.name ?? "Debt repayment",
        detail: p.kind === "loan_emi" ? "Loan EMI · principal" : "Card payment",
        delta: -Number(p.principal_amount),
      };
    });
}

/**
 * Cash moved by investment buys and sales. A buy is money leaving the account into a holding
 * (not spending); a sale is money coming back. Opening positions move no cash.
 */
export function investmentFlows(rows: InvestmentTxnRow[]): Flow[] {
  return rows
    .filter((t) => t.account_id && t.type !== "opening")
    .map((t) => {
      const holding = Array.isArray(t.holding) ? t.holding[0] : t.holding;
      return {
        account_id: t.account_id,
        kind: t.type === "sell" ? ("investment_sell" as const) : ("investment_buy" as const),
        id: t.id,
        date: t.date,
        description: `${t.type === "sell" ? "Sold" : "Bought"} ${holding?.name ?? "investment"}`,
        detail: t.note ? `Investment · ${t.note}` : "Investment",
        delta: cashDelta(t),
      };
    });
}

/** All linked money movements for the user, optionally for a single account. */
async function loadFlows(supabase: SupabaseClient, userId: string, accountId?: string): Promise<Flow[]> {
  const linked = (table: string, columns: string, accountColumn: string) => {
    const q = supabase.from(table).select(columns).eq("user_id", userId);
    return accountId ? q.eq(accountColumn, accountId) : q.not(accountColumn, "is", null);
  };

  const [expenses, payouts, incomes, loanEntries, transfers, debtPayments, adjustments, investmentTxns] = await Promise.all([
    fetchAll<ExpenseRow>((f, t) => linked("expenses", "id, date, amount, description, category, account_id", "account_id").range(f, t)),
    fetchAll<PayoutRow>((f, t) =>
      linked("expenses", "id, reimbursed_date, reimbursed_amount, description, reimbursed_account_id", "reimbursed_account_id")
        .eq("reimbursement_status", "reimbursed")
        .range(f, t)
    ),
    fetchAll<IncomeRow>((f, t) =>
      linked("incomes", "id, date, amount, source, type, account_id", "account_id").eq("is_received", true).range(f, t)
    ),
    fetchAll<LoanEntryRow>((f, t) =>
      linked("held_fund_entries", "id, date, amount, type, note, account_id, loan:held_funds(person_name, direction)", "account_id").range(f, t)
    ),
    fetchAll<TransferRow>((f, t) => {
      let q = supabase.from("transfers").select("id, date, amount, note, from_account_id, to_account_id").eq("user_id", userId);
      if (accountId) q = q.or(`from_account_id.eq.${accountId},to_account_id.eq.${accountId}`);
      return q.range(f, t);
    }),
    fetchAll<DebtPaymentRow>((f, t) =>
      linked("bill_payments", "id, paid_date, principal_amount, kind, account_id, bill:bills(name)", "account_id")
        .not("debt_id", "is", null)
        .is("reversed_at", null)
        .range(f, t)
    ),
    fetchAll<AdjustmentRow>((f, t) => linked("account_adjustments", "id, date, amount, note, account_id", "account_id").range(f, t), {
      optional: true,
    }),
    fetchAll<InvestmentTxnRow>(
      (f, t) =>
        linked("investment_transactions", "id, date, type, quantity, price, fees, note, account_id, holding:investment_holdings(name)", "account_id")
          .in("type", ["buy", "sell"])
          .range(f, t),
      { optional: true }
    ),
  ]);

  const flows: Flow[] = [];
  for (const e of expenses) {
    flows.push({ account_id: e.account_id, kind: "expense", id: e.id, date: e.date, description: e.description, detail: e.category, delta: -Number(e.amount) });
  }
  for (const e of payouts) {
    if (!e.reimbursed_date) continue;
    flows.push({
      account_id: e.reimbursed_account_id,
      kind: "reimbursement",
      id: e.id,
      date: e.reimbursed_date,
      description: `Reimbursed: ${e.description}`,
      detail: "Company reimbursement",
      delta: Number(e.reimbursed_amount),
    });
  }
  for (const i of incomes) {
    flows.push({ account_id: i.account_id, kind: "income", id: i.id, date: i.date, description: i.source, detail: `Income · ${i.type}`, delta: Number(i.amount) });
  }
  for (const l of loanEntries) {
    const loan = Array.isArray(l.loan) ? l.loan[0] : l.loan;
    const who = loan?.person_name || "Someone";
    const what = loan ? LOAN_DIRECTION_LABELS[loan.direction] : "People & Loans";
    flows.push({
      account_id: l.account_id,
      kind: "loan",
      id: l.id,
      date: l.date,
      description: l.type === "in" ? `From ${who}` : `To ${who}`,
      detail: l.note ? `${what} · ${l.note}` : what,
      delta: l.type === "in" ? Number(l.amount) : -Number(l.amount),
    });
  }
  for (const t of transfers) {
    const base = { id: t.id, date: t.date, detail: t.note ? `Transfer · ${t.note}` : "Transfer" };
    if (!accountId || t.from_account_id === accountId) {
      flows.push({ ...base, account_id: t.from_account_id, kind: "transfer_out", description: "Transfer out", delta: -Number(t.amount) });
    }
    if (!accountId || t.to_account_id === accountId) {
      flows.push({ ...base, account_id: t.to_account_id, kind: "transfer_in", description: "Transfer in", delta: Number(t.amount) });
    }
  }
  flows.push(...debtPaymentFlows(debtPayments));
  for (const a of adjustments) {
    flows.push({
      account_id: a.account_id,
      kind: "adjustment",
      id: a.id,
      date: a.date,
      description: "Balance adjustment",
      detail: a.note || "Matched to bank balance",
      delta: Number(a.amount),
    });
  }
  flows.push(...investmentFlows(investmentTxns));
  return flows;
}

const isLiability = (a: Pick<Account, "type">) => LIABILITY_ACCOUNT_TYPES.includes(a.type);

/** Apply a money-in/out delta to an account balance in the account's own terms. */
function applyDelta(account: Pick<Account, "type">, balance: number, delta: number) {
  // For a credit card or loan, spending (money out) increases what you owe.
  return isLiability(account) ? balance - delta : balance + delta;
}

/**
 * An account's balance: its opening balance plus every flow on or after its
 * opening date. For credit cards and loans the result is the amount owed.
 */
export function balanceFromFlows(
  account: Pick<Account, "id" | "type" | "opening_balance" | "opening_date"> & { balance?: number },
  flows: Pick<Flow, "account_id" | "date" | "delta">[]
) {
  let balance = Number(account.opening_balance ?? account.balance ?? 0);
  for (const f of flows) {
    if (f.account_id === account.id && f.date >= account.opening_date) balance = applyDelta(account, balance, f.delta);
  }
  return Math.round(balance * 100) / 100;
}

/** Accounts with balance replaced by the calculated figure. */
export async function withLiveBalances<A extends Account>(supabase: SupabaseClient, userId: string, accounts: A[]): Promise<A[]> {
  if (accounts.length === 0) return accounts;
  const flows = await loadFlows(supabase, userId);
  return accounts.map((a) => ({ ...a, balance: balanceFromFlows(a, flows) }));
}

/** Statement for one account: entries since the opening date with a running balance (oldest first). */
export async function accountStatement(supabase: SupabaseClient, userId: string, account: Account) {
  const flows = (await loadFlows(supabase, userId, account.id)).sort(
    (a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind)
  );
  let balance = Number(account.opening_balance);
  const entries: LedgerEntry[] = [];
  let earlier = 0;
  for (const f of flows) {
    if (f.date < account.opening_date) {
      earlier++;
      continue;
    }
    balance = applyDelta(account, balance, f.delta);
    entries.push({
      kind: f.kind,
      id: f.id,
      date: f.date,
      description: f.description,
      detail: f.detail,
      amount: f.delta,
      running_balance: Math.round(balance * 100) / 100,
    });
  }
  const money_in = entries.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const money_out = entries.filter((e) => e.amount < 0).reduce((s, e) => s - e.amount, 0);
  return { entries, balance: Math.round(balance * 100) / 100, money_in, money_out, earlier_count: earlier };
}
