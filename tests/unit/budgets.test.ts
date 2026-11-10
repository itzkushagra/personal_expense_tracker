import { describe, expect, it } from "vitest";
import { budgetSpent, budgetWindow, spanOf } from "@/lib/budgets";

const exp = (date: string, amount: number, extra: Record<string, unknown> = {}) => ({
  date,
  amount,
  category: "Food & Dining",
  is_reimbursable: false,
  reimbursement_status: null,
  reimbursed_amount: 0,
  ...extra,
}) as Parameters<typeof budgetSpent>[2][number];

describe("budgetWindow", () => {
  it("monthly budgets cover the calendar month containing today", () => {
    expect(budgetWindow({ period: "monthly", start_date: "2026-01-01", end_date: null }, "2026-11-10")).toEqual({
      start: "2026-11-01",
      end: "2026-11-30",
    });
    expect(budgetWindow({ period: "monthly", start_date: "2026-01-01", end_date: null }, "2028-02-15")).toEqual({
      start: "2028-02-01",
      end: "2028-02-29",
    });
  });

  it("weekly budgets run in 7-day cycles from their start date", () => {
    // Started Monday 2 Nov 2026: cycles are 2–8 Nov, 9–15 Nov, ...
    const b = { period: "weekly" as const, start_date: "2026-11-02", end_date: null };
    expect(budgetWindow(b, "2026-11-02")).toEqual({ start: "2026-11-02", end: "2026-11-08" });
    expect(budgetWindow(b, "2026-11-08")).toEqual({ start: "2026-11-02", end: "2026-11-08" });
    expect(budgetWindow(b, "2026-11-10")).toEqual({ start: "2026-11-09", end: "2026-11-15" });
    // Across a month and year boundary.
    expect(budgetWindow(b, "2027-01-01")).toEqual({ start: "2026-12-28", end: "2027-01-03" });
  });

  it("a weekly budget that hasn't started yet shows its first cycle", () => {
    expect(budgetWindow({ period: "weekly", start_date: "2026-12-01", end_date: null }, "2026-11-10")).toEqual({
      start: "2026-12-01",
      end: "2026-12-07",
    });
  });

  it("custom budgets run start to end, or to today without an end", () => {
    expect(budgetWindow({ period: "custom", start_date: "2026-10-15", end_date: "2026-11-14" }, "2026-11-10")).toEqual({
      start: "2026-10-15",
      end: "2026-11-14",
    });
    expect(budgetWindow({ period: "custom", start_date: "2026-10-15", end_date: null }, "2026-11-10")).toEqual({
      start: "2026-10-15",
      end: "2026-11-10",
    });
    // An end before the start never produces an inverted window.
    expect(budgetWindow({ period: "custom", start_date: "2026-10-15", end_date: "2026-10-01" }, "2026-11-10")).toEqual({
      start: "2026-10-15",
      end: "2026-10-15",
    });
  });
});

describe("budgetSpent", () => {
  const expenses = [
    exp("2026-11-01", 500), // previous weekly cycle
    exp("2026-11-09", 300),
    exp("2026-11-10", 200),
    exp("2026-11-10", 999, { category: "Shopping" }),
    exp("2026-11-11", 400, { is_reimbursable: true, reimbursement_status: "pending" }), // company pays
    exp("2026-11-12", 1000, { is_reimbursable: true, reimbursement_status: "reimbursed", reimbursed_amount: 800 }),
  ];

  it("a weekly budget counts only this cycle's own spending in its category", () => {
    const b = { period: "weekly" as const, start_date: "2026-11-02", end_date: null, category: "Food & Dining" };
    const w = budgetWindow(b, "2026-11-12");
    // 300 + 200 + 0 (pending claim) + 200 (shortfall on a part-reimbursed claim). Not the 500 from the 1st.
    expect(budgetSpent(b, w, expenses)).toBe(700);
  });

  it("the same spending against a monthly budget includes the whole month", () => {
    const b = { period: "monthly" as const, start_date: "2026-01-01", end_date: null, category: "Food & Dining" };
    expect(budgetSpent(b, budgetWindow(b, "2026-11-12"), expenses)).toBe(1200);
  });

  it("savings and investments never count against a budget", () => {
    const b = { period: "monthly" as const, start_date: "2026-01-01", end_date: null, category: "Investments" };
    expect(budgetSpent(b, budgetWindow(b, "2026-11-12"), [exp("2026-11-05", 5000, { category: "Investments" })])).toBe(0);
  });
});

describe("spanOf", () => {
  it("covers every window so expenses can be fetched once", () => {
    expect(spanOf([])).toBeNull();
    expect(
      spanOf([
        { start: "2026-11-01", end: "2026-11-30" },
        { start: "2026-10-15", end: "2026-11-10" },
        { start: "2026-11-09", end: "2026-11-15" },
      ])
    ).toEqual({ start: "2026-10-15", end: "2026-11-30" });
  });
});
