import { describe, expect, it } from "vitest";
import {
  cashAmount,
  parseHoldingInput,
  parseSipInput,
  parseTransactionInput,
  sipDueDate,
  sipStatus,
  summarizeHolding,
  summarizePortfolio,
  transactionRow,
  unitsForAmount,
} from "@/lib/portfolio";

const today = "2026-11-13";

describe("buying by amount (SIP style)", () => {
  it("allots (amount − charges) ÷ NAV units, to 4 decimals", () => {
    expect(unitsForAmount(5000, 87.6543)).toBe(57.0423);
    expect(unitsForAmount(5000, 100, 0.25)).toBe(49.9975);
    expect(unitsForAmount(5000, 0)).toBe(0);
  });

  it("a buy entered as amount + NAV costs about that amount in cash", () => {
    const r = parseTransactionInput({ type: "buy", date: "2026-11-05", amount: "5000", price: "87.6543", fees: "0.25" });
    expect("value" in r).toBe(true);
    if (!("value" in r)) return;
    expect(r.value.quantity).toBe(57.0394);
    // Unit rounding moves the cash by at most a paisa or two.
    expect(Math.abs(cashAmount(r.value) - 5000)).toBeLessThan(0.02);
  });

  it("explains what's missing when buying by amount", () => {
    const err = (body: Record<string, unknown>) => {
      const r = parseTransactionInput({ type: "buy", date: "2026-11-05", ...body });
      return "error" in r ? r.error : null;
    };
    expect(err({ amount: 5000, price: "" })).toMatch(/NAV/);
    expect(err({ amount: 0, price: 10 })).toMatch(/Amount/);
    expect(err({ amount: 10, price: 10, fees: 10 })).toMatch(/Charges/);
    const sell = parseTransactionInput({ type: "sell", date: "2026-11-05", amount: 100, price: 10 });
    expect("error" in sell && sell.error).toMatch(/units sold/);
  });

  it("keeps the SIP link only on buys, and leaves it off the row when empty", () => {
    const buy = parseTransactionInput({ type: "buy", date: "2026-11-05", quantity: 1, price: 1, sip_id: "sip-1" });
    expect("value" in buy && buy.value.sip_id).toBe("sip-1");
    const sell = parseTransactionInput({ type: "sell", date: "2026-11-05", quantity: 1, price: 1, sip_id: "sip-1" });
    expect("value" in sell && sell.value.sip_id).toBeNull();
    if ("value" in sell) expect("sip_id" in transactionRow(sell.value)).toBe(false);
    if ("value" in buy) expect(transactionRow(buy.value).sip_id).toBe("sip-1");
  });
});

describe("SIP schedule", () => {
  it("falls on the chosen day, or the month's last day in shorter months", () => {
    expect(sipDueDate({ day_of_month: 5 }, 2026, 11)).toBe("2026-11-05");
    expect(sipDueDate({ day_of_month: 31 }, 2026, 11)).toBe("2026-11-30");
    expect(sipDueDate({ day_of_month: 30 }, 2027, 2)).toBe("2027-02-28");
    expect(sipDueDate({ day_of_month: 29 }, 2028, 2)).toBe("2028-02-29");
  });

  const sip = (over: Partial<{ id: string; day_of_month: number; start_date: string; is_active: boolean }> = {}) => ({
    id: "s1",
    day_of_month: 5,
    start_date: "2026-01-01",
    is_active: true,
    ...over,
  });
  const txn = (date: string, sip_id: string | null = "s1") => ({ id: `t-${date}`, sip_id, date, quantity: 10, price: 50 });

  it("is due once its day has passed and nothing is logged this month", () => {
    expect(sipStatus(sip(), [txn("2026-10-05")], today)).toEqual({ due_date: "2026-11-05", state: "due" });
  });

  it("is upcoming before its day", () => {
    expect(sipStatus(sip({ day_of_month: 25 }), [], today)).toEqual({ due_date: "2026-11-25", state: "upcoming" });
  });

  it("is logged when this month's instalment exists, even if logged early", () => {
    const st = sipStatus(sip({ day_of_month: 25 }), [txn("2026-11-02")], today);
    expect(st.state).toBe("logged");
    expect(st.logged).toEqual({ id: "t-2026-11-02", quantity: 10, price: 50 });
  });

  it("ignores ordinary buys of the same fund that aren't this SIP's instalment", () => {
    expect(sipStatus(sip(), [txn("2026-11-05", null), txn("2026-11-05", "other-sip")], today).state).toBe("due");
  });

  it("can be paused, or not started yet", () => {
    expect(sipStatus(sip({ is_active: false }), [], today).state).toBe("paused");
    expect(sipStatus(sip({ start_date: "2026-12-01" }), [], today).state).toBe("not_started");
  });
});

describe("SIP and holding input", () => {
  it("checks a new SIP", () => {
    expect(parseSipInput({ amount: 5000, day_of_month: 5 }, { partial: false, today })).toEqual({ error: "Choose the fund for this SIP" });
    expect(parseSipInput({ holding_id: "h", amount: -1, day_of_month: 5 }, { partial: false, today })).toEqual({ error: "SIP amount must be more than 0" });
    expect(parseSipInput({ holding_id: "h", amount: 5000, day_of_month: 32 }, { partial: false, today })).toEqual({ error: "SIP day must be between 1 and 31" });
    expect(parseSipInput({ holding_id: "h", amount: "5000", day_of_month: 5, account_id: "" }, { partial: false, today })).toEqual({
      value: { holding_id: "h", amount: 5000, day_of_month: 5, account_id: null, start_date: today },
    });
  });

  it("pausing is a partial edit", () => {
    expect(parseSipInput({ is_active: false }, { partial: true, today })).toEqual({ value: { is_active: false } });
  });

  it("accepts known fund categories only", () => {
    expect(parseHoldingInput({ fund_category: "small_cap" }, { partial: true, today })).toEqual({ value: { fund_category: "small_cap" } });
    expect(parseHoldingInput({ fund_category: "" }, { partial: true, today })).toEqual({ value: { fund_category: "" } });
    expect(parseHoldingInput({ fund_category: "micro_cap" }, { partial: true, today })).toEqual({ error: "Unknown fund category" });
  });
});

describe("portfolio split by fund category", () => {
  it("shares out the value of categorised funds, ignoring other holdings", () => {
    const h = (price: number, units: number) => summarizeHolding({ current_price: price }, [{ type: "buy", date: "2026-01-01", quantity: units, price, fees: 0 }]);
    const s = summarizePortfolio([
      { asset_type: "mutual_fund", fund_category: "large_cap", summary: h(100, 50) }, // 5,000
      { asset_type: "mutual_fund", fund_category: "mid_cap", summary: h(100, 30) }, // 3,000
      { asset_type: "mutual_fund", fund_category: "small_cap", summary: h(100, 20) }, // 2,000
      { asset_type: "gold", fund_category: "", summary: h(5000, 2) }, // not a fund
    ]);
    expect(s.by_fund_category).toEqual([
      { category: "large_cap", value: 5000, pct: 50 },
      { category: "mid_cap", value: 3000, pct: 30 },
      { category: "small_cap", value: 2000, pct: 20 },
    ]);
    expect(s.current_value).toBe(20000);
  });
});
