import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyMigration, asUser, createTestDb, type TestDb } from "./setup";
import { balanceFromFlows, debtPaymentFlows, type DebtPaymentRow, type Flow } from "@/lib/ledger";
import { countedDebts } from "@/lib/net-worth";
import { outOfPocket, type AccountType } from "@/types";

/**
 * Migration 008: a card or loan in both Accounts and the Debt Tracker is one
 * liability, counted once; bill payments against it move the account's balance.
 */

const ME = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const SBI = "a0000000-0000-0000-0000-000000000001";
const HDFC_CARD_ACC = "a0000000-0000-0000-0000-000000000002";
const CAR_LOAN_ACC = "a0000000-0000-0000-0000-000000000003";
const SAVINGS_NAMED_LIKE_LOAN = "a0000000-0000-0000-0000-000000000004";
const OTHER_CARD_ACC = "a0000000-0000-0000-0000-000000000009";
const HDFC_DEBT = "d0000000-0000-0000-0000-000000000001";
const CAR_DEBT = "d0000000-0000-0000-0000-000000000002";
const GOLD_DEBT = "d0000000-0000-0000-0000-000000000003";
const HOME_DEBT = "d0000000-0000-0000-0000-000000000004";
const HDFC_BILL = "b0000000-0000-0000-0000-000000000001";
const CAR_EMI = "b0000000-0000-0000-0000-000000000002";
const HOME_EMI = "b0000000-0000-0000-0000-000000000003";

let db: TestDb;

const SEED = `
  TRUNCATE bill_payments, bills, transfers, expenses, debts, accounts, auth.users CASCADE;
  INSERT INTO auth.users (id) VALUES ('${ME}'), ('${OTHER}');
  INSERT INTO accounts (id, user_id, name, type, opening_balance, opening_date) VALUES
    ('${SBI}', '${ME}', 'SBI', 'savings', 100000, '2026-01-01'),
    ('${HDFC_CARD_ACC}', '${ME}', 'HDFC Card', 'credit_card', 20000, '2026-01-01'),
    ('${CAR_LOAN_ACC}', '${ME}', 'Car Loan', 'loan', 300000, '2026-01-01'),
    ('${SAVINGS_NAMED_LIKE_LOAN}', '${ME}', 'Gold Loan', 'savings', 5000, '2026-01-01'),
    ('${OTHER_CARD_ACC}', '${OTHER}', 'Their card', 'credit_card', 0, '2026-01-01');
  -- Debt Tracker copies: the HDFC card under the SAME name, the car loan under a DIFFERENT
  -- name, a gold loan that shares its name with a savings account, and a home loan only here.
  INSERT INTO debts (id, user_id, name, type, original_amount, current_balance, interest_rate, minimum_payment) VALUES
    ('${HDFC_DEBT}', '${ME}', 'hdfc card', 'credit_card', 20000, 20000, 42, 1000),
    ('${CAR_DEBT}', '${ME}', 'Car loan (SBI)', 'personal_loan', 400000, 300000, 9, 12000),
    ('${GOLD_DEBT}', '${ME}', 'Gold Loan', 'other', 50000, 40000, 10, 0),
    ('${HOME_DEBT}', '${ME}', 'Home loan', 'mortgage', 2000000, 1500000, 8.5, 18000);
`;

beforeAll(async () => {
  // Stop before 008 so its link-up of existing data can be tested.
  db = await createTestDb({ through: "007_bill_payment_integrity" });
  await db.exec(SEED);
  await applyMigration(db, "supabase/migrations/008_debt_account_link.sql");
});

const accountsList = [
  { id: SBI, type: "savings" as AccountType, opening: 100000 },
  { id: HDFC_CARD_ACC, type: "credit_card" as AccountType, opening: 20000 },
  { id: CAR_LOAN_ACC, type: "loan" as AccountType, opening: 300000 },
  { id: SAVINGS_NAMED_LIKE_LOAN, type: "savings" as AccountType, opening: 5000 },
];

/** Net worth the way computeNetWorth does it: every account, plus Debt Tracker entries not linked to one. */
async function snapshot() {
  const expenses = (await db.query<{ id: string; date: string; amount: string; category: string; account_id: string | null }>(
    `SELECT id, date::text, amount, category, account_id FROM expenses WHERE user_id = '${ME}'`
  )).rows;
  const transfers = (await db.query<{ id: string; date: string; amount: string; from_account_id: string; to_account_id: string }>(
    `SELECT id, date::text, amount, from_account_id, to_account_id FROM transfers WHERE user_id = '${ME}'`
  )).rows;
  const debtPayments = (await db.query<DebtPaymentRow>(
    `SELECT p.id, p.paid_date::text, p.principal_amount::float8 AS principal_amount, p.kind, p.account_id, json_build_object('name', b.name) AS bill
       FROM bill_payments p JOIN bills b ON b.id = p.bill_id
      WHERE p.user_id = '${ME}' AND p.debt_id IS NOT NULL AND p.reversed_at IS NULL`
  )).rows;
  const flows: Flow[] = [
    ...expenses.filter((e) => e.account_id).map((e) => ({ account_id: e.account_id!, kind: "expense" as const, id: e.id, date: e.date, description: "", detail: "", delta: -Number(e.amount) })),
    ...transfers.flatMap((t) => [
      { account_id: t.from_account_id, kind: "transfer_out" as const, id: t.id, date: t.date, description: "", detail: "", delta: -Number(t.amount) },
      { account_id: t.to_account_id, kind: "transfer_in" as const, id: t.id, date: t.date, description: "", detail: "", delta: Number(t.amount) },
    ]),
    ...debtPaymentFlows(debtPayments),
  ];
  const balances = Object.fromEntries(
    accountsList.map((a) => [a.id, balanceFromFlows({ id: a.id, type: a.type, opening_balance: a.opening, opening_date: "2026-01-01" }, flows)])
  );
  const assets = balances[SBI] + balances[SAVINGS_NAMED_LIKE_LOAN];
  const accountLiabilities = balances[HDFC_CARD_ACC] + balances[CAR_LOAN_ACC];
  const debts = (await db.query<{ id: string; name: string; current_balance: number; account_id: string | null }>(
    `SELECT id, name, current_balance::float8 AS current_balance, account_id FROM debts WHERE user_id = '${ME}'`
  )).rows;
  const tracked = countedDebts(debts, new Set(accountsList.map((a) => a.id)));
  const spending = expenses.reduce((s, e) => s + outOfPocket({ amount: Number(e.amount), category: e.category, is_reimbursable: false, reimbursement_status: null, reimbursed_amount: 0 }), 0);
  return {
    balances,
    trackedDebtNames: tracked.map((t) => t.debt.name).sort(),
    netWorth: assets - accountLiabilities - tracked.reduce((s, t) => s + t.balance, 0),
    spending,
  };
}

async function link(debt: string) {
  const r = await db.query<{ a: string | null }>(`SELECT account_id AS a FROM debts WHERE id = $1`, [debt]);
  return r.rows[0].a;
}

describe("migration 008 links existing data safely", () => {
  it("links a same-named card/loan account (the pair the old rule treated as one)", async () => {
    expect(await link(HDFC_DEBT)).toBe(HDFC_CARD_ACC);
  });

  it("does not guess when names differ, and never links to a savings account", async () => {
    expect(await link(CAR_DEBT)).toBeNull();
    expect(await link(GOLD_DEBT)).toBeNull();
    expect(await link(HOME_DEBT)).toBeNull();
  });
});

describe("one card or loan, counted once", () => {
  beforeEach(async () => {
    await db.exec(SEED);
    await db.exec(`UPDATE debts SET account_id = '${HDFC_CARD_ACC}' WHERE id = '${HDFC_DEBT}';`);
  });

  it("the old name rule double-counted the car loan and dropped the gold loan; links fix both", async () => {
    // Unlinked: the car loan is counted twice (account ₹3,00,000 + Debt Tracker ₹3,00,000).
    let s = await snapshot();
    expect(s.trackedDebtNames).toEqual(["Car loan (SBI)", "Gold Loan", "Home loan"]);
    // The gold loan shares a name with a savings account but is a different thing, so it is counted.
    expect(s.trackedDebtNames).toContain("Gold Loan");

    await db.exec(`UPDATE debts SET account_id = '${CAR_LOAN_ACC}' WHERE id = '${CAR_DEBT}';`);
    s = await snapshot();
    expect(s.trackedDebtNames).toEqual(["Gold Loan", "Home loan"]);
    // Assets 1,05,000 − card 20,000 − car loan 3,00,000 (once) − gold 40,000 − home 15,00,000
    expect(s.netWorth).toBe(105000 - 20000 - 300000 - 40000 - 1500000);
  });

  it("only your own credit card or loan accounts can be linked", async () => {
    await expect(db.query(`UPDATE debts SET account_id = $1 WHERE id = $2`, [SBI, HOME_DEBT])).rejects.toThrow(/credit card or loan accounts/);
    await expect(db.query(`UPDATE debts SET account_id = $1 WHERE id = $2`, [OTHER_CARD_ACC, HOME_DEBT])).rejects.toThrow(/credit card or loan accounts/);
  });

  it("an account can be linked to only one Debt Tracker entry", async () => {
    await expect(db.query(`UPDATE debts SET account_id = $1 WHERE id = $2`, [HDFC_CARD_ACC, HOME_DEBT])).rejects.toMatchObject({ code: "23505" });
  });

  it("deleting the account unlinks the entry, which is then counted on its own", async () => {
    await db.exec(`DELETE FROM accounts WHERE id = '${HDFC_CARD_ACC}'`);
    expect(await link(HDFC_DEBT)).toBeNull();
  });
});

describe("bill payments against a linked entry", () => {
  beforeEach(async () => {
    await db.exec(SEED);
    await db.exec(`
      UPDATE debts SET account_id = '${HDFC_CARD_ACC}' WHERE id = '${HDFC_DEBT}';
      UPDATE debts SET account_id = '${CAR_LOAN_ACC}' WHERE id = '${CAR_DEBT}';
      INSERT INTO bills (id, user_id, name, amount, category, frequency, due_day, next_due_date, kind, account_id, to_account_id, debt_id) VALUES
        ('${HDFC_BILL}', '${ME}', 'HDFC card bill', 20000, 'Bills & Utilities', 'monthly', 15, '2026-11-15', 'credit_card', '${SBI}', NULL, '${HDFC_DEBT}'),
        ('${CAR_EMI}', '${ME}', 'Car EMI', 12000, 'Bills & Utilities', 'monthly', 7, '2026-11-07', 'loan_emi', '${SBI}', NULL, '${CAR_DEBT}'),
        ('${HOME_EMI}', '${ME}', 'Home EMI', 18000, 'Bills & Utilities', 'monthly', 10, '2026-11-10', 'loan_emi', '${SBI}', NULL, '${HOME_DEBT}');
    `);
  });

  const pay = (bill: string, amount: number, principal: number | null, interest: number | null) =>
    asUser(db, ME, () =>
      db.query<{ r: { payment: Record<string, unknown> & { id: string } } }>(
        `SELECT record_bill_payment($1, $2, '2026-11-10', 'paid', NULL, true, $3, $4) AS r`,
        [bill, amount, principal, interest]
      )
    ).then((r) => r.rows[0].r.payment);
  const reverse = (id: string) => asUser(db, ME, () => db.query(`SELECT reverse_bill_payment($1)`, [id]));
  const debtBalance = async (id: string) =>
    Number((await db.query<{ b: string }>(`SELECT current_balance AS b FROM debts WHERE id = $1`, [id])).rows[0].b);

  it("card bill paid through a linked Debt Tracker entry pays the card account, counted once", async () => {
    const before = await snapshot();
    const p = await pay(HDFC_BILL, 20000, null, null);
    expect(p).toMatchObject({ kind: "credit_card", debt_id: null, expense_id: null });
    expect(p.transfer_id).toBeTruthy();
    expect(await debtBalance(HDFC_DEBT)).toBe(20000); // the entry's own number isn't used once linked
    const after = await snapshot();
    expect(after.balances[SBI]).toBe(80000);
    expect(after.balances[HDFC_CARD_ACC]).toBe(0);
    expect(after.netWorth).toBe(before.netWorth); // paying a card moves money, it doesn't lose it
    expect(after.spending).toBe(0);

    await reverse(p.id);
    expect(await snapshot()).toEqual(before);
  });

  it("EMI on a linked loan: principal transferred to the loan account, interest is spending", async () => {
    const before = await snapshot();
    const p = await pay(CAR_EMI, 12000, 9750, 2250);
    expect(p).toMatchObject({ kind: "loan_emi", principal_amount: 9750, interest_amount: 2250, debt_id: null });
    const after = await snapshot();
    expect(after.balances[SBI]).toBe(88000);
    expect(after.balances[CAR_LOAN_ACC]).toBe(290250);
    expect(after.spending).toBe(2250);
    expect(after.netWorth).toBe(before.netWorth - 2250);

    await reverse(p.id);
    expect(await snapshot()).toEqual(before);
  });

  it("EMI principal can't exceed what is still owed on an unlinked loan", async () => {
    await db.exec(`UPDATE debts SET current_balance = 5000 WHERE id = '${HOME_DEBT}'`);
    await expect(pay(HOME_EMI, 18000, 17000, 1000)).rejects.toThrow(/more than the 5000 still owed/);
    expect(await debtBalance(HOME_DEBT)).toBe(5000);
    expect(Number((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM bill_payments`)).rows[0].n)).toBe(0);
  });

  it("a final EMI that clears the loan exactly is allowed", async () => {
    await db.exec(`UPDATE debts SET current_balance = 5000 WHERE id = '${HOME_DEBT}'`);
    await pay(HOME_EMI, 5040, 5000, 40);
    expect(await debtBalance(HOME_DEBT)).toBe(0);
  });
});
