/**
 * "Safe to spend today": what can be spent today, and each day until the
 * next pay day, without running short.
 *
 *   safe today = (received − paid out − still due − buffer) ÷ days left
 *
 * Pure: give it the rows, it gives back every part of the sum, so the
 * dashboard can show exactly what went into the number.
 */

import { addDays, addMonths } from "@/lib/dates";
import { cycleForIncome, cycleLength, daysLeft, type PayCycle } from "@/lib/pay-cycle";

export interface StsIncome {
  amount: number | string;
  date: string;
  type: string;
  is_received: boolean;
}

export interface StsExpense {
  amount: number | string;
  date: string;
  category: string;
  description: string;
  is_reimbursable?: boolean | null;
  reimbursement_status?: string | null;
  reimbursed_amount?: number | string | null;
  reimbursed_date?: string | null;
}

export interface StsBill {
  id: string;
  name: string;
  amount: number | string;
  category: string;
  frequency: string;
  next_due_date: string;
  is_active: boolean;
}

export interface DueBill {
  id: string;
  name: string;
  amount: number;
  /** Due dates still to come in this cycle (a weekly bill can have several). */
  dueDates: string[];
}

export interface SafeToSpend {
  cycle: PayCycle;
  today: string;
  daysLeft: number;
  /** Income received in this cycle */
  income: number;
  /** Company reimbursements paid back in this cycle */
  reimbursementsBack: number;
  /** income + reimbursementsBack */
  received: number;
  /** Everything that left the account this cycle (spending, savings, reimbursable spends) */
  paidOut: number;
  /** Bills still to pay before the cycle ends */
  stillDue: number;
  dueBills: DueBill[];
  /** Bills that look paid by a matching expense, but aren't marked paid */
  looksPaid: { id: string; name: string; amount: number; expenseDate: string }[];
  buffer: number;
  /** received − paidOut − stillDue − buffer */
  leftForCycle: number;
  /** leftForCycle ÷ daysLeft, never below 0 */
  safeToday: number;
  /** What an even spread over the whole cycle would allow per day, for colouring */
  averageDaily: number;
  status: "good" | "low" | "over" | "no-income";
}

/** Categories that are commitments rather than day-to-day spending. */
const FIXED_CATEGORIES = new Set(["Rent", "Bills & Utilities", "Savings", "Investments", "Household Help"]);

const num = (v: unknown) => Number(v) || 0;
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);

/** Due dates of a bill from its next due date up to the cycle's last day. */
function dueDatesInCycle(bill: StsBill, end: string): string[] {
  const dates: string[] = [];
  let d = bill.next_due_date;
  for (let i = 0; d <= end && i < 60; i++) {
    dates.push(d);
    d = bill.frequency === "weekly" ? addDays(d, 7)
      : bill.frequency === "quarterly" ? addMonths(d, 3)
      : bill.frequency === "yearly" ? addMonths(d, 12)
      : addMonths(d, 1);
  }
  return dates;
}

/** An expense in this cycle that looks like the payment of a bill not marked paid. */
function matchingExpense(bill: StsBill, expenses: StsExpense[], used: Set<StsExpense>): StsExpense | undefined {
  const billWords = words(bill.name);
  return expenses.find((e) => {
    if (used.has(e)) return false;
    if (Math.abs(num(e.amount) - num(bill.amount)) > 1) return false;
    // Paid at most 15 days before it was due (auto-debits often go out early).
    if (e.date < addDays(bill.next_due_date, -15)) return false;
    const desc = words(e.description);
    return e.category === bill.category || billWords.some((w) => desc.includes(w));
  });
}

export function computeSafeToSpend(input: {
  today: string;
  cycle: PayCycle;
  payDay: number;
  incomes: StsIncome[];
  /** Expenses dated in the cycle */
  expenses: StsExpense[];
  /** Expenses (any date) reimbursed during the cycle */
  reimbursed: StsExpense[];
  bills: StsBill[];
  buffer?: number;
}): SafeToSpend {
  const { today, cycle, payDay } = input;
  const buffer = Math.max(0, num(input.buffer));
  const inCycle = (d: string | null | undefined) => !!d && d >= cycle.start && d <= cycle.end;

  const income = input.incomes
    .filter((i) => i.is_received && cycleForIncome(i.date, i.type, payDay).start === cycle.start)
    .reduce((s, i) => s + num(i.amount), 0);

  const reimbursementsBack = input.reimbursed
    .filter((e) => e.reimbursement_status === "reimbursed" && inCycle(e.reimbursed_date))
    .reduce((s, e) => s + num(e.reimbursed_amount), 0);

  const expenses = input.expenses.filter((e) => inCycle(e.date));
  const paidOut = expenses.reduce((s, e) => s + num(e.amount), 0);

  const dueBills: DueBill[] = [];
  const looksPaid: SafeToSpend["looksPaid"] = [];
  const used = new Set<StsExpense>();
  for (const bill of input.bills) {
    if (!bill.is_active) continue;
    const dates = dueDatesInCycle(bill, cycle.end);
    if (dates.length === 0) continue;
    const match = matchingExpense(bill, expenses, used);
    if (match) {
      // Already paid (and already in paidOut); only its later dates are still due.
      used.add(match);
      looksPaid.push({ id: bill.id, name: bill.name, amount: num(bill.amount), expenseDate: match.date });
      dates.shift();
    }
    if (dates.length > 0) dueBills.push({ id: bill.id, name: bill.name, amount: num(bill.amount), dueDates: dates });
  }
  const stillDue = dueBills.reduce((s, b) => s + b.amount * b.dueDates.length, 0);

  const received = income + reimbursementsBack;
  const left = daysLeft(cycle, today);
  const leftForCycle = received - paidOut - stillDue - buffer;
  const safeToday = Math.max(0, Math.floor(leftForCycle / left));

  const fixedPaid = expenses.filter((e) => FIXED_CATEGORIES.has(e.category)).reduce((s, e) => s + num(e.amount), 0);
  const averageDaily = Math.max(0, Math.floor((received - buffer - fixedPaid - stillDue) / cycleLength(cycle)));

  const status: SafeToSpend["status"] =
    received <= 0 ? "no-income" : leftForCycle < 0 ? "over" : safeToday >= averageDaily ? "good" : "low";

  return {
    cycle, today, daysLeft: left, income, reimbursementsBack, received, paidOut, stillDue,
    dueBills, looksPaid, buffer, leftForCycle, safeToday, averageDaily, status,
  };
}
