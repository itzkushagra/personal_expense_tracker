import { addDays, monthRange } from "@/lib/dates";
import { outOfPocket, type Budget, type Expense } from "@/types";

export interface BudgetWindow {
  /** First day counted, YYYY-MM-DD. */
  start: string;
  /** Last day counted, YYYY-MM-DD (inclusive). */
  end: string;
}

type BudgetPeriodFields = Pick<Budget, "period" | "start_date" | "end_date">;

/**
 * The days a budget's spending is measured over, as of `today` (YYYY-MM-DD).
 *
 * - monthly: the calendar month containing today.
 * - weekly: 7-day cycles starting on the budget's start date (a budget started on a
 *   Monday runs Monday to Sunday); before the start date, the first cycle.
 * - custom: start date to end date; with no end date, start date to today.
 */
export function budgetWindow(budget: BudgetPeriodFields, today: string): BudgetWindow {
  const start = (budget.start_date || today).slice(0, 10);
  if (budget.period === "weekly") {
    const elapsed = Math.max(0, daysBetween(start, today));
    const cycleStart = addDays(start, elapsed - (elapsed % 7));
    return { start: cycleStart, end: addDays(cycleStart, 6) };
  }
  if (budget.period === "custom") {
    const end = budget.end_date ? budget.end_date.slice(0, 10) : today;
    return { start, end: end < start ? start : end };
  }
  const [y, m] = today.split("-").map(Number);
  return monthRange(y, m);
}

function daysBetween(from: string, to: string) {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

type SpendRow = Pick<
  Expense,
  "date" | "category" | "amount" | "is_reimbursable" | "reimbursement_status" | "reimbursed_amount"
>;

/** Your own spending in the budget's category inside its window. */
export function budgetSpent(budget: BudgetPeriodFields & Pick<Budget, "category">, window: BudgetWindow, expenses: SpendRow[]) {
  return expenses
    .filter((e) => e.category === budget.category && e.date >= window.start && e.date <= window.end)
    .reduce((s, e) => s + outOfPocket(e), 0);
}

/** The earliest start and latest end over several windows, to fetch expenses once. */
export function spanOf(windows: BudgetWindow[]): BudgetWindow | null {
  if (windows.length === 0) return null;
  return {
    start: windows.reduce((a, w) => (w.start < a ? w.start : a), windows[0].start),
    end: windows.reduce((a, w) => (w.end > a ? w.end : a), windows[0].end),
  };
}
