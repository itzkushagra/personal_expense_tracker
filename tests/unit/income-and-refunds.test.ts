import { describe, expect, it } from "vitest";
import { earnedIncome, isRefund, netOfRefunds, refundsReceived, type IncomeType } from "@/types";
import { earnedIncomeDue } from "@/lib/net-worth";

const inc = (type: IncomeType, amount: number, is_received = true) => ({ type, amount, is_received });

describe("refunds are money back on spending, not income", () => {
  const month = [inc("salary", 100000), inc("refund", 2000), inc("interest", 500), inc("refund", 700, false)];

  it("earned income leaves refunds out", () => {
    expect(isRefund({ type: "refund" })).toBe(true);
    expect(isRefund({ type: "salary" })).toBe(false);
    expect(earnedIncome(month)).toBe(100500);
  });

  it("only refunds actually received reduce spending", () => {
    expect(refundsReceived(month)).toBe(2000);
    expect(netOfRefunds(30000, 2000)).toBe(28000);
  });

  it("a refund larger than the month's spending floors spending at zero", () => {
    expect(netOfRefunds(1500, 2000)).toBe(0);
  });

  it("savings are unchanged by the reclassification; income and spending both shrink", () => {
    const spent = 30000;
    const before = { income: 102500, spent, saved: 102500 - spent };
    const income = earnedIncome(month);
    const after = { income, spent: netOfRefunds(spent, refundsReceived(month)), saved: 0 };
    after.saved = after.income - after.spent;
    expect(after.saved).toBe(before.saved);
    expect(after.income).toBeLessThan(before.income);
    // Savings rate is now measured against real earnings.
    expect(after.saved / after.income).toBeGreaterThan(before.saved / before.income);
  });
});

describe("unreceived income in net worth", () => {
  const today = "2026-11-10";

  it("counts income for months that have ended (earned, still owed to you)", () => {
    expect(
      earnedIncomeDue(
        [
          { amount: 80000, for_month: "2026-09-01" }, // September salary paid with F&F later
          { amount: 40000, for_month: "2026-10-01" }, // October
        ],
        today
      )
    ).toBe(120000);
  });

  it("leaves out income for this month or later: not earned yet", () => {
    expect(
      earnedIncomeDue(
        [
          { amount: 90000, for_month: "2026-11-01" }, // November salary, paid at month end
          { amount: 90000, for_month: "2026-12-01" },
          { amount: 5000, for_month: "2026-10-01" },
        ],
        today
      )
    ).toBe(5000);
  });

  it("never counts income already received", () => {
    expect(earnedIncomeDue([{ amount: 5000, for_month: "2026-10-01", is_received: true }], today)).toBe(0);
  });
});
