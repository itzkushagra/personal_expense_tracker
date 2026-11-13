import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb, type TestDb } from "./setup";

/** Migration 20261113120000 (SIPs and fund categories) on in-memory Postgres with RLS on. */

const ME = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const SBI = "a0000000-0000-0000-0000-000000000001";
const THEIR_ACC = "a0000000-0000-0000-0000-000000000009";
const SMALL = "f0000000-0000-0000-0000-000000000001";
const MID = "f0000000-0000-0000-0000-000000000002";
const THEIR_FUND = "f0000000-0000-0000-0000-000000000009";
const SIP = "50000000-0000-0000-0000-000000000001";
const THEIR_SIP = "50000000-0000-0000-0000-000000000009";

let db: TestDb;

const SEED = `
  TRUNCATE investment_sips, investment_transactions, investment_holdings, accounts, auth.users CASCADE;
  INSERT INTO auth.users (id) VALUES ('${ME}'), ('${OTHER}');
  INSERT INTO accounts (id, user_id, name, type, opening_balance, opening_date) VALUES
    ('${SBI}', '${ME}', 'SBI', 'savings', 100000, '2026-01-01'),
    ('${THEIR_ACC}', '${OTHER}', 'Their bank', 'savings', 0, '2026-01-01');
  INSERT INTO investment_holdings (id, user_id, name, fund_category) VALUES
    ('${SMALL}', '${ME}', 'Small cap fund', 'small_cap'),
    ('${MID}', '${ME}', 'Mid cap fund', 'mid_cap'),
    ('${THEIR_FUND}', '${OTHER}', 'Their fund', '');
  INSERT INTO investment_sips (id, user_id, holding_id, amount, day_of_month, account_id) VALUES
    ('${SIP}', '${ME}', '${SMALL}', 5000, 5, '${SBI}'),
    ('${THEIR_SIP}', '${OTHER}', '${THEIR_FUND}', 1000, 10, NULL);
`;

const errorOf = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};

const instalment = (holding: string, sip: string, date: string) =>
  db.query(
    `INSERT INTO investment_transactions (user_id, holding_id, type, date, quantity, price, account_id, sip_id)
     VALUES ('${ME}', '${holding}', 'buy', '${date}', 57.0423, 87.6543, '${SBI}', '${sip}')`
  );

beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await db.exec(SEED);
});

describe("SIP instalments", () => {
  it("logs one instalment per month", async () => {
    await asUser(db, ME, () => instalment(SMALL, SIP, "2026-10-05"));
    await asUser(db, ME, () => instalment(SMALL, SIP, "2026-11-05"));
    // A second November instalment, even on another day, is refused.
    expect(await errorOf(() => asUser(db, ME, () => instalment(SMALL, SIP, "2026-11-20")))).toMatch(/duplicate key/i);
  });

  it("ordinary buys of the same fund are unaffected by the one-per-month rule", async () => {
    await asUser(db, ME, () => instalment(SMALL, SIP, "2026-11-05"));
    await asUser(db, ME, () =>
      db.query(`INSERT INTO investment_transactions (user_id, holding_id, type, date, quantity, price) VALUES ('${ME}', '${SMALL}', 'buy', '2026-11-05', 1, 1)`)
    );
    const { rows } = await asUser(db, ME, () => db.query("SELECT 1 FROM investment_transactions"));
    expect(rows).toHaveLength(2);
  });

  it("an instalment must belong to a SIP for the same fund, and to me", async () => {
    expect(await errorOf(() => asUser(db, ME, () => instalment(MID, SIP, "2026-11-05")))).toMatch(/row-level security/i);
    expect(await errorOf(() => asUser(db, ME, () => instalment(SMALL, THEIR_SIP, "2026-11-05")))).toMatch(/row-level security/i);
  });

  it("removing a SIP keeps its instalments as normal buys", async () => {
    await asUser(db, ME, () => instalment(SMALL, SIP, "2026-11-05"));
    await asUser(db, ME, () => db.query(`DELETE FROM investment_sips WHERE id = '${SIP}'`));
    const { rows } = await asUser(db, ME, () =>
      db.query<{ sip_id: string | null }>("SELECT sip_id FROM investment_transactions")
    );
    expect(rows).toEqual([{ sip_id: null }]);
  });
});

describe("SIP plans", () => {
  const plan = (holding: string, account: string | null, day = 5, amount = 1000) =>
    db.query(
      `INSERT INTO investment_sips (user_id, holding_id, amount, day_of_month, account_id)
       VALUES ('${ME}', '${holding}', ${amount}, ${day}, ${account ? `'${account}'` : "NULL"})`
    );

  it("several SIPs, one per fund, are fine", async () => {
    await asUser(db, ME, () => plan(MID, SBI, 25, 3000));
    const { rows } = await asUser(db, ME, () => db.query<{ n: number }>("SELECT count(*)::int AS n FROM investment_sips"));
    expect(rows[0].n).toBe(2);
  });

  it("refuses another user's fund or account, a zero amount and an impossible day", async () => {
    expect(await errorOf(() => asUser(db, ME, () => plan(THEIR_FUND, null)))).toMatch(/row-level security/i);
    expect(await errorOf(() => asUser(db, ME, () => plan(MID, THEIR_ACC)))).toMatch(/row-level security/i);
    expect(await errorOf(() => asUser(db, ME, () => plan(MID, SBI, 5, 0)))).toMatch(/check constraint/i);
    expect(await errorOf(() => asUser(db, ME, () => plan(MID, SBI, 0)))).toMatch(/check constraint/i);
    expect(await errorOf(() => asUser(db, ME, () => plan(MID, SBI, 32)))).toMatch(/check constraint/i);
  });

  it("I only see my own SIPs", async () => {
    const { rows } = await asUser(db, ME, () => db.query<{ id: string }>("SELECT id FROM investment_sips"));
    expect(rows.map((r) => r.id)).toEqual([SIP]);
  });

  it("fund categories are limited to the known list", async () => {
    expect(
      await errorOf(() => asUser(db, ME, () => db.query(`UPDATE investment_holdings SET fund_category = 'micro_cap' WHERE id = '${MID}'`)))
    ).toMatch(/check constraint/i);
  });
});
