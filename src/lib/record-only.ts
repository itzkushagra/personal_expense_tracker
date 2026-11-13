import { isMissingColumn } from "@/lib/ledger";

/**
 * moves_balance on incomes, People & Loans entries and investment transactions.
 * false = record-only: the money is already part of the account's balance, so the entry names
 * the account without adding to or taking from it.
 *
 * The column only exists after migration 20261113140000, so a new row carries it only when it is
 * false (the column's default is true), and an edit only when the request sends it.
 */
export function movesBalanceForInsert(body: { moves_balance?: unknown }): { moves_balance?: false } {
  return body.moves_balance === false ? { moves_balance: false } : {};
}

export function movesBalanceForUpdate(body: { moves_balance?: unknown }): { moves_balance?: boolean } {
  return typeof body.moves_balance === "boolean" ? { moves_balance: body.moves_balance } : {};
}

export const RECORD_ONLY_NOT_SET_UP =
  "Record-only entries need the latest database update (migration 20261113140000). Apply it, then try again.";

/** A friendlier message when a write used moves_balance before the migration was applied. */
export function writeErrorMessage(error: { message: string; code?: string }) {
  return isMissingColumn(error) ? RECORD_ONLY_NOT_SET_UP : error.message;
}
