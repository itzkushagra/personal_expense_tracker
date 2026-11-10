import { describe, expect, it } from "vitest";
import { countedDebts } from "@/lib/net-worth";

/** Which Debt Tracker entries add to liabilities, given the accounts that are counted. */
const debt = (name: string, current_balance: number, account_id: string | null = null) => ({ name, current_balance, account_id });
const names = (r: ReturnType<typeof countedDebts>) => r.map((x) => x.debt.name);

describe("countedDebts: each card or loan counted once", () => {
  const accounts = new Set(["hdfc-card-account", "car-loan-account"]);

  it("leaves out an entry linked to a counted account (the account already counts it)", () => {
    expect(names(countedDebts([debt("HDFC Credit Card", 18450, "hdfc-card-account")], accounts))).toEqual([]);
  });

  it("counts an unlinked entry on its own, whatever its name", () => {
    expect(countedDebts([debt("Home loan", 1500000)], accounts)).toEqual([{ debt: debt("Home loan", 1500000), balance: 1500000 }]);
  });

  it("REGRESSION: a name shared with an unrelated account no longer hides a debt", () => {
    // Old rule: any account named "Gold Loan" (even a savings account) made this debt disappear.
    expect(names(countedDebts([debt("Gold Loan", 40000)], accounts))).toEqual(["Gold Loan"]);
  });

  it("counts the entry when its linked account isn't counted (inactive or deleted)", () => {
    expect(names(countedDebts([debt("Old card", 2000, "closed-card-account")], accounts))).toEqual(["Old card"]);
  });

  it("ignores paid-off and overpaid entries", () => {
    expect(countedDebts([debt("Paid off", 0), debt("Overpaid", -50)], accounts)).toEqual([]);
  });
});
