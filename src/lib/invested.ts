import { isSavingsCategory } from "@/types";

/** Cash put into a fund or other holding (a buy on the Investments page). */
export interface InvestmentPurchase {
  date: string;
  amount: number;
}

type SavingsExpense = { date: string; amount: number | string; category: string };

const monthOf = (date: string) => date.slice(0, 7);

/**
 * Money saved or invested per month ("YYYY-MM"): "Savings" and "Investments" expenses, plus
 * purchases on the Investments page.
 *
 * Before the portfolio existed, SIPs were logged as "Investments" expenses, and the same
 * instalments may also have been imported as purchases. So a month that has any
 * "Investments" expense counts those expenses only; purchases are added only in months
 * without one. Nothing is counted twice, and new SIPs logged on the Investments page show up.
 */
export function investedByMonth(expenses: SavingsExpense[], purchases: InvestmentPurchase[]): Map<string, number> {
  const out = new Map<string, number>();
  const add = (month: string, amount: number) => out.set(month, (out.get(month) ?? 0) + amount);
  const loggedAsExpense = new Set<string>();
  for (const e of expenses) {
    if (!isSavingsCategory(e.category)) continue;
    add(monthOf(e.date), Number(e.amount));
    if (e.category === "Investments") loggedAsExpense.add(monthOf(e.date));
  }
  for (const p of purchases) {
    if (!loggedAsExpense.has(monthOf(p.date))) add(monthOf(p.date), Number(p.amount));
  }
  return out;
}

/** Total saved or invested across the given expenses and purchases. */
export function investedTotal(expenses: SavingsExpense[], purchases: InvestmentPurchase[]): number {
  let total = 0;
  for (const v of investedByMonth(expenses, purchases).values()) total += v;
  return Math.round(total * 100) / 100;
}
