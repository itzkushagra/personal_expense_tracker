// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Expense } from "@/types";
import { FiftyThirtyTwenty } from "@/components/dashboard/fifty-thirty-twenty";

afterEach(cleanup);

const expense = (amount: number, category: string, date = "2026-11-05") =>
  ({ id: `${category}-${amount}`, amount, category, date, description: category, is_reimbursable: false }) as unknown as Expense;

describe("FiftyThirtyTwenty", () => {
  it("counts SIPs logged on the Investments page as invested", () => {
    render(
      <FiftyThirtyTwenty
        income={50000}
        expenses={[expense(15000, "Rent"), expense(1000, "Savings")]}
        purchases={[{ date: "2026-11-15", amount: 2749 }, { date: "2026-11-15", amount: 1649 }]}
      />
    );
    expect(screen.getByText(/incl\. ₹5,398 saved \/ invested/)).toBeTruthy();
  });

  it("doesn't count a month's SIPs twice when they were also logged as an Investments expense", () => {
    render(
      <FiftyThirtyTwenty
        income={50000}
        expenses={[expense(5500, "Investments")]}
        purchases={[{ date: "2026-11-15", amount: 2749 }, { date: "2026-11-15", amount: 1649 }]}
      />
    );
    expect(screen.getByText(/incl\. ₹5,500 saved \/ invested/)).toBeTruthy();
  });
});
