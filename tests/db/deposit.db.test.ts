import { describe, expect, it } from "vitest";
import { asUser, createTestDb } from "./setup";

/** Migration 20261113160000: rent paid from the security deposit. */

const ME = "11111111-1111-1111-1111-111111111111";
const SBI = "a0000000-0000-0000-0000-000000000001";

const errorOf = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};

describe("rent from the security deposit", () => {
  it("existing expenses aren't deposit-paid, and a deposit-paid one can't have a bank account", async () => {
    const db = await createTestDb();
    await db.exec(`
      INSERT INTO auth.users (id) VALUES ('${ME}');
      INSERT INTO accounts (id, user_id, name, type, opening_balance, opening_date) VALUES ('${SBI}', '${ME}', 'SBI', 'savings', 0, '2026-11-13');
    `);
    const add = (account: string | null, fromDeposit: boolean) =>
      db.query(
        `INSERT INTO expenses (user_id, amount, description, category, date, account_id, paid_from_deposit)
         VALUES ('${ME}', 18000, 'Flat rent', 'Rent', '2027-01-01', ${account ? `'${account}'` : "NULL"}, ${fromDeposit})`
      );
    await asUser(db, ME, () => add(SBI, false));
    await asUser(db, ME, () => add(null, true));
    expect(await errorOf(() => asUser(db, ME, () => add(SBI, true)))).toMatch(/expenses_deposit_has_no_account/);

    const { rows } = await db.query<{ paid_from_deposit: boolean }>("SELECT paid_from_deposit FROM expenses ORDER BY paid_from_deposit");
    expect(rows.map((r) => r.paid_from_deposit)).toEqual([false, true]);
    const def = await db.query<{ column_default: string }>(
      "SELECT column_default FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'paid_from_deposit'"
    );
    expect(def.rows[0].column_default).toBe("false");
  });
});
