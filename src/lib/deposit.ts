import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll, isMissingColumn } from "@/lib/ledger";

/**
 * Rent paid out of the security deposit (during a notice period). Such rent is a normal Rent
 * expense with no bank account and paid_from_deposit = true; the deposit still owed back to you
 * is the deposit entered on the Rent page minus that rent.
 */
export const DEPOSIT_NOT_SET_UP =
  "Paying rent from the deposit needs the latest database update (migration 20261113160000). Apply it, then try again.";

const money = (n: number) => Math.round(n * 100) / 100;

/** What's left of the deposit after rent paid from it; never below zero. */
export function depositLeft(deposit: number, used: number): number {
  return Math.max(0, money(Number(deposit || 0) - Number(used || 0)));
}

/** This month's rent from the deposit: the full rent, or whatever is left if that's less. */
export function rentFromDeposit(monthlyRent: number, left: number): number {
  return money(Math.max(0, Math.min(Number(monthlyRent || 0), left)));
}

/** Total rent paid from the deposit so far. 0 before the migration adds the column. */
export async function depositUsed(supabase: SupabaseClient, userId: string): Promise<number> {
  try {
    const rows = await fetchAll<{ amount: number }>((f, t) =>
      supabase.from("expenses").select("amount").eq("user_id", userId).eq("paid_from_deposit", true).range(f, t)
    );
    return money(rows.reduce((s, r) => s + Number(r.amount), 0));
  } catch (e) {
    if (isMissingColumn(e)) return 0;
    throw e;
  }
}
