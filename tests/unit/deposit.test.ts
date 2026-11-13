import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { depositLeft, rentFromDeposit } from "@/lib/deposit";

describe("security deposit used for rent", () => {
  it("what's left after notice-period rent, never below zero", () => {
    expect(depositLeft(36000, 0)).toBe(36000);
    expect(depositLeft(36000, 18000)).toBe(18000);
    expect(depositLeft(36000, 40000)).toBe(0);
  });

  it("a month's rent from the deposit is the rent, or what's left if less", () => {
    expect(rentFromDeposit(18000, 36000)).toBe(18000);
    expect(rentFromDeposit(18000, 10000)).toBe(10000);
    expect(rentFromDeposit(18000, 0)).toBe(0);
  });
});

// --- POST /api/rental/deposit-rent with a mocked Supabase client
let user: { id: string } | null = { id: "me" };
let rental: { monthly_rent: number; security_deposit: number } | null = { monthly_rent: 18000, security_deposit: 36000 };
let used: { amount: number }[] = [];
let insertError: { code: string; message: string } | null = null;
const inserted: Record<string, unknown>[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    from: (table: string) => {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) b[m] = () => b;
      b.maybeSingle = async () => ({ data: rental, error: null });
      b.range = async () => ({ data: used, error: null });
      b.insert = (row: Record<string, unknown>) => {
        inserted.push({ table, ...row });
        return { select: () => ({ single: async () => (insertError ? { data: null, error: insertError } : { data: { id: "e1", ...row }, error: null }) }) };
      };
      return b;
    },
  }),
}));

import { POST } from "@/app/api/rental/deposit-rent/route";

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/rental/deposit-rent", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/rental/deposit-rent", () => {
  beforeEach(() => {
    user = { id: "me" };
    rental = { monthly_rent: 18000, security_deposit: 36000 };
    used = [];
    insertError = null;
    inserted.length = 0;
  });

  it("refuses when signed out", async () => {
    user = null;
    expect((await post({})).status).toBe(401);
  });

  it("logs the month's rent as Rent spending with no bank account", async () => {
    const res = await post({ date: "2027-01-01", description: "Flat rent - January 2027 (from security deposit)" });
    expect(res.status).toBe(201);
    expect((await res.json()).deposit_left).toBe(18000);
    expect(inserted).toEqual([
      expect.objectContaining({ table: "expenses", amount: 18000, category: "Rent", date: "2027-01-01", account_id: null, paid_from_deposit: true }),
    ]);
  });

  it("uses only what's left of the deposit", async () => {
    used = [{ amount: 18000 }, { amount: 8000 }];
    const res = await post({ date: "2027-02-01" });
    expect(res.status).toBe(201);
    expect(inserted[0]).toMatchObject({ amount: 10000 });
    expect((await res.json()).deposit_left).toBe(0);
  });

  it("refuses once the deposit is used up, or with no flat details", async () => {
    used = [{ amount: 36000 }];
    expect((await post({})).status).toBe(400);
    rental = null;
    expect((await post({})).status).toBe(400);
    expect(inserted).toHaveLength(0);
  });

  it("explains a database without the migration", async () => {
    insertError = { code: "42703", message: 'column "paid_from_deposit" does not exist' };
    const res = await post({ date: "2027-01-01" });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/20261113160000/);
  });
});
