/**
 * Pay cycles: "months" that run from one salary day to the day before the
 * next (pay day 3 → 3 Nov to 2 Dec). Pay day 1 is an ordinary calendar month.
 *
 * Plain YYYY-MM-DD string maths, so there's no timezone shifting.
 */

import { addDays, daysInMonth } from "@/lib/dates";

/** Salary that lands up to this many days before pay day funds the next cycle. */
export const EARLY_SALARY_DAYS = 3;

export interface PayCycle {
  /** First day, YYYY-MM-DD */
  start: string;
  /** Last day (the day before the next pay day), YYYY-MM-DD */
  end: string;
  /** e.g. "Nov cycle" or "November 2026" when pay day is 1 */
  name: string;
  /** e.g. "3 Nov to 2 Dec" */
  range: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const pad = (n: number) => String(n).padStart(2, "0");

/** Keep a pay day in 1–31 (anything else counts as 1). */
export function normalizePayDay(payDay: unknown): number {
  const n = Math.trunc(Number(payDay));
  return n >= 1 && n <= 31 ? n : 1;
}

/** The pay date in a given month: pay day 31 in February → 28th/29th. */
function payDateIn(year: number, month: number, payDay: number): string {
  return `${year}-${pad(month)}-${pad(Math.min(payDay, daysInMonth(year, month)))}`;
}

function prevMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

function shortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS.at(m - 1)}`;
}

function build(startYear: number, startMonth: number, payDay: number): PayCycle {
  const start = payDateIn(startYear, startMonth, payDay);
  const n = nextMonth(startYear, startMonth);
  const end = addDays(payDateIn(n.year, n.month, payDay), -1);
  const name = payDay === 1 ? `${MONTHS_LONG.at(startMonth - 1)} ${startYear}` : `${MONTHS.at(startMonth - 1)} ${startYear} cycle`;
  return { start, end, name, range: `${shortDate(start)} to ${shortDate(end)}` };
}

/** The cycle a date falls in. */
export function cycleFor(date: string, payDay: number): PayCycle {
  const pd = normalizePayDay(payDay);
  const [y, m] = date.split("-").map(Number);
  if (date >= payDateIn(y, m, pd)) return build(y, m, pd);
  const p = prevMonth(y, m);
  return build(p.year, p.month, pd);
}

/** The cycle `offset` cycles away from the one containing `date` (−1 = previous). */
export function shiftCycle(cycle: PayCycle, offset: number, payDay: number): PayCycle {
  let c = cycle;
  for (let i = 0; i < Math.abs(offset); i++) {
    c = offset < 0 ? cycleFor(addDays(c.start, -1), payDay) : cycleFor(addDays(c.end, 1), payDay);
  }
  return c;
}

/**
 * The cycle an income belongs to. Same as its date, except salary landing up
 * to EARLY_SALARY_DAYS before pay day (credited early before a weekend or
 * holiday) funds the cycle that starts on pay day.
 */
export function cycleForIncome(date: string, type: string, payDay: number): PayCycle {
  const pd = normalizePayDay(payDay);
  const own = cycleFor(date, pd);
  if (pd === 1 || type !== "salary") return own;
  const next = cycleFor(addDays(own.end, 1), pd);
  return addDays(date, EARLY_SALARY_DAYS) >= next.start ? next : own;
}

/**
 * Date range to fetch income for a cycle: it starts EARLY_SALARY_DAYS before
 * the cycle so early salary is included. Filter the rows with cycleForIncome,
 * so other income from those days stays in the cycle it arrived in.
 */
export function incomeFetchRange(cycle: PayCycle, payDay: number): { from: string; to: string } {
  return normalizePayDay(payDay) === 1
    ? { from: cycle.start, to: cycle.end }
    : { from: addDays(cycle.start, -EARLY_SALARY_DAYS), to: cycle.end };
}

/** Days from `today` to the cycle's last day, both included (at least 1). */
export function daysLeft(cycle: PayCycle, today: string): number {
  const t = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
  return Math.max(1, Math.round(t(cycle.end) - t(today)) + 1);
}

/** Total days in the cycle. */
export function cycleLength(cycle: PayCycle): number {
  const t = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
  return Math.round(t(cycle.end) - t(cycle.start)) + 1;
}
