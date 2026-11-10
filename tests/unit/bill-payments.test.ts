import { describe, expect, it } from "vitest";
import { emiSplit, planBillPayment, validateBillSetup, type BillSetup } from "@/lib/bill-payments";

const regular: BillSetup = { kind: "expense", account_id: "bank", to_account_id: null, debt_id: null };
const cardToAccount: BillSetup = { kind: "credit_card", account_id: "bank", to_account_id: "card", debt_id: null };
const cardInDebtTracker: BillSetup = { kind: "credit_card", account_id: "bank", to_account_id: null, debt_id: "card-debt" };
const emi: BillSetup = { kind: "loan_emi", account_id: "bank", to_account_id: null, debt_id: "loan" };
const loan = { current_balance: 100000, interest_rate: 12 };

function plan(bill: BillSetup, input: Parameters<typeof planBillPayment>[1], debt?: Parameters<typeof planBillPayment>[2]) {
  const result = planBillPayment(bill, input, debt);
  if ("error" in result) throw new Error(result.error);
  return result.plan;
}

describe("emiSplit", () => {
  it("charges one month of interest on the outstanding balance", () => {
    // ₹1,00,000 at 12% a year = ₹1,000 interest this month
    expect(emiSplit(10000, loan)).toEqual({ principal: 9000, interest: 1000 });
  });

  it("never charges more interest than the EMI", () => {
    expect(emiSplit(500, loan)).toEqual({ principal: 0, interest: 500 });
  });

  it("treats a zero-rate loan as all principal", () => {
    expect(emiSplit(5000, { current_balance: 50000, interest_rate: 0 })).toEqual({ principal: 5000, interest: 0 });
  });

  it("rounds interest to paise", () => {
    // 33,333 × 10.5% ÷ 12 = 291.66375
    expect(emiSplit(2000, { current_balance: 33333, interest_rate: 10.5 })).toEqual({ principal: 1708.34, interest: 291.66 });
  });
});

describe("validateBillSetup", () => {
  it("accepts a regular bill with nothing linked", () => {
    expect(validateBillSetup(regular)).toBeNull();
  });

  it("requires a card bill to say which card it pays", () => {
    expect(validateBillSetup({ ...cardToAccount, to_account_id: null })).toMatch(/credit card/);
  });

  it("refuses paying a card from itself", () => {
    expect(validateBillSetup({ ...cardToAccount, account_id: "card" })).toMatch(/cannot be the card/);
  });

  it("requires an EMI to name its loan", () => {
    expect(validateBillSetup({ ...emi, debt_id: null })).toMatch(/loan/);
  });
});

describe("planBillPayment", () => {
  it("regular bill: the whole payment is spending (unchanged behaviour)", () => {
    expect(plan(regular, { amount: 799 })).toMatchObject({ kind: "expense", expenseAmount: 799, principal: 0, transfer: false, reducesDebt: false });
  });

  it("regular bill logged elsewhere (Rent & Home) records no second expense", () => {
    expect(plan(regular, { amount: 18000, createExpense: false }).expenseAmount).toBe(0);
  });

  it("REGRESSION: a credit card bill is never counted as spending", () => {
    const p = plan(cardToAccount, { amount: 15200 });
    expect(p.expenseAmount).toBe(0);
    expect(p).toMatchObject({ kind: "credit_card", principal: 15200, transfer: true, reducesDebt: false });
  });

  it("card tracked in the Debt Tracker reduces that debt instead of transferring", () => {
    expect(plan(cardInDebtTracker, { amount: 5000 })).toMatchObject({ expenseAmount: 0, principal: 5000, transfer: false, reducesDebt: true });
  });

  it("card payment needs the account it was paid from", () => {
    const result = planBillPayment({ ...cardToAccount, account_id: null }, { amount: 100 });
    expect(result).toEqual({ error: "Choose the account you paid the card from" });
  });

  it("REGRESSION: only EMI interest is spending; principal pays down the loan", () => {
    expect(plan(emi, { amount: 10000 }, loan)).toMatchObject({ kind: "loan_emi", expenseAmount: 1000, principal: 9000, interest: 1000, reducesDebt: true });
  });

  it("EMI split can be overridden with the bank statement's figure", () => {
    expect(plan(emi, { amount: 10000, interest: 987.5 }, loan)).toMatchObject({ principal: 9012.5, interest: 987.5, expenseAmount: 987.5 });
  });

  it("rejects interest larger than the EMI", () => {
    expect(planBillPayment(emi, { amount: 1000, interest: 1500 }, loan)).toEqual({ error: "Interest must be between 0 and the EMI amount" });
  });

  it("rejects a zero or negative payment", () => {
    expect(planBillPayment(regular, { amount: 0 })).toEqual({ error: "Payment amount must be positive" });
  });
});

describe("EMI principal limit and linked accounts (Task 1 corrections)", () => {
  it("refuses principal larger than the outstanding loan", () => {
    expect(planBillPayment(emi, { amount: 18000, interest: 1000 }, { current_balance: 5000, interest_rate: 8.5 })).toEqual({
      error: "Principal of 17000 is more than the 5000 still owed on this loan",
    });
  });

  it("allows a final EMI that clears the loan exactly", () => {
    expect(plan(emi, { amount: 5040, interest: 40 }, { current_balance: 5000, interest_rate: 8.5 })).toMatchObject({ principal: 5000 });
  });

  it("EMI on a loan linked to an account: principal is a transfer to that account", () => {
    const p = plan(emi, { amount: 12000, interest: 2250 }, { current_balance: 300000, interest_rate: 9, account_id: "car-loan-account" });
    expect(p).toMatchObject({ principal: 9750, transfer: true, reducesDebt: false, expenseAmount: 2250 });
  });

  it("card bill through a linked Debt Tracker entry pays the card account", () => {
    const p = plan(cardInDebtTracker, { amount: 5000 }, { current_balance: 8000, interest_rate: 36, account_id: "card-account" });
    expect(p).toMatchObject({ transfer: true, reducesDebt: false, expenseAmount: 0 });
  });

  it("a linked payment needs a pay-from account that isn't the card or loan itself", () => {
    const linked = { current_balance: 8000, interest_rate: 36, account_id: "card-account" };
    expect(planBillPayment({ ...cardInDebtTracker, account_id: null }, { amount: 5000 }, linked)).toEqual({ error: "Choose the account you paid the card from" });
    expect(planBillPayment(cardInDebtTracker, { amount: 5000, accountId: "card-account" }, linked)).toEqual({ error: "Pay-from account cannot be the card itself" });
  });
});

describe("every rupee allocated (Task 2)", () => {
  it("EMI with charges: principal + interest + charges = amount, charges are spending", () => {
    const p = plan(emi, { amount: 10000, interest: 1000, fees: 200 }, loan);
    expect(p).toMatchObject({ principal: 8800, interest: 1000, fees: 200, expenseAmount: 1200 });
    expect(p.principal + p.interest + p.fees).toBe(10000);
  });

  it("estimated interest is worked out on the EMI net of charges", () => {
    // ₹1,000 interest on ₹1,00,000 at 12%; ₹300 charges; the rest is principal.
    expect(plan(emi, { amount: 10300, fees: 300 }, loan)).toMatchObject({ interest: 1000, fees: 300, principal: 9000 });
  });

  it("refuses interest + charges larger than the amount", () => {
    expect(planBillPayment(emi, { amount: 1000, interest: 900, fees: 200 }, loan)).toEqual({
      error: "Interest and charges can't be more than the amount paid",
    });
  });

  it("refuses charges on regular and card bills", () => {
    expect(planBillPayment(regular, { amount: 1200, fees: 50 })).toEqual({ error: "Charges can only be recorded on a loan EMI" });
    expect(planBillPayment(cardToAccount, { amount: 1200, fees: 50 })).toEqual({ error: "Charges can only be recorded on a loan EMI" });
  });

  it("allocation always adds up for every kind", () => {
    for (const [bill, input] of [
      [regular, { amount: 799 }],
      [cardToAccount, { amount: 15200 }],
      [emi, { amount: 10000, interest: 950.55, fees: 49.45 }],
    ] as const) {
      const p = plan(bill, input, loan);
      const allocated = p.kind === "expense" ? p.expenseAmount : p.principal + p.interest + p.fees;
      expect(Math.round(allocated * 100) / 100).toBe(input.amount);
    }
  });
});
