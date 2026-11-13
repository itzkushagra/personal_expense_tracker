import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { investedByMonth, investedTotal } from "@/lib/invested";

describe("money saved or invested per month", () => {
  const exp = (date: string, amount: number, category: string) => ({ date, amount, category });
  const buy = (date: string, amount: number) => ({ date, amount });

  it("uses the SIP expenses where they were logged, and the purchases where they weren't", () => {
    const expenses = [
      exp("2026-10-15", 5500, "Investments"), // the old way: one "SIP" expense a month
      exp("2026-10-20", 2000, "Savings"),
      exp("2026-10-21", 800, "Food & Dining"), // spending isn't saving
      exp("2026-11-03", 1000, "Savings"),
    ];
    const purchases = [
      // October's SIPs were also imported as purchases: already counted by the expense.
      buy("2026-10-15", 2749),
      buy("2026-10-15", 1649),
      buy("2026-10-15", 1099),
      // November's SIPs were logged on the Investments page only.
      buy("2026-11-15", 2749),
      buy("2026-11-15", 1649),
    ];
    const m = investedByMonth(expenses, purchases);
    expect(m.get("2026-10")).toBe(5500 + 2000);
    expect(m.get("2026-11")).toBe(1000 + 2749 + 1649);
    expect(investedTotal(expenses, purchases)).toBe(7500 + 5398);
  });

  it("a Savings expense alone doesn't hide that month's purchases", () => {
    expect(investedTotal([exp("2026-12-01", 500, "Savings")], [buy("2026-12-15", 1099)])).toBe(1599);
  });

  it("is zero with nothing saved", () => {
    expect(investedTotal([exp("2026-12-01", 500, "Rent")], [])).toBe(0);
  });
});

// --- GET /api/investments/purchases with a mocked Supabase client
type Result = { data: unknown; error: unknown };
let result: Result = { data: [], error: null };
let user: { id: string } | null = { id: "me" };
const calls: string[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    from: (table: string) => {
      calls.push(`from:${table}`);
      const b: Record<string, unknown> = {};
      for (const m of ["select", "order"]) b[m] = () => b;
      for (const m of ["eq", "gte", "lte"]) b[m] = (col: string, v: unknown) => (calls.push(`${m}:${col}=${v}`), b);
      b.range = async () => result;
      return b;
    },
  }),
}));

import { GET } from "@/app/api/investments/purchases/route";

const get = (qs: string) => GET(new NextRequest(`http://localhost/api/investments/purchases?${qs}`));

describe("GET /api/investments/purchases", () => {
  beforeEach(() => {
    result = { data: [], error: null };
    user = { id: "me" };
    calls.length = 0;
  });

  it("refuses when signed out", async () => {
    user = null;
    expect((await get("from=2026-11-01&to=2026-11-30")).status).toBe(401);
  });

  it("needs a valid date range", async () => {
    expect((await get("from=2026-11-01")).status).toBe(400);
    expect((await get("from=2026-11-30&to=2026-11-01")).status).toBe(400);
    expect((await get("from=nope&to=2026-11-30")).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("returns the cash put into each buy, for the signed-in user's buys in range", async () => {
    result = { data: [{ date: "2026-11-15", type: "buy", quantity: 4, price: 412, fees: 1.5 }], error: null };
    const res = await get("from=2026-11-01&to=2026-11-30");
    expect(res.status).toBe(200);
    // units × price + charges
    expect((await res.json()).data).toEqual([{ date: "2026-11-15", amount: 1649.5 }]);
    expect(calls).toEqual(expect.arrayContaining(["eq:user_id=me", "eq:type=buy", "gte:date=2026-11-01", "lte:date=2026-11-30"]));
  });

  it("is empty, not an error, before the portfolio migration", async () => {
    result = { data: null, error: { code: "42P01", message: 'relation "investment_transactions" does not exist' } };
    const res = await get("from=2026-11-01&to=2026-11-30");
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });
});
