import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb, signIn, signOut, type TestDb } from "./setup";
import { balanceFromFlows, debtPaymentFlows, type DebtPaymentRow, type Flow } from "@/lib/ledger";
import { outOfPocket, type AccountType } from "@/types";

/**
 * record_bill_payment / reverse_bill_payment (migrations 006 + 007) against a
 * real Postgres with every migration applied. Each test starts from the same seed.
 */

const ME = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const SBI = "a0000000-0000-0000-0000-000000000001";
const CARD = "a0000000-0000-0000-0000-000000000002";
const OTHER_BANK = "a0000000-0000-0000-0000-000000000009";
const LOAN = "d0000000-0000-0000-0000-000000000001";
const CARD_DEBT = "d0000000-0000-0000-0000-000000000002";
const ELECTRICITY = "b0000000-0000-0000-0000-000000000001";
const CARD_BILL = "b0000000-0000-0000-0000-000000000002";
const CARD_DEBT_BILL = "b0000000-0000-0000-0000-000000000003";
const EMI_BILL = "b0000000-0000-0000-0000-000000000004";
const CARD_BILL_NO_ACCOUNT = "b0000000-0000-0000-0000-000000000005";
const MONTH_END_BILL = "b0000000-0000-0000-0000-000000000006";
const KEY_1 = "c0000000-0000-0000-0000-000000000001";
const KEY_2 = "c0000000-0000-0000-0000-000000000002";

type Payment = Record<string, unknown> & { id: string };

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  // Reset to a known state as the table owner (row-level security off).
  await db.exec(`
    TRUNCATE bill_payments, bills, transfers, expenses, debts, accounts, auth.users CASCADE;
    INSERT INTO auth.users (id) VALUES ('${ME}'), ('${OTHER}');
    INSERT INTO accounts (id, user_id, name, type, opening_balance, opening_date) VALUES
      ('${SBI}', '${ME}', 'SBI', 'savings', 50000, '2026-01-01'),
      ('${CARD}', '${ME}', 'HDFC Card', 'credit_card', 15200, '2026-01-01'),
      ('${OTHER_BANK}', '${OTHER}', 'Other bank', 'savings', 1000, '2026-01-01');
    INSERT INTO debts (id, user_id, name, type, original_amount, current_balance, interest_rate, minimum_payment) VALUES
      ('${LOAN}', '${ME}', 'Bike loan', 'personal_loan', 120000, 100000, 12, 10000),
      ('${CARD_DEBT}', '${ME}', 'ICICI card', 'credit_card', 8000, 8000, 36, 400);
    INSERT INTO bills (id, user_id, name, amount, category, frequency, due_day, next_due_date, kind, account_id, to_account_id, debt_id) VALUES
      ('${ELECTRICITY}', '${ME}', 'Electricity', 1200, 'Bills & Utilities', 'monthly', 5, '2026-11-05', 'expense', '${SBI}', NULL, NULL),
      ('${CARD_BILL}', '${ME}', 'HDFC card bill', 15200, 'Bills & Utilities', 'monthly', 15, '2026-11-15', 'credit_card', '${SBI}', '${CARD}', NULL),
      ('${CARD_DEBT_BILL}', '${ME}', 'ICICI card bill', 8000, 'Bills & Utilities', 'monthly', 20, '2026-11-20', 'credit_card', '${SBI}', NULL, '${CARD_DEBT}'),
      ('${EMI_BILL}', '${ME}', 'Bike loan EMI', 10000, 'Bills & Utilities', 'monthly', 7, '2026-11-07', 'loan_emi', '${SBI}', NULL, '${LOAN}'),
      ('${CARD_BILL_NO_ACCOUNT}', '${ME}', 'Card, no pay-from', 500, 'Bills & Utilities', 'monthly', 1, '2026-11-01', 'credit_card', NULL, '${CARD}', NULL),
      ('${MONTH_END_BILL}', '${ME}', 'Broadband', 700, 'Bills & Utilities', 'monthly', 31, '2026-01-31', 'expense', '${SBI}', NULL, NULL);
  `);
});

interface PayOptions {
  account?: string | null;
  createExpense?: boolean;
  principal?: number;
  interest?: number;
  fees?: number;
  occurrence?: string;
  settles?: boolean | null;
  key?: string;
}

const PAY_SQL = `SELECT record_bill_payment($1, $2, '2026-11-10', 'paid', $3, $4, $5, $6, $7, $8, $9, $10) AS r`;
const payParams = (bill: string, amount: number, o: PayOptions) => [
  bill, amount, o.account ?? null, o.createExpense ?? true, o.principal ?? null, o.interest ?? null,
  o.fees ?? 0, o.occurrence ?? null, o.settles ?? null, o.key ?? null,
];

async function pay(bill: string, amount: number, o: PayOptions = {}) {
  const r = await asUser(db, ME, () => db.query<{ r: { payment: Payment; replayed: boolean } }>(PAY_SQL, payParams(bill, amount, o)));
  return r.rows[0].r;
}

async function reverse(paymentId: string, reason: string | null = null, user = ME) {
  const r = await asUser(db, user, () => db.query<Payment>(`SELECT * FROM reverse_bill_payment($1, $2)`, [paymentId, reason]));
  return r.rows[0];
}

async function count(table: string, where = "true") {
  const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`);
  return r.rows[0].n;
}

async function debtBalance(id: string) {
  const r = await db.query<{ b: string }>(`SELECT current_balance AS b FROM debts WHERE id = $1`, [id]);
  return Number(r.rows[0].b);
}

async function nextDue(bill: string) {
  const r = await db.query<{ d: string }>(`SELECT next_due_date::text AS d FROM bills WHERE id = $1`, [bill]);
  return r.rows[0].d;
}

async function paymentRow(id: string) {
  const r = await db.query<Payment>(`SELECT * FROM bill_payments WHERE id = $1`, [id]);
  return r.rows[0];
}

/** Account balances, spending and net worth the way the app computes them, from what's in the database. */
async function ledger() {
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
  const acct = (id: string, type: AccountType, opening: number) => ({ id, type, opening_balance: opening, opening_date: "2026-01-01" });
  const sbi = balanceFromFlows(acct(SBI, "savings", 50000), flows);
  const card = balanceFromFlows(acct(CARD, "credit_card", 15200), flows);
  const loan = await debtBalance(LOAN);
  const cardDebt = await debtBalance(CARD_DEBT);
  return {
    sbi,
    card,
    spending: expenses.reduce((s, e) => s + outOfPocket({ amount: Number(e.amount), category: e.category, is_reimbursable: false, reimbursement_status: null, reimbursed_amount: 0 }), 0),
    netWorth: sbi - card - loan - cardDebt,
  };
}
// Seeded net worth: 50,000 − 15,200 − 1,00,000 − 8,000
const START_NET_WORTH = -73200;

// ---------------------------------------------------------------- Task 1 behaviour (kept)

describe("recording payments", () => {
  it("regular bill: one expense for the whole amount, due date moves to the next due day", async () => {
    const { payment } = await pay(ELECTRICITY, 1200);
    expect(payment).toMatchObject({ kind: "expense", principal_amount: 0, interest_amount: 0, fees_amount: 0, occurrence_date: "2026-11-05", settles_occurrence: true });
    expect(await count("expenses", "description = 'Electricity' AND amount = 1200")).toBe(1);
    expect(await nextDue(ELECTRICITY)).toBe("2026-12-05");
    expect(await ledger()).toMatchObject({ sbi: 48800, spending: 1200, netWorth: START_NET_WORTH - 1200 });
  });

  it("regular bill logged by Rent & Home records no second expense", async () => {
    const { payment } = await pay(ELECTRICITY, 1200, { createExpense: false });
    expect(payment.expense_id).toBeNull();
    expect(await count("expenses")).toBe(0);
  });

  it("card bill paid to a card account: a transfer, never an expense", async () => {
    const { payment } = await pay(CARD_BILL, 15200);
    expect(payment).toMatchObject({ kind: "credit_card", principal_amount: 15200, expense_id: null });
    expect(await count("expenses")).toBe(0);
    expect(await ledger()).toMatchObject({ sbi: 34800, card: 0, spending: 0, netWorth: START_NET_WORTH });
  });

  it("card bill with no pay-from account is refused, saving nothing", async () => {
    await expect(pay(CARD_BILL_NO_ACCOUNT, 500)).rejects.toThrow(/Choose the account you paid the card from/);
    expect(await count("bill_payments")).toBe(0);
    expect(await count("transfers")).toBe(0);
    expect(await nextDue(CARD_BILL_NO_ACCOUNT)).toBe("2026-11-01");
  });

  it("card tracked in the Debt Tracker: debt reduced, no expense, no transfer", async () => {
    await pay(CARD_DEBT_BILL, 8000);
    expect(await debtBalance(CARD_DEBT)).toBe(0);
    expect(await count("expenses")).toBe(0);
    expect(await ledger()).toMatchObject({ sbi: 42000, spending: 0, netWorth: START_NET_WORTH });
  });

  it("EMI: principal reduces the loan, only interest is spending", async () => {
    const { payment } = await pay(EMI_BILL, 10000, { principal: 9000, interest: 1000 });
    expect(payment).toMatchObject({ principal_amount: 9000, interest_amount: 1000, fees_amount: 0 });
    expect(await debtBalance(LOAN)).toBe(91000);
    expect(await ledger()).toMatchObject({ sbi: 40000, spending: 1000, netWorth: START_NET_WORTH - 1000 });
  });
});

// ---------------------------------------------------------------- 1. Reversal

describe("reversing payments", () => {
  it("regular bill: expense removed, due date reopened, payment kept as history", async () => {
    const { payment } = await pay(ELECTRICITY, 1200);
    const reversed = await reverse(payment.id, "Paid by mistake");
    expect(reversed.reversed_at).toBeTruthy();
    expect(reversed.reversal_reason).toBe("Paid by mistake");
    expect(reversed.reversal_snapshot).toMatchObject({
      expense: { amount: 1200, description: "Electricity" },
      next_due_before: "2026-12-05",
      next_due_after: "2026-11-05",
    });
    expect(await count("bill_payments")).toBe(1);
    expect(await count("expenses")).toBe(0);
    expect(await nextDue(ELECTRICITY)).toBe("2026-11-05");
    expect(await ledger()).toMatchObject({ sbi: 50000, spending: 0, netWorth: START_NET_WORTH });
  });

  it("credit card: transfer removed, card owes the full statement again", async () => {
    const { payment } = await pay(CARD_BILL, 15200);
    const reversed = await reverse(payment.id);
    expect(reversed.reversal_snapshot).toMatchObject({ transfer: { amount: 15200, from_account_id: SBI, to_account_id: CARD } });
    expect(await count("transfers")).toBe(0);
    expect(await nextDue(CARD_BILL)).toBe("2026-11-15");
    expect(await ledger()).toMatchObject({ sbi: 50000, card: 15200, netWorth: START_NET_WORTH });
  });

  it("card in the Debt Tracker: the debt is put back", async () => {
    const { payment } = await pay(CARD_DEBT_BILL, 8000);
    await reverse(payment.id);
    expect(await debtBalance(CARD_DEBT)).toBe(8000);
    expect(await ledger()).toMatchObject({ sbi: 50000, netWorth: START_NET_WORTH });
  });

  it("EMI with interest and charges: loan restored, both expenses removed", async () => {
    const { payment } = await pay(EMI_BILL, 10000, { principal: 8800, interest: 1000, fees: 200 });
    expect(await count("expenses")).toBe(2);
    const reversed = await reverse(payment.id);
    expect(reversed.reversal_snapshot).toMatchObject({
      expense: { amount: 1000, description: "Bike loan EMI (interest)" },
      fee_expense: { amount: 200, description: "Bike loan EMI (charges)" },
      debt_balance_before: 91200,
    });
    expect(await debtBalance(LOAN)).toBe(100000);
    expect(await count("expenses")).toBe(0);
    expect(await nextDue(EMI_BILL)).toBe("2026-11-07");
    expect(await ledger()).toMatchObject({ sbi: 50000, spending: 0, netWorth: START_NET_WORTH });
  });

  it("EMI with a custom split from the loan statement: reversal restores exactly that split", async () => {
    // Statement says ₹875.40 interest, not the ₹1,000 estimate.
    const { payment } = await pay(EMI_BILL, 10000, { principal: 9124.6, interest: 875.4 });
    expect(await debtBalance(LOAN)).toBe(90875.4);
    expect(await ledger()).toMatchObject({ sbi: 40000, spending: 875.4, netWorth: expect.closeTo(START_NET_WORTH - 875.4, 2) });
    const reversed = await reverse(payment.id);
    expect(reversed.reversal_snapshot).toMatchObject({ expense: { amount: 875.4 }, debt_balance_before: 90875.4 });
    expect(await debtBalance(LOAN)).toBe(100000);
    expect(await count("expenses")).toBe(0);
    expect(await nextDue(EMI_BILL)).toBe("2026-11-07");
    expect(await ledger()).toMatchObject({ sbi: 50000, spending: 0, netWorth: START_NET_WORTH });
  });

  it("reversing one payment leaves every other bill's payments, balances and due dates alone", async () => {
    const electricity = (await pay(ELECTRICITY, 1200)).payment;
    await pay(CARD_BILL, 15200);
    await pay(EMI_BILL, 10000, { principal: 9000, interest: 1000 });
    const before = await ledger();
    await reverse(electricity.id);
    expect(await nextDue(ELECTRICITY)).toBe("2026-11-05");
    expect(await nextDue(CARD_BILL)).toBe("2026-12-15");
    expect(await nextDue(EMI_BILL)).toBe("2026-12-07");
    expect(await count("transfers")).toBe(1);
    expect(await debtBalance(LOAN)).toBe(91000);
    expect(await ledger()).toEqual({ ...before, sbi: before.sbi + 1200, spending: before.spending - 1200, netWorth: before.netWorth + 1200 });
  });

  it("a reversed payment can't be reversed again", async () => {
    const { payment } = await pay(ELECTRICITY, 1200);
    await reverse(payment.id);
    await expect(reverse(payment.id)).rejects.toMatchObject({ code: "SW409", message: expect.stringMatching(/already reversed/) });
  });

  it("if any step fails, the whole reversal rolls back", async () => {
    const { payment } = await pay(EMI_BILL, 10000, { principal: 8800, interest: 1000, fees: 200 });
    // Make the last delete in the reversal fail.
    await db.exec(`
      CREATE FUNCTION fail_fee_delete() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF OLD.description LIKE '%(charges)' THEN RAISE EXCEPTION 'simulated failure'; END IF; RETURN OLD; END $$;
      CREATE TRIGGER fail_fee_delete BEFORE DELETE ON expenses FOR EACH ROW EXECUTE FUNCTION fail_fee_delete();
    `);
    try {
      await expect(reverse(payment.id)).rejects.toThrow(/simulated failure/);
      // Nothing changed: the interest expense (deleted earlier in the same call) is back too.
      expect(await count("expenses")).toBe(2);
      expect(await debtBalance(LOAN)).toBe(91200);
      expect((await paymentRow(payment.id)).reversed_at).toBeNull();
      expect(await nextDue(EMI_BILL)).toBe("2026-12-07");
    } finally {
      await db.exec(`DROP TRIGGER fail_fee_delete ON expenses; DROP FUNCTION fail_fee_delete();`);
    }
  });

  it("another user can't reverse my payment", async () => {
    const { payment } = await pay(CARD_BILL, 15200);
    await expect(reverse(payment.id, null, OTHER)).rejects.toThrow(/Payment not found/);
    expect(await count("transfers")).toBe(1);
  });
});

// ---------------------------------------------------------------- Due dates across periods

describe("due dates across recurring periods", () => {
  it("reversing an earlier period reopens it without losing the later one; paying it skips ahead", async () => {
    const nov = (await pay(ELECTRICITY, 1200)).payment; // Nov 5 → Dec 5
    await pay(ELECTRICITY, 1250); // Dec 5 → Jan 5
    expect(await nextDue(ELECTRICITY)).toBe("2027-01-05");

    await reverse(nov.id);
    expect(await nextDue(ELECTRICITY)).toBe("2026-11-05"); // November is unpaid again
    expect(await count("bill_payments", "occurrence_date = '2026-12-05' AND reversed_at IS NULL")).toBe(1); // December still paid

    await pay(ELECTRICITY, 1200); // pays Nov 5 again
    expect(await nextDue(ELECTRICITY)).toBe("2027-01-05"); // skips the already-paid Dec 5
    expect(await ledger()).toMatchObject({ spending: 2450, sbi: 47550 });
  });

  it("reversing a later period while an earlier one is open leaves the earlier one due", async () => {
    const nov = (await pay(ELECTRICITY, 1200)).payment;
    const dec = (await pay(ELECTRICITY, 1250)).payment;
    await reverse(nov.id);
    await reverse(dec.id);
    expect(await nextDue(ELECTRICITY)).toBe("2026-11-05");
  });

  it("due dates follow the bill's due day at month ends: 31 Jan → 28 Feb → 31 Mar", async () => {
    await pay(MONTH_END_BILL, 700);
    expect(await nextDue(MONTH_END_BILL)).toBe("2026-02-28");
    await pay(MONTH_END_BILL, 700);
    expect(await nextDue(MONTH_END_BILL)).toBe("2026-03-31");
  });
});

// ---------------------------------------------------------------- 2. Duplicates

describe("duplicate payments", () => {
  it("the same request sent twice records one payment (retry / double submit)", async () => {
    const first = await pay(ELECTRICITY, 1200, { key: KEY_1 });
    const retry = await pay(ELECTRICITY, 1200, { key: KEY_1 });
    expect(first.replayed).toBe(false);
    expect(retry).toMatchObject({ replayed: true, payment: { id: first.payment.id } });
    expect(await count("bill_payments")).toBe(1);
    expect(await count("expenses")).toBe(1);
    expect(await nextDue(ELECTRICITY)).toBe("2026-12-05");
  });

  it("a request id can't be reused for a different bill", async () => {
    await pay(ELECTRICITY, 1200, { key: KEY_1 });
    await expect(pay(CARD_BILL, 15200, { key: KEY_1 })).rejects.toMatchObject({ code: "SW409" });
    expect(await count("transfers")).toBe(0);
  });

  it("a due date already paid can't be paid again, even with a new request id (double click)", async () => {
    await pay(ELECTRICITY, 1200, { key: KEY_1, occurrence: "2026-11-05" });
    await expect(pay(ELECTRICITY, 1200, { key: KEY_2, occurrence: "2026-11-05" })).rejects.toMatchObject({
      code: "SW409",
      message: expect.stringMatching(/already paid/),
    });
    expect(await count("expenses")).toBe(1);
    expect(await nextDue(ELECTRICITY)).toBe("2026-12-05"); // December was not paid by the second click
  });

  it("two requests at the same moment for the same due date: exactly one is recorded", async () => {
    await signIn(db, ME);
    let results: PromiseSettledResult<unknown>[];
    try {
      results = await Promise.allSettled([
        db.query(PAY_SQL, payParams(ELECTRICITY, 1200, { key: KEY_1, occurrence: "2026-11-05" })),
        db.query(PAY_SQL, payParams(ELECTRICITY, 1200, { key: KEY_2, occurrence: "2026-11-05" })),
      ]);
    } finally {
      await signOut(db);
    }
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await count("bill_payments")).toBe(1);
    expect(await count("expenses")).toBe(1);
  });

  it("the same request twice at the same moment returns the same payment", async () => {
    await signIn(db, ME);
    let ids: string[];
    try {
      const [a, b] = await Promise.all([
        db.query<{ r: { payment: Payment } }>(PAY_SQL, payParams(CARD_BILL, 15200, { key: KEY_1 })),
        db.query<{ r: { payment: Payment } }>(PAY_SQL, payParams(CARD_BILL, 15200, { key: KEY_1 })),
      ]);
      ids = [a.rows[0].r.payment.id, b.rows[0].r.payment.id];
    } finally {
      await signOut(db);
    }
    expect(ids[0]).toBe(ids[1]);
    expect(await count("transfers")).toBe(1);
  });

  it("the database itself refuses a second settling payment or a reused request id", async () => {
    await pay(ELECTRICITY, 1200, { key: KEY_1 });
    await expect(db.query(
      `INSERT INTO bill_payments (bill_id, user_id, amount_paid, kind, occurrence_date, settles_occurrence) VALUES ($1, $2, 1200, 'expense', '2026-11-05', true)`,
      [ELECTRICITY, ME]
    )).rejects.toMatchObject({ code: "23505" });
    await expect(db.query(
      `INSERT INTO bill_payments (bill_id, user_id, amount_paid, kind, occurrence_date, settles_occurrence, idempotency_key) VALUES ($1, $2, 100, 'expense', '2026-12-05', false, $3)`,
      [ELECTRICITY, ME, KEY_1]
    )).rejects.toMatchObject({ code: "23505" });
  });

  it("after a reversal the same due date can be paid again", async () => {
    const { payment } = await pay(ELECTRICITY, 1200);
    await reverse(payment.id);
    await pay(ELECTRICITY, 1150);
    expect(await count("bill_payments", "reversed_at IS NULL")).toBe(1);
    expect(await ledger()).toMatchObject({ spending: 1150 });
  });
});

// ---------------------------------------------------------------- Partial payments

describe("part payments", () => {
  it("several parts toward one due date are allowed; it completes when they reach the bill amount", async () => {
    await pay(ELECTRICITY, 400);
    await pay(ELECTRICITY, 400);
    expect(await nextDue(ELECTRICITY)).toBe("2026-11-05"); // ₹800 of ₹1,200: still due
    const last = await pay(ELECTRICITY, 400);
    expect(last.payment.settles_occurrence).toBe(true);
    expect(await nextDue(ELECTRICITY)).toBe("2026-12-05");
    expect(await count("bill_payments", "occurrence_date = '2026-11-05'")).toBe(3);
    expect(await ledger()).toMatchObject({ spending: 1200, sbi: 48800 });
  });

  it("a smaller final bill can be marked complete", async () => {
    await pay(ELECTRICITY, 950, { settles: true });
    expect(await nextDue(ELECTRICITY)).toBe("2026-12-05");
  });

  it("a part payment never completes the due date when marked as a part", async () => {
    await pay(ELECTRICITY, 1200, { settles: false });
    expect(await nextDue(ELECTRICITY)).toBe("2026-11-05");
  });

  it("card part payments each transfer their own amount", async () => {
    await pay(CARD_BILL, 5000);
    await pay(CARD_BILL, 10200);
    expect(await nextDue(CARD_BILL)).toBe("2026-12-15");
    expect(await ledger()).toMatchObject({ sbi: 34800, card: 0 });
  });

  it("no more parts once the due date is complete", async () => {
    await pay(ELECTRICITY, 1200);
    await expect(pay(ELECTRICITY, 100, { occurrence: "2026-11-05", settles: false })).rejects.toMatchObject({ code: "SW409" });
  });

  it("parts are reversed latest-first; reversing the completing one reopens the due date", async () => {
    const part = (await pay(ELECTRICITY, 400)).payment;
    const rest = (await pay(ELECTRICITY, 800)).payment;
    await expect(reverse(part.id)).rejects.toMatchObject({ code: "SW409", message: expect.stringMatching(/first/) });
    await reverse(rest.id);
    expect(await nextDue(ELECTRICITY)).toBe("2026-11-05");
    await reverse(part.id);
    expect(await ledger()).toMatchObject({ spending: 0, sbi: 50000 });
  });
});

// ---------------------------------------------------------------- 3. Allocation

describe("every rupee allocated", () => {
  it("EMI with charges: principal + interest + charges = amount paid", async () => {
    const { payment } = await pay(EMI_BILL, 10000, { principal: 8800, interest: 1000, fees: 200 });
    expect(payment).toMatchObject({ principal_amount: 8800, interest_amount: 1000, fees_amount: 200 });
    expect(payment.fee_expense_id).toBeTruthy();
    expect(await debtBalance(LOAN)).toBe(91200);
    expect(await count("expenses", "description = 'Bike loan EMI (charges)' AND amount = 200")).toBe(1);
    expect(await ledger()).toMatchObject({ sbi: 40000, spending: 1200, netWorth: START_NET_WORTH - 1200 });
  });

  it("an EMI split that leaves money unallocated is refused", async () => {
    await expect(pay(EMI_BILL, 10000, { principal: 8000, interest: 1000, fees: 200 })).rejects.toThrow(/add up/);
    expect(await count("bill_payments")).toBe(0);
    expect(await debtBalance(LOAN)).toBe(100000);
  });

  it("charges can't be put on a regular or card bill", async () => {
    await expect(pay(ELECTRICITY, 1200, { fees: 50 })).rejects.toThrow(/only be recorded on a loan EMI/);
    expect(await count("bill_payments")).toBe(0);
  });

  it("the database rejects any row whose parts don't add up, whatever writes it", async () => {
    const insert = (kind: string, amount: number, principal: number, interest: number, fees: number) =>
      db.query(
        `INSERT INTO bill_payments (bill_id, user_id, amount_paid, kind, principal_amount, interest_amount, fees_amount) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [EMI_BILL, ME, amount, kind, principal, interest, fees]
      );
    await expect(insert("loan_emi", 10000, 8000, 1000, 0)).rejects.toMatchObject({ code: "23514" });
    await expect(insert("credit_card", 5000, 4000, 0, 0)).rejects.toMatchObject({ code: "23514" });
    await expect(insert("expense", 1200, 100, 0, 0)).rejects.toMatchObject({ code: "23514" });
    await expect(insert("loan_emi", 10000, 8800, 1000, 200)).resolves.toBeTruthy();
  });
});

// ---------------------------------------------------------------- Security

describe("row-level security", () => {
  it("is active for signed-in users in this test database", async () => {
    const mine = await asUser(db, ME, () => db.query<{ n: number }>(`SELECT count(*)::int AS n FROM bills`));
    const theirs = await asUser(db, OTHER, () => db.query<{ n: number }>(`SELECT count(*)::int AS n FROM bills`));
    expect(mine.rows[0].n).toBe(6);
    expect(theirs.rows[0].n).toBe(0);
  });

  it("another user cannot pay my bill", async () => {
    await expect(
      asUser(db, OTHER, () => db.query(`SELECT record_bill_payment($1, 100, '2026-11-10')`, [ELECTRICITY]))
    ).rejects.toThrow(/Bill not found/);
    expect(await count("bill_payments")).toBe(0);
  });

  it("I cannot pay from someone else's account", async () => {
    await expect(pay(ELECTRICITY, 1200, { account: OTHER_BANK })).rejects.toThrow(/Pay-from account not found/);
    expect(await count("expenses")).toBe(0);
  });
});
