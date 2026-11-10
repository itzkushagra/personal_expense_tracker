import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The investment transaction API with a mocked Supabase client: checks what the route writes
 * (or refuses to write) without any database. A tiny chainable fake records every call.
 */
type Result = { data: unknown; error: unknown };
const results: Record<string, Result[]> = {};
const inserts: { table: string; row: unknown }[] = [];
const deletes: string[] = [];
let user: { id: string } | null = { id: "me" };

function builder(table: string) {
  const next = () => results[table]?.shift() ?? { data: null, error: null };
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "range", "not", "is"]) b[m] = () => b;
  b.maybeSingle = async () => next();
  b.single = async () => next();
  b.insert = (row: unknown) => {
    inserts.push({ table, row });
    return b;
  };
  b.delete = () => {
    deletes.push(table);
    return b;
  };
  b.then = (resolve: (r: Result) => unknown) => resolve(next());
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    from: (table: string) => builder(table),
  }),
}));

import { POST as addTransaction } from "@/app/api/investments/[id]/transactions/route";
import { DELETE as deleteTransaction } from "@/app/api/investments/[id]/transactions/[txId]/route";

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/investments/h1/transactions", { method: "POST", body: JSON.stringify(body) });
const params = Promise.resolve({ id: "h1" });

beforeEach(() => {
  for (const k of Object.keys(results)) delete results[k];
  inserts.length = 0;
  deletes.length = 0;
  user = { id: "me" };
});

describe("POST /api/investments/[id]/transactions", () => {
  const holdingFound = () => (results.investment_holdings = [{ data: { id: "h1" }, error: null }]);

  it("refuses when signed out", async () => {
    user = null;
    const res = await addTransaction(req({}), { params });
    expect(res.status).toBe(401);
  });

  it("rejects bad input before touching the database", async () => {
    const res = await addTransaction(req({ type: "buy", date: "2026-11-10", quantity: -1, price: 10 }), { params });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Quantity/);
    expect(inserts).toHaveLength(0);
  });

  it("404s for a holding that isn't yours", async () => {
    results.investment_holdings = [{ data: null, error: null }];
    const res = await addTransaction(req({ type: "buy", date: "2026-11-10", quantity: 1, price: 10 }), { params });
    expect(res.status).toBe(404);
    expect(inserts).toHaveLength(0);
  });

  it("refuses to sell more units than are held, and writes nothing", async () => {
    holdingFound();
    results.investment_transactions = [
      { data: [{ type: "buy", date: "2026-01-01", quantity: 5, price: 100, fees: 0, created_at: "a" }], error: null },
    ];
    const res = await addTransaction(req({ type: "sell", date: "2026-11-10", quantity: 6, price: 120 }), { params });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/sells 6 units but only 5 are held/);
    expect(inserts).toHaveLength(0);
  });

  it("records a valid sale for the signed-in user", async () => {
    holdingFound();
    results.investment_transactions = [
      { data: [{ type: "buy", date: "2026-01-01", quantity: 5, price: 100, fees: 0, created_at: "a" }], error: null },
      { data: { id: "t-new" }, error: null },
    ];
    const res = await addTransaction(
      req({ type: "sell", date: "2026-11-10", quantity: 5, price: 120, fees: 10, account_id: "acc" }),
      { params }
    );
    expect(res.status).toBe(201);
    expect(inserts).toEqual([
      {
        table: "investment_transactions",
        row: { type: "sell", date: "2026-11-10", quantity: 5, price: 120, fees: 10, account_id: "acc", note: "", holding_id: "h1", user_id: "me" },
      },
    ]);
  });
});

describe("DELETE /api/investments/[id]/transactions/[txId]", () => {
  const del = () =>
    deleteTransaction(new NextRequest("http://localhost/x", { method: "DELETE" }), {
      params: Promise.resolve({ id: "h1", txId: "buy1" }),
    });

  it("won't delete a buy that a later sale depends on", async () => {
    results.investment_transactions = [
      {
        data: [
          { id: "buy1", type: "buy", date: "2026-01-01", quantity: 5, price: 100, fees: 0, created_at: "a" },
          { id: "sell1", type: "sell", date: "2026-02-01", quantity: 5, price: 120, fees: 0, created_at: "b" },
        ],
        error: null,
      },
    ];
    const res = await del();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Delete the later sale first/);
    expect(deletes).toHaveLength(0);
  });

  it("deletes a transaction nothing depends on", async () => {
    results.investment_transactions = [
      { data: [{ id: "buy1", type: "buy", date: "2026-01-01", quantity: 5, price: 100, fees: 0, created_at: "a" }], error: null },
      { data: null, error: null },
    ];
    const res = await del();
    expect(res.status).toBe(200);
    expect(deletes).toEqual(["investment_transactions"]);
  });
});
