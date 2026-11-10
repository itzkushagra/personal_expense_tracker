import { describe, expect, it } from "vitest";
import { balanceFromFlows, debtPaymentFlows, type Flow } from "@/lib/ledger";
import { outOfPocket, type AccountType } from "@/types";

/**
 * Money scenarios for bill payments, checked through the same balance and
 * spending functions the app uses. Amounts in rupees.
 */

const bank = { id: "sbi", type: "savings" as AccountType, opening_balance: 50000, opening_date: "2026-11-01" };
const card = { id: "card", type: "credit_card" as AccountType, opening_balance: 0, opening_date: "2026-11-01" };

const expenseFlow = (account: string, date: string, amount: number): Flow => ({
  account_id: account, kind: "expense", id: `e-${date}-${amount}`, date, description: "", detail: "", delta: -amount,
});
const transferFlows = (from: string, to: string, date: string, amount: number): Flow[] => [
  { account_id: from, kind: "transfer_out", id: `t-${date}`, date, description: "", detail: "", delta: -amount },
  { account_id: to, kind: "transfer_in", id: `t-${date}`, date, description: "", detail: "", delta: amount },
];
const spending = (amounts: { amount: number; category: string }[]) =>
  amounts.reduce((s, e) => s + outOfPocket({ ...e, is_reimbursable: false, reimbursement_status: null, reimbursed_amount: 0 }), 0);

describe("Scenario: buy on a credit card, then pay the card bill", () => {
  // 5 Nov: ₹2,000 groceries on the card. 20 Nov: card bill paid from SBI (a transfer).
  const flows = [expenseFlow("card", "2026-11-05", 2000), ...transferFlows("sbi", "card", "2026-11-20", 2000)];

  it("the purchase raises what you owe and leaves the bank alone", () => {
    const beforePayment = flows.filter((f) => f.date < "2026-11-20");
    expect(balanceFromFlows(card, beforePayment)).toBe(2000);
    expect(balanceFromFlows(bank, beforePayment)).toBe(50000);
  });

  it("paying the bill moves money from the bank to the card", () => {
    expect(balanceFromFlows(bank, flows)).toBe(48000);
    expect(balanceFromFlows(card, flows)).toBe(0);
  });

  it("REGRESSION: spending is the purchase only, not purchase + bill", () => {
    // The payment is a transfer, so only the ₹2,000 expense row exists.
    expect(spending([{ amount: 2000, category: "Groceries" }])).toBe(2000);
  });

  it("net worth falls only by what was bought", () => {
    const netWorth = balanceFromFlows(bank, flows) - balanceFromFlows(card, flows);
    expect(netWorth).toBe(50000 - 2000);
  });
});

describe("Scenario: pay a loan EMI of ₹10,000 (₹9,000 principal, ₹1,000 interest)", () => {
  const debtBefore = 100000;
  const payment = { id: "p1", paid_date: "2026-11-07", principal_amount: 9000, kind: "loan_emi", account_id: "sbi", bill: { name: "Bike loan" } };
  const flows = [expenseFlow("sbi", "2026-11-07", 1000), ...debtPaymentFlows([payment])];

  it("the bank drops by the full EMI", () => {
    expect(balanceFromFlows(bank, flows)).toBe(40000);
  });

  it("the principal shows on the statement as a debt repayment", () => {
    expect(debtPaymentFlows([payment])).toEqual([
      expect.objectContaining({ account_id: "sbi", kind: "debt_payment", delta: -9000, description: "Bike loan" }),
    ]);
  });

  it("REGRESSION: only the interest counts as spending", () => {
    expect(spending([{ amount: 1000, category: "Bills & Utilities" }])).toBe(1000);
  });

  it("net worth falls only by the interest", () => {
    const before = 50000 - debtBefore;
    const after = balanceFromFlows(bank, flows) - (debtBefore - payment.principal_amount);
    expect(after - before).toBe(-1000);
  });

  it("ignores payments with no account or no principal", () => {
    expect(debtPaymentFlows([{ ...payment, account_id: "" }, { ...payment, principal_amount: 0 }])).toEqual([]);
  });
});
