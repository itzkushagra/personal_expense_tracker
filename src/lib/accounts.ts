import { type Account, LIABILITY_ACCOUNT_TYPES } from "@/types";
import { pick, WRITABLE } from "@/lib/api-fields";

/** Allowed account fields from a request body, with the legacy balance column kept in step. */
export function pickAccountFields(body: Record<string, unknown>) {
  const row = pick(body, WRITABLE.accounts);
  // The balance is calculated from transactions; the legacy column mirrors the opening balance.
  if (row.opening_balance !== undefined) row.balance = Number(row.opening_balance);
  return row;
}

/**
 * The ledger amount (+ money in, − money out) that moves an account's calculated balance to
 * the balance the bank shows. For a credit card or loan the balance is the amount owed, which
 * money out increases. 0 when they already match to the paisa.
 */
export function reconciliationDelta(
  account: Pick<Account, "type" | "balance">,
  actualBalance: number
): number {
  const liability = LIABILITY_ACCOUNT_TYPES.includes(account.type);
  const diff = liability ? Number(account.balance) - actualBalance : actualBalance - Number(account.balance);
  const rounded = Math.round(diff * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}
