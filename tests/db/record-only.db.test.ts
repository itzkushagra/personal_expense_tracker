import { describe, expect, it } from "vitest";
import { applyMigration, asUser, createTestDb } from "./setup";

/** Migration 20261113140000 (record-only entries) against rows written before it. */

const ME = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const SBI = "a0000000-0000-0000-0000-000000000001";
const LOAN = "c0000000-0000-0000-0000-000000000001";

describe("record-only migration", () => {
  it("keeps every existing entry moving the balance, and lets new ones be record-only", async () => {
    const db = await createTestDb({ through: "20261113120000" });
    await db.exec(`
      INSERT INTO auth.users (id) VALUES ('${ME}'), ('${OTHER}');
      INSERT INTO accounts (id, user_id, name, type, opening_balance, opening_date) VALUES ('${SBI}', '${ME}', 'SBI', 'savings', 0, '2026-01-01');
      INSERT INTO held_funds (id, user_id, person_name, direction) VALUES ('${LOAN}', '${ME}', 'Rahul', 'holding');
      INSERT INTO held_fund_entries (held_fund_id, user_id, type, amount, date, account_id) VALUES ('${LOAN}', '${ME}', 'in', 2000, '2026-11-01', '${SBI}');
      INSERT INTO incomes (user_id, amount, source, date, account_id) VALUES ('${ME}', 500, 'Salary', '2026-11-01', '${SBI}');
    `);
    await applyMigration(db, "supabase/migrations/20261113140000_record_only_entries.sql");

    const before = await db.query<{ t: string; moves_balance: boolean }>(`
      SELECT 'loan' AS t, moves_balance FROM held_fund_entries UNION ALL SELECT 'income', moves_balance FROM incomes`);
    expect(before.rows).toEqual([
      { t: "loan", moves_balance: true },
      { t: "income", moves_balance: true },
    ]);

    // Marking the friend's money as already in the account; RLS still applies to the edit.
    await asUser(db, ME, () => db.query(`UPDATE held_fund_entries SET moves_balance = false`));
    await asUser(db, OTHER, () => db.query(`UPDATE incomes SET moves_balance = false`));
    const after = await db.query<{ t: string; moves_balance: boolean }>(`
      SELECT 'loan' AS t, moves_balance FROM held_fund_entries UNION ALL SELECT 'income', moves_balance FROM incomes`);
    expect(after.rows).toEqual([
      { t: "loan", moves_balance: false },
      { t: "income", moves_balance: true },
    ]);
  });

  it("investment transactions get the column too, defaulting to moving cash", async () => {
    const db = await createTestDb();
    const { rows } = await db.query<{ column_default: string; is_nullable: string }>(
      `SELECT column_default, is_nullable FROM information_schema.columns WHERE table_name = 'investment_transactions' AND column_name = 'moves_balance'`
    );
    expect(rows).toEqual([{ column_default: "true", is_nullable: "NO" }]);
  });
});
