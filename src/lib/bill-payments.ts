import type { Bill, BillKind, Debt } from "@/types";

/** Round to paise. */
const paise = (n: number) => Math.round(n * 100) / 100;

/**
 * Split an EMI into interest and principal for one month: interest is the
 * outstanding balance times the monthly rate (annual % / 12), never more than
 * the EMI itself; the rest repays principal.
 */
export function emiSplit(amount: number, debt: Pick<Debt, "current_balance" | "interest_rate">) {
  const monthly = (Math.max(0, Number(debt.current_balance)) * Math.max(0, Number(debt.interest_rate))) / 1200;
  const interest = paise(Math.min(Math.max(0, monthly), amount));
  return { principal: paise(amount - interest), interest };
}

export type BillSetup = Pick<Bill, "kind" | "to_account_id" | "debt_id" | "account_id">;

/** Why a bill can't be saved with this kind, or null if it's fine. */
export function validateBillSetup(bill: Partial<BillSetup>): string | null {
  const kind: BillKind = bill.kind ?? "expense";
  if (kind === "credit_card") {
    if (!bill.to_account_id && !bill.debt_id) return "Choose the credit card this bill pays off";
    if (bill.to_account_id && bill.account_id && bill.to_account_id === bill.account_id) {
      return "Pay-from account cannot be the card itself";
    }
  }
  if (kind === "loan_emi" && !bill.debt_id) return "Choose the loan this EMI pays";
  return null;
}

export interface PaymentPlan {
  kind: BillKind;
  /** Money that becomes spending (whole bill, or EMI interest + charges). */
  expenseAmount: number;
  /** Money that pays down a card or loan. */
  principal: number;
  interest: number;
  /** EMI late fees and other charges. principal + interest + fees always equals the amount paid. */
  fees: number;
  /** Card bills paid to a card account become a transfer between your accounts. */
  transfer: boolean;
  /** Card/EMI bills linked to a Debt Tracker entry reduce its balance by `principal`. */
  reducesDebt: boolean;
}

export interface PaymentInput {
  amount: number;
  /** Account the money left; falls back to the bill's own Pay-from account. */
  accountId?: string | null;
  /** Regular bills only: false when the expense is recorded elsewhere (Rent & Home). */
  createExpense?: boolean;
  /** EMI only: overrides the split worked out from the loan's interest rate. */
  interest?: number | null;
  /** EMI only: late fees and other charges included in the amount. */
  fees?: number | null;
}

/**
 * What marking a bill paid does to your money. Mirrors record_bill_payment in
 * migration 007, which performs it atomically; this is used to validate early,
 * to preview the EMI split, and in tests.
 */
/**
 * The bill's Debt Tracker entry. When it is linked to an account (account_id),
 * current_balance should be that account's live balance: it is what is owed.
 */
export type PaymentDebt = Pick<Debt, "current_balance" | "interest_rate"> & { account_id?: string | null };

export function planBillPayment(
  bill: BillSetup,
  input: PaymentInput,
  debt?: PaymentDebt | null
): { plan: PaymentPlan } | { error: string } {
  const amount = paise(Number(input.amount));
  if (!(amount > 0)) return { error: "Payment amount must be positive" };
  const setupError = validateBillSetup(bill);
  if (setupError) return { error: setupError };
  const fees = paise(Number(input.fees ?? 0));
  if (!(fees >= 0)) return { error: "Charges can't be negative" };
  if (fees > 0 && bill.kind !== "loan_emi") return { error: "Charges can only be recorded on a loan EMI" };
  const account = input.accountId ?? bill.account_id ?? null;

  // A Debt Tracker entry linked to an account is paid through that account.
  const linkedAccount = debt?.account_id ?? null;

  if (bill.kind === "credit_card") {
    const target = bill.to_account_id ?? linkedAccount;
    if (target) {
      if (!account) return { error: "Choose the account you paid the card from" };
      if (account === target) return { error: "Pay-from account cannot be the card itself" };
    }
    return {
      plan: { kind: "credit_card", expenseAmount: 0, principal: amount, interest: 0, fees: 0, transfer: !!target, reducesDebt: !target },
    };
  }

  if (bill.kind === "loan_emi") {
    if (fees > amount) return { error: "Charges can't be more than the amount paid" };
    let interest: number;
    if (input.interest !== undefined && input.interest !== null) {
      interest = paise(Number(input.interest));
      if (!(interest >= 0) || interest > amount) return { error: "Interest must be between 0 and the EMI amount" };
    } else {
      interest = debt ? emiSplit(amount - fees, debt).interest : 0;
    }
    // Every rupee is allocated: what isn't interest or charges repays principal.
    const principal = paise(amount - interest - fees);
    if (principal < 0) return { error: "Interest and charges can't be more than the amount paid" };
    if (debt && principal > Math.max(0, Number(debt.current_balance)) + 0.005) {
      return { error: `Principal of ${principal} is more than the ${Number(debt.current_balance)} still owed on this loan` };
    }
    if (linkedAccount && principal > 0) {
      if (!account) return { error: "Choose the account you paid the EMI from" };
      if (account === linkedAccount) return { error: "Pay-from account cannot be the card or loan itself" };
    }
    return {
      plan: {
        kind: "loan_emi",
        expenseAmount: paise(interest + fees),
        principal,
        interest,
        fees,
        transfer: !!linkedAccount && principal > 0,
        reducesDebt: !linkedAccount,
      },
    };
  }

  return {
    plan: {
      kind: "expense",
      expenseAmount: input.createExpense === false ? 0 : amount,
      principal: 0,
      interest: 0,
      fees: 0,
      transfer: false,
      reducesDebt: false,
    },
  };
}
