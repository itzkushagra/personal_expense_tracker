import { describe, expect, it } from "vitest";
import {
  OversellError,
  cashAmount,
  cashDelta,
  isMissingTable,
  parseHoldingInput,
  parseTransactionInput,
  positionFrom,
  summarizeHolding,
  summarizePortfolio,
  validateTransactions,
} from "@/lib/portfolio";
import { balanceFromFlows, investmentFlows } from "@/lib/ledger";

type T = Parameters<typeof positionFrom>[0][number];
const buy = (date: string, quantity: number, price: number, fees = 0): T => ({ type: "buy", date, quantity, price, fees });
const sell = (date: string, quantity: number, price: number, fees = 0): T => ({ type: "sell", date, quantity, price, fees });
const opening = (date: string, quantity: number, price: number): T => ({ type: "opening", date, quantity, price, fees: 0 });

describe("cash moved by a transaction", () => {
  it("a buy costs units × price + fees; a sale brings in units × price − fees", () => {
    expect(cashAmount(buy("2026-01-01", 10, 100, 5))).toBe(1005);
    expect(cashDelta(buy("2026-01-01", 10, 100, 5))).toBe(-1005);
    expect(cashAmount(sell("2026-01-01", 4, 150, 3))).toBe(597);
    expect(cashDelta(sell("2026-01-01", 4, 150, 3))).toBe(597);
  });

  it("an opening position (already owned) moves no cash", () => {
    expect(cashAmount(opening("2025-01-01", 100, 50))).toBe(0);
    expect(cashDelta(opening("2025-01-01", 100, 50))).toBe(0);
  });
});

describe("average-cost position", () => {
  it("averages cost across buys, including fees", () => {
    const p = positionFrom([buy("2026-01-01", 10, 100, 10), buy("2026-02-01", 10, 120)]);
    expect(p.quantity).toBe(20);
    expect(p.cost_basis).toBe(2210);
    expect(p.total_invested).toBe(2210);
    expect(p.average_cost).toBeCloseTo(110.5);
  });

  it("a sale removes units at average cost and books the realised gain", () => {
    const p = positionFrom([buy("2026-01-01", 10, 100), buy("2026-02-01", 10, 120), sell("2026-03-01", 5, 150, 10)]);
    // Average cost 110; 5 units cost 550; proceeds 750 − 10 = 740 → gain 190.
    expect(p.quantity).toBe(15);
    expect(p.cost_basis).toBe(1650);
    expect(p.total_proceeds).toBe(740);
    expect(p.realized_gain).toBe(190);
  });

  it("selling everything leaves no quantity or cost behind", () => {
    const p = positionFrom([buy("2026-01-01", 3, 100), sell("2026-02-01", 3, 90)]);
    expect(p.quantity).toBe(0);
    expect(p.cost_basis).toBe(0);
    expect(p.realized_gain).toBe(-30);
  });

  it("replays in date order, whatever order rows arrive in", () => {
    const p = positionFrom([sell("2026-03-01", 5, 150), buy("2026-01-01", 10, 100)]);
    expect(p.quantity).toBe(5);
    expect(p.realized_gain).toBe(250);
  });

  it("refuses to sell more units than are held on that date", () => {
    expect(() => positionFrom([buy("2026-01-01", 5, 100), sell("2026-02-01", 6, 100)])).toThrow(OversellError);
    // Units bought after the sale date don't count.
    expect(validateTransactions([sell("2026-01-01", 1, 100), buy("2026-02-01", 5, 100)])).toMatch(/only 0 are held/);
    expect(validateTransactions([buy("2026-01-01", 5, 100), sell("2026-02-01", 5, 100)])).toBeNull();
  });

  it("an opening position counts as cost basis without cash", () => {
    const p = positionFrom([opening("2025-06-01", 100, 50), buy("2026-01-01", 100, 70)]);
    expect(p.quantity).toBe(200);
    expect(p.cost_basis).toBe(12000);
  });
});

describe("holding and portfolio figures", () => {
  it("values a holding at the entered price, or at cost when there is none", () => {
    const txns = [buy("2026-01-01", 10, 100)];
    const priced = summarizeHolding({ current_price: 130 }, txns);
    expect(priced.current_value).toBe(1300);
    expect(priced.unrealized_gain).toBe(300);
    expect(priced.unrealized_pct).toBeCloseTo(30);
    expect(priced.valued_at_cost).toBe(false);

    const unpriced = summarizeHolding({ current_price: null }, txns);
    expect(unpriced.current_value).toBe(1000);
    expect(unpriced.unrealized_gain).toBe(0);
    expect(unpriced.valued_at_cost).toBe(true);
  });

  it("totals the portfolio and splits allocation by asset type", () => {
    const fund = summarizeHolding({ current_price: 150 }, [buy("2026-01-01", 10, 100)]); // 1500, cost 1000
    const gold = summarizeHolding({ current_price: null }, [buy("2026-01-01", 1, 500)]); // 500 at cost
    const sold = summarizeHolding({ current_price: 10 }, [buy("2026-01-01", 2, 100), sell("2026-02-01", 2, 120)]); // 0, +40
    const s = summarizePortfolio([
      { asset_type: "mutual_fund", summary: fund },
      { asset_type: "gold", summary: gold },
      { asset_type: "stock", summary: sold },
    ]);
    expect(s.invested).toBe(1500);
    expect(s.current_value).toBe(2000);
    expect(s.unrealized_gain).toBe(500);
    expect(s.realized_gain).toBe(40);
    expect(s.holding_count).toBe(2);
    expect(s.allocation).toEqual([
      { asset_type: "mutual_fund", value: 1500, pct: 75 },
      { asset_type: "gold", value: 500, pct: 25 },
    ]);
  });
});

describe("investments in the account ledger", () => {
  const sbi = { id: "sbi", type: "savings" as const, opening_balance: 50000, opening_date: "2026-01-01" };
  const rows = [
    { id: "t1", date: "2026-02-01", type: "buy" as const, quantity: 10, price: 1000, fees: 20, note: "", account_id: "sbi", holding: { name: "Index fund" } },
    { id: "t2", date: "2026-03-01", type: "sell" as const, quantity: 4, price: 1200, fees: 0, note: "", account_id: "sbi", holding: [{ name: "Index fund" }] },
    { id: "t3", date: "2025-01-01", type: "opening" as const, quantity: 5, price: 900, fees: 0, note: "", account_id: "sbi", holding: null },
  ];

  it("a buy takes cash out, a sale puts it back, an opening position moves nothing", () => {
    const flows = investmentFlows(rows);
    expect(flows.map((f) => [f.kind, f.delta])).toEqual([
      ["investment_buy", -10020],
      ["investment_sell", 4800],
    ]);
    expect(flows[0].description).toBe("Bought Index fund");
    expect(balanceFromFlows(sbi, flows)).toBe(50000 - 10020 + 4800);
  });

  it("net worth is unchanged at the moment of purchase: cash out equals holding value at cost", () => {
    const cashBefore = 50000;
    const cashAfter = balanceFromFlows(sbi, investmentFlows([rows[0]]));
    const holding = summarizeHolding({ current_price: null }, [rows[0]]);
    expect(cashAfter + holding.current_value).toBe(cashBefore);
  });
});

describe("request validation", () => {
  it("accepts a clean transaction and drops the account for opening positions", () => {
    expect(parseTransactionInput({ type: "buy", date: "2026-11-10", quantity: "2.5", price: "100", fees: "", account_id: "acc" })).toEqual({
      value: { type: "buy", date: "2026-11-10", quantity: 2.5, price: 100, fees: 0, account_id: "acc", note: "", sip_id: null },
    });
    const o = parseTransactionInput({ type: "opening", date: "2025-01-01", quantity: 1, price: 1, account_id: "acc" });
    expect("value" in o && o.value.account_id).toBeNull();
  });

  it.each([
    [{ type: "gift", date: "2026-11-10", quantity: 1, price: 1 }, /Type/],
    [{ type: "buy", date: "10/11/2026", quantity: 1, price: 1 }, /date/],
    [{ type: "buy", date: "2026-11-10", quantity: 0, price: 1 }, /Quantity/],
    [{ type: "buy", date: "2026-11-10", quantity: "abc", price: 1 }, /Quantity/],
    [{ type: "buy", date: "2026-11-10", quantity: 1, price: -1 }, /Price/],
    [{ type: "buy", date: "2026-11-10", quantity: 1, price: 1, fees: -2 }, /Fees/],
    [{ type: "sell", date: "2026-11-10", quantity: 1, price: 10, fees: 20 }, /more than the sale/],
  ])("rejects %j", (body, message) => {
    const r = parseTransactionInput(body as Record<string, unknown>);
    expect("error" in r && r.error).toMatch(message);
  });

  it("checks holdings, stamping a new price with today's date", () => {
    expect(parseHoldingInput({ name: "  " }, { partial: false, today: "2026-11-10" })).toEqual({ error: "Give the holding a name" });
    expect(parseHoldingInput({ name: "X", asset_type: "nft" }, { partial: false, today: "2026-11-10" })).toEqual({ error: "Unknown asset type" });
    expect(parseHoldingInput({ current_price: "-1" }, { partial: true, today: "2026-11-10" })).toEqual({ error: "Current price can't be negative" });
    expect(parseHoldingInput({ current_price: "123.4" }, { partial: true, today: "2026-11-10" })).toEqual({
      value: { current_price: 123.4, valued_on: "2026-11-10" },
    });
    expect(parseHoldingInput({ current_price: "" }, { partial: true, today: "2026-11-10" })).toEqual({
      value: { current_price: null, valued_on: null },
    });
    // An edit only touches the fields sent.
    expect(parseHoldingInput({ note: "SIP" }, { partial: true, today: "2026-11-10" })).toEqual({ value: { note: "SIP" } });
  });

  it("recognises a table that hasn't been created yet", () => {
    expect(isMissingTable({ code: "42P01", message: "relation does not exist" })).toBe(true);
    expect(isMissingTable({ code: "PGRST205", message: "Could not find the table 'public.x' in the schema cache" })).toBe(true);
    expect(isMissingTable({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isMissingTable(null)).toBe(false);
  });
});
