/**
 * Date helpers that work on plain "YYYY-MM-DD" strings.
 *
 * Dates in this app are calendar days, not instants. Converting them with
 * toISOString() shifts them to UTC, which in India (UTC+5:30) moves anything
 * done between midnight and 5:30 AM to the previous day, and turns local
 * midnight of the 15th into the 14th. These helpers avoid that.
 */

/** The app is used in India, so the server works out "today" in IST. */
export const APP_TIME_ZONE = "Asia/Kolkata";

/** Today's date as YYYY-MM-DD in the app's time zone (safe on a UTC server). */
export function todayInAppZone(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Current { year, month } (month 1-12) in the app's time zone. */
export function currentMonthInAppZone(now: Date = new Date()): { year: number; month: number } {
  const [y, m] = todayInAppZone(now).split("-").map(Number);
  return { year: y, month: m };
}

export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one; UTC keeps it zone-free.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** First and last day of a month as YYYY-MM-DD (month is 1-12). */
export function monthRange(year: number, month: number): { start: string; end: string } {
  const mm = String(month).padStart(2, "0");
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(daysInMonth(year, month)).padStart(2, "0")}`,
  };
}

/**
 * Add whole months to a YYYY-MM-DD date, keeping the day where possible and
 * clamping to the month's last day (31 Jan + 1 month → 28/29 Feb, not 3 Mar).
 */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const nd = Math.min(d, daysInMonth(ny, nm));
  return `${ny}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

/** Add whole days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
