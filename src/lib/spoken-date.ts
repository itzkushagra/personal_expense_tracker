/**
 * Finds a date in spoken expense text ("yesterday", "last Sunday",
 * "on 5th November", "3 days ago", "kal") relative to today's date.
 *
 * Works on plain YYYY-MM-DD strings so there is no timezone shifting.
 * Expenses are things that already happened, so a date that would land in the
 * future (e.g. "on the 25th" said on the 10th) is taken as the most recent
 * past one (25th of last month).
 */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

const WEEKDAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1, a: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10,
};

const pad = (n: number) => String(n).padStart(2, "0");

function toUTC(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function addDays(date: string, days: number): string {
  const d = toUTC(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUTC(d);
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** A real calendar date as YYYY-MM-DD, or null (e.g. 31 February). */
function makeDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Day of month with no month said: this month, or last month if that's in the future. */
function dayOnly(day: number, today: string): string | null {
  const [y, m] = today.split("-").map(Number);
  const thisMonth = makeDate(y, m, day);
  if (thisMonth && thisMonth <= today) return thisMonth;
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return makeDate(py, pm, day);
}

/** Day and month said: this year, or last year if that's in the future. */
function dayAndMonth(day: number, month: number, today: string, year?: number): string | null {
  const ty = Number(today.slice(0, 4));
  // Only treat a 4-digit number as the year if it's a recent one; otherwise
  // it's probably the amount ("5 nov 7000 sip").
  if (year && year >= ty - 2 && year <= ty) return makeDate(year, month, day);
  const thisYear = makeDate(ty, month, day);
  if (thisYear && thisYear <= today) return thisYear;
  return makeDate(ty - 1, month, day);
}

/** Drop a trailing number from the matched words if it wasn't accepted as the year (it's the amount). */
function yearUsed(matched: string, year: string | undefined, today: string): string {
  const ty = Number(today.slice(0, 4));
  if (!year || (Number(year) >= ty - 2 && Number(year) <= ty)) return matched;
  return matched.replace(/,?\s+\d{4}$/, "");
}

export interface SpokenDate {
  /** YYYY-MM-DD */
  date: string;
  /** The words that gave the date, so they can be removed from the description. */
  matched: string;
}

/**
 * Returns the date the text mentions, or null if it doesn't mention one.
 * `today` is YYYY-MM-DD in the user's own time zone.
 */
export function findSpokenDate(text: string, today: string): SpokenDate | null {
  const t = text.toLowerCase();
  const monthNames = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
  const ord = "(?:st|nd|rd|th)?";
  let m: RegExpMatchArray | null;

  // "day before yesterday" / "parso" (before "yesterday")
  if ((m = t.match(/\b(day before yesterday|parso|parson)\b/))) {
    return { date: addDays(today, -2), matched: m[0] };
  }
  // "yesterday" / "kal" (in a spent-money sentence, kal means yesterday)
  if ((m = t.match(/\b(yesterday|kal)\b/))) {
    return { date: addDays(today, -1), matched: m[0] };
  }
  // "today" / "aaj" / "this morning" / "tonight"
  if ((m = t.match(/\b(today|aaj|this morning|this afternoon|this evening|tonight)\b/))) {
    return { date: today, matched: m[0] };
  }
  // "3 days ago" / "two days back" / "a week ago"
  if ((m = t.match(/\b(\d{1,2}|one|a|two|three|four|five|six|seven|eight|nine|ten)\s+(day|days|week|weeks)\s+(ago|back|before)\b/))) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1]];
    const days = m[2].startsWith("week") ? n * 7 : n;
    return { date: addDays(today, -days), matched: m[0] };
  }
  // "last week" (exactly 7 days ago)
  if ((m = t.match(/\blast week\b/))) {
    return { date: addDays(today, -7), matched: m[0] };
  }
  // "last sunday" / "on monday" / "this friday" → most recent past one
  if ((m = t.match(/\b(?:(last|on|this|past)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/))) {
    const target = WEEKDAYS[m[2]];
    const todayDow = toUTC(today).getUTCDay();
    let back = (todayDow - target + 7) % 7;
    if (back === 0 && m[1] === "last") back = 7;
    return { date: addDays(today, -back), matched: m[0] };
  }
  // "5th november 2026" / "5 nov" / "on the 5th of november"
  if ((m = t.match(new RegExp(`\\b(?:on\\s+)?(?:the\\s+)?(\\d{1,2})${ord}\\s+(?:of\\s+)?(${monthNames})\\b(?:,?\\s+(20\\d{2})(?!\\d))?`)))) {
    const date = dayAndMonth(Number(m[1]), MONTHS[m[2]], today, m[3] ? Number(m[3]) : undefined);
    if (date) return { date, matched: yearUsed(m[0], m[3], today) };
  }
  // "november 5th" / "nov 5, 2026"
  if ((m = t.match(new RegExp(`\\b(?:on\\s+)?(${monthNames})\\s+(\\d{1,2})${ord}\\b(?:,?\\s+(20\\d{2})(?!\\d))?`)))) {
    const date = dayAndMonth(Number(m[2]), MONTHS[m[1]], today, m[3] ? Number(m[3]) : undefined);
    if (date) return { date, matched: yearUsed(m[0], m[3], today) };
  }
  // "5/11" or "5-11-2026" (Indian order: day first)
  if ((m = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?\b/))) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : undefined;
    const date = dayAndMonth(Number(m[1]), Number(m[2]), today, year);
    if (date) return { date, matched: m[0] };
  }
  // "on the 5th" / "on 5th" — needs an ordinal or "the" so amounts aren't mistaken for days
  if ((m = t.match(/\bon\s+the\s+(\d{1,2})(?:st|nd|rd|th)?\b/)) || (m = t.match(/\b(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)\b/))) {
    const date = dayOnly(Number(m[1]), today);
    if (date) return { date, matched: m[0] };
  }
  return null;
}

/** A YYYY-MM-DD string that is a real date, not in the future, and within the last 2 years. */
export function isUsableExpenseDate(date: unknown, today: string): date is string {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, m, d] = date.split("-").map(Number);
  if (!makeDate(y, m, d)) return false;
  const twoYearsAgo = `${Number(today.slice(0, 4)) - 2}${today.slice(4)}`;
  return date <= today && date >= twoYearsAgo;
}
