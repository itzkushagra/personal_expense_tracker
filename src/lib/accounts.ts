import { pick, WRITABLE } from "@/lib/api-fields";

/** Allowed account fields from a request body, with the legacy balance column kept in step. */
export function pickAccountFields(body: Record<string, unknown>) {
  const row = pick(body, WRITABLE.accounts);
  // The balance is calculated from transactions; the legacy column mirrors the opening balance.
  if (row.opening_balance !== undefined) row.balance = Number(row.opening_balance);
  return row;
}
