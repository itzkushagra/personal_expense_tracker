import { describe, expect, it } from "vitest";
import { reconciliationDelta } from "@/lib/accounts";
import { balanceFromFlows, type Flow } from "@/lib/ledger";

const flow = (account_id: string, date: string, delta: number): Flow => ({
  account_id,
  date,
  delta,
  kind: "expense",
  id: `${account_id}-${date}-${delta}`,
  description: "",
  detail: "",
});

describe("matching an account to the bank balance", () => {
  it("adds one adjustment for the difference and leaves earlier balances alone", () => {
    const sbi = { id: "sbi", type: "savings" as const, opening_balance: 10000, opening_date: "2026-01-01" };
    const history = [flow("sbi", "2026-02-01", -2000), flow("sbi", "2026-03-01", 500)];
    const calculated = balanceFromFlows(sbi, history); // 8500
    const delta = reconciliationDelta({ type: "savings", balance: calculated }, 8200);
    expect(delta).toBe(-300);

    const adjustment = { ...flow("sbi", "2026-11-10", delta), kind: "adjustment" as const };
    expect(balanceFromFlows(sbi, [...history, adjustment])).toBe(8200);
    // The opening balance is untouched, so the balance on any earlier date is what it was.
    expect(balanceFromFlows(sbi, history.filter((f) => f.date <= "2026-02-01"))).toBe(8000);
  });

  it("for a credit card, owing more means money out", () => {
    const card = { id: "card", type: "credit_card" as const, opening_balance: 5000, opening_date: "2026-01-01" };
    const delta = reconciliationDelta({ type: "credit_card", balance: 5000 }, 5600);
    expect(delta).toBe(-600);
    const adjustment: Flow = { ...flow("card", "2026-11-10", delta), kind: "adjustment" };
    expect(balanceFromFlows(card, [adjustment])).toBe(5600);
  });

  it("does nothing when the balances already agree to the paisa", () => {
    expect(reconciliationDelta({ type: "savings", balance: 1234.56 }, 1234.56)).toBe(0);
    expect(reconciliationDelta({ type: "savings", balance: 0.1 + 0.2 }, 0.3)).toBe(0);
  });
});
