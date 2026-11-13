import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Account } from "@/types";
import { withLiveBalances } from "@/lib/ledger";
import { isMissingTable, parseTransactionInput, transactionRow } from "@/lib/portfolio";
import { RECORD_ONLY_NOT_SET_UP, movesBalanceForInsert, movesBalanceForUpdate, writeErrorMessage } from "@/lib/record-only";

/**
 * Record-only entries: money already in an account's balance (e.g. a friend's money that was
 * there before the opening balance was set) is recorded without being added a second time.
 */

const ACC = "acc";
type Row = Record<string, unknown>;

/** A fake Supabase client: rows per table; `columnMissing` mimics the database before the migration. */
function fakeClient(tables: Record<string, Row[]>, { columnMissing = false } = {}) {
  const selects: string[] = [];
  const from = (table: string) => {
    let columns = "";
    const q: Record<string, unknown> = {};
    for (const m of ["eq", "not", "in", "is", "or"]) q[m] = () => q;
    q.select = (c: string) => {
      columns = c;
      selects.push(`${table}: ${c}`);
      return q;
    };
    q.range = async () => {
      if (columns.includes("moves_balance") && columnMissing) {
        return { data: null, error: { code: "42703", message: `column ${table}.moves_balance does not exist` } };
      }
      const rows = (tables[table] ?? []).map((r) => {
        if (columns.includes("moves_balance")) return { moves_balance: true, ...r };
        const rest = { ...r };
        delete rest.moves_balance;
        return rest;
      });
      return { data: rows, error: null };
    };
    return q;
  };
  return { client: { from } as unknown as SupabaseClient, selects };
}

const account = { id: ACC, type: "savings", opening_balance: 1000, opening_date: "2026-01-01", balance: 1000 } as Account;

const tables: Record<string, Row[]> = {
  incomes: [
    { id: "i1", date: "2026-11-01", amount: 500, source: "Salary", type: "salary", account_id: ACC },
    { id: "i2", date: "2026-11-02", amount: 300, source: "Gift", type: "gift", account_id: ACC, moves_balance: false },
  ],
  held_fund_entries: [
    // A friend's ₹2,000 that was already in the account: kept as a record only.
    { id: "l1", date: "2026-11-03", amount: 2000, type: "in", note: "", account_id: ACC, moves_balance: false, loan: { person_name: "Rahul", direction: "holding" } },
    { id: "l2", date: "2026-11-04", amount: 100, type: "out", note: "", account_id: ACC, loan: { person_name: "Rahul", direction: "holding" } },
  ],
  investment_transactions: [
    { id: "t1", date: "2026-11-05", type: "buy", quantity: 10, price: 100, fees: 0, note: "", account_id: ACC, moves_balance: false, holding: { name: "Fund" } },
    { id: "t2", date: "2026-11-06", type: "buy", quantity: 1, price: 50, fees: 0, note: "", account_id: ACC, holding: { name: "Fund" } },
  ],
};

describe("account balances with record-only entries", () => {
  it("leaves record-only income, loan entries and investments out of the balance", async () => {
    const { client } = fakeClient(tables);
    const [a] = await withLiveBalances(client, "me", [account]);
    // 1000 opening + 500 salary − 100 given back − 50 fund buy; the record-only rows don't move it.
    expect(a.balance).toBe(1350);
  });

  it("before the migration, every entry still moves the balance as it always did", async () => {
    const { client, selects } = fakeClient(tables, { columnMissing: true });
    const [a] = await withLiveBalances(client, "me", [account]);
    expect(a.balance).toBe(1000 + 500 + 300 + 2000 - 100 - 1000 - 50);
    // It retried without the column rather than treating the table as missing.
    expect(selects.filter((s) => s.startsWith("investment_transactions")).length).toBe(2);
  });
});

describe("saving the choice", () => {
  it("a new row carries the column only when it's record-only", () => {
    expect(movesBalanceForInsert({ moves_balance: false })).toEqual({ moves_balance: false });
    expect(movesBalanceForInsert({ moves_balance: true })).toEqual({});
    expect(movesBalanceForInsert({})).toEqual({});
  });

  it("an edit changes it only when sent", () => {
    expect(movesBalanceForUpdate({ moves_balance: true })).toEqual({ moves_balance: true });
    expect(movesBalanceForUpdate({ moves_balance: false })).toEqual({ moves_balance: false });
    expect(movesBalanceForUpdate({ moves_balance: "no" })).toEqual({});
  });

  it("explains a write made before the migration", () => {
    expect(writeErrorMessage({ code: "42703", message: "column does not exist" })).toBe(RECORD_ONLY_NOT_SET_UP);
    expect(writeErrorMessage({ code: "23505", message: "duplicate" })).toBe("duplicate");
  });

  it("a missing column isn't mistaken for a missing table", () => {
    expect(isMissingTable({ code: "42703", message: 'column "moves_balance" does not exist' })).toBe(false);
    expect(isMissingTable({ code: "42P01", message: 'relation "x" does not exist' })).toBe(true);
  });

  it("investment buys and sales can be record-only; units already owned never move cash anyway", () => {
    const buy = parseTransactionInput({ type: "buy", date: "2026-11-05", quantity: 1, price: 10, account_id: ACC, moves_balance: false });
    expect("value" in buy && transactionRow(buy.value)).toMatchObject({ moves_balance: false, account_id: ACC });
    const normal = parseTransactionInput({ type: "sell", date: "2026-11-05", quantity: 1, price: 10, account_id: ACC });
    expect("value" in normal && "moves_balance" in transactionRow(normal.value)).toBe(false);
    const opening = parseTransactionInput({ type: "opening", date: "2026-11-05", quantity: 1, price: 10, moves_balance: false });
    expect("value" in opening && opening.value.moves_balance).toBe(true);
  });
});
