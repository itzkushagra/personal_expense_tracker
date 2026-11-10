import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asUser, createTestDb, type TestDb } from "./setup";
import { balanceFromFlows, investmentFlows } from "@/lib/ledger";
import { summarizeHolding } from "@/lib/portfolio";

/**
 * Migrations 20261110200000 (account adjustments) and 20261110200100 (investment portfolio),
 * run on an in-memory Postgres with row-level security on, exactly as signed-in users hit it.
 * Nothing here touches the hosted Supabase project.
 */

const ME = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const SBI = "a0000000-0000-0000-0000-000000000001";
const THEIR_ACC = "a0000000-0000-0000-0000-000000000009";
const FUND = "f0000000-0000-0000-0000-000000000001";
const THEIR_FUND = "f0000000-0000-0000-0000-000000000009";

let db: TestDb;

const SEED = `
  TRUNCATE investment_transactions, investment_holdings, account_adjustments, accounts, auth.users CASCADE;
  INSERT INTO auth.users (id) VALUES ('${ME}'), ('${OTHER}');
  INSERT INTO accounts (id, user_id, name, type, opening_balance, opening_date) VALUES
    ('${SBI}', '${ME}', 'SBI', 'savings', 100000, '2026-01-01'),
    ('${THEIR_ACC}', '${OTHER}', 'Their bank', 'savings', 5000, '2026-01-01');
  INSERT INTO investment_holdings (id, user_id, name, asset_type, current_price) VALUES
    ('${FUND}', '${ME}', 'Nifty 50 index fund', 'mutual_fund', 125),
    ('${THEIR_FUND}', '${OTHER}', 'Their fund', 'stock', NULL);
`;

const errorOf = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await db.exec(SEED);
});

const insertTxn = (values: string) =>
  db.query(
    `INSERT INTO investment_transactions (user_id, holding_id, type, date, quantity, price, fees, account_id) VALUES ${values}`
  );

describe("investment portfolio tables", () => {
  it("a buy from my account is stored and moves the account's calculated balance", async () => {
    await asUser(db, ME, () => insertTxn(`('${ME}', '${FUND}', 'buy', '2026-02-01', 100, 100, 50, '${SBI}')`));
    const { rows } = await asUser(db, ME, () =>
      db.query<{ id: string; date: string; type: "buy"; quantity: number; price: number; fees: number; note: string; account_id: string; name: string }>(
        `SELECT t.id, t.date::text, t.type, t.quantity::float8 AS quantity, t.price::float8 AS price, t.fees::float8 AS fees,
                t.note, t.account_id, h.name
           FROM investment_transactions t JOIN investment_holdings h ON h.id = t.holding_id`
      )
    );
    const flows = investmentFlows(rows.map((r) => ({ ...r, holding: { name: r.name } })));
    const sbi = { id: SBI, type: "savings" as const, opening_balance: 100000, opening_date: "2026-01-01" };
    expect(balanceFromFlows(sbi, flows)).toBe(100000 - 10050);
    // The holding is worth 100 × 125 at the entered price.
    expect(summarizeHolding({ current_price: 125 }, rows).current_value).toBe(12500);
  });

  it("an opening position can't have a cash account", async () => {
    const err = await errorOf(() =>
      asUser(db, ME, () => insertTxn(`('${ME}', '${FUND}', 'opening', '2025-01-01', 10, 100, 0, '${SBI}')`))
    );
    expect(err).toMatch(/check constraint/i);
  });

  it("rejects zero units, negative prices or fees, blank names and unknown types", async () => {
    for (const bad of [
      `('${ME}', '${FUND}', 'buy', '2026-02-01', 0, 100, 0, NULL)`,
      `('${ME}', '${FUND}', 'buy', '2026-02-01', 1, -1, 0, NULL)`,
      `('${ME}', '${FUND}', 'buy', '2026-02-01', 1, 1, -1, NULL)`,
      `('${ME}', '${FUND}', 'dividend', '2026-02-01', 1, 1, 0, NULL)`,
    ]) {
      expect(await errorOf(() => asUser(db, ME, () => insertTxn(bad)))).toMatch(/check constraint/i);
    }
    expect(
      await errorOf(() => asUser(db, ME, () => db.query(`INSERT INTO investment_holdings (user_id, name) VALUES ('${ME}', '   ')`)))
    ).toMatch(/check constraint/i);
    expect(
      await errorOf(() =>
        asUser(db, ME, () => db.query(`INSERT INTO investment_holdings (user_id, name, asset_type) VALUES ('${ME}', 'X', 'nft')`))
      )
    ).toMatch(/check constraint/i);
  });

  it("I can't add a transaction to someone else's holding or pay from their account", async () => {
    expect(
      await errorOf(() => asUser(db, ME, () => insertTxn(`('${ME}', '${THEIR_FUND}', 'buy', '2026-02-01', 1, 1, 0, NULL)`)))
    ).toMatch(/row-level security/i);
    expect(
      await errorOf(() => asUser(db, ME, () => insertTxn(`('${ME}', '${FUND}', 'buy', '2026-02-01', 1, 1, 0, '${THEIR_ACC}')`)))
    ).toMatch(/row-level security/i);
    // Or create rows in their name.
    expect(
      await errorOf(() => asUser(db, ME, () => db.query(`INSERT INTO investment_holdings (user_id, name) VALUES ('${OTHER}', 'Sneaky')`)))
    ).toMatch(/row-level security/i);
  });

  it("each user sees only their own holdings and transactions", async () => {
    await asUser(db, OTHER, () => insertTxn(`('${OTHER}', '${THEIR_FUND}', 'buy', '2026-02-01', 1, 1, 0, '${THEIR_ACC}')`));
    const mine = await asUser(db, ME, () => db.query<{ name: string }>("SELECT name FROM investment_holdings"));
    expect(mine.rows.map((r) => r.name)).toEqual(["Nifty 50 index fund"]);
    const txns = await asUser(db, ME, () => db.query("SELECT 1 FROM investment_transactions"));
    expect(txns.rows).toHaveLength(0);
  });

  it("deleting a holding removes its transactions with it", async () => {
    await asUser(db, ME, () => insertTxn(`('${ME}', '${FUND}', 'buy', '2026-02-01', 1, 1, 0, '${SBI}')`));
    await asUser(db, ME, () => db.query(`DELETE FROM investment_holdings WHERE id = '${FUND}'`));
    const left = await asUser(db, ME, () => db.query("SELECT 1 FROM investment_transactions"));
    expect(left.rows).toHaveLength(0);
  });
});

describe("account adjustments", () => {
  const insertAdj = (account: string, amount: number) =>
    db.query(
      `INSERT INTO account_adjustments (user_id, account_id, date, amount, previous_balance, new_balance)
       VALUES ('${ME}', '${account}', '2026-11-10', ${amount}, 1000, ${1000 + amount})`
    );

  it("records a signed adjustment against my own account", async () => {
    await asUser(db, ME, () => insertAdj(SBI, -300));
    const { rows } = await asUser(db, ME, () =>
      db.query<{ amount: number }>("SELECT amount::float8 AS amount FROM account_adjustments")
    );
    expect(rows).toEqual([{ amount: -300 }]);
  });

  it("refuses a zero adjustment and one against someone else's account", async () => {
    expect(await errorOf(() => asUser(db, ME, () => insertAdj(SBI, 0)))).toMatch(/check constraint/i);
    expect(await errorOf(() => asUser(db, ME, () => insertAdj(THEIR_ACC, 50)))).toMatch(/row-level security/i);
  });

  it("is removed with its account", async () => {
    await asUser(db, ME, () => insertAdj(SBI, 25));
    await db.query(`DELETE FROM accounts WHERE id = '${SBI}'`);
    const left = await db.query("SELECT 1 FROM account_adjustments");
    expect(left.rows).toHaveLength(0);
  });
});
