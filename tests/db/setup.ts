import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = fileURLToPath(new URL("../../", import.meta.url));

/** Every schema file, in the order they are run in Supabase. */
export const MIGRATIONS = [
  "supabase/migrations/001_initial_schema.sql",
  "supabase/migrations/0015_core_finance_tables.sql",
  "supabase/migrations/002_rent_held_money_reimbursements.sql",
  "supabase/migrations/003_income_and_people_loans.sql",
  "supabase/migrations/004_income_for_month.sql",
  "supabase/migrations/005_account_ledger.sql",
  "supabase/migrations/006_bill_payment_accounting.sql",
  "supabase/migrations/007_bill_payment_integrity.sql",
  "supabase/migrations/008_debt_account_link.sql",
  "supabase/migrations/20261110200000_account_balance_adjustments.sql",
  "supabase/migrations/20261110200100_investment_portfolio.sql",
];

/**
 * A throwaway Postgres with the full SpendWise schema. Supabase's `auth`
 * schema is stubbed: auth.uid() reads the user id set by `asUser`, and the
 * `authenticated` role is a normal non-owner role, so row-level security
 * applies to it exactly as it does to signed-in users in Supabase.
 */
export async function createTestDb({ through }: { through?: string } = {}) {
  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE ROLE authenticated NOLOGIN;
  `);
  // `through` stops after that migration, to test a later one against existing data.
  const last = through ? MIGRATIONS.findIndex((m) => m.includes(through)) : MIGRATIONS.length - 1;
  for (const file of MIGRATIONS.slice(0, last + 1)) {
    await applyMigration(db, file);
  }
  return db;
}

/** Run one schema file, then let the signed-in role use any tables it created. */
export async function applyMigration(db: PGlite, file: string) {
  await db.exec(readFileSync(root + file, "utf8"));
  await db.exec(`
    GRANT USAGE ON SCHEMA public, auth TO authenticated;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
  `);
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

/** Become a signed-in user (row-level security on) until `signOut`. For running several queries at once. */
export async function signIn(db: TestDb, userId: string) {
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [userId]);
  await db.exec("SET ROLE authenticated");
}

export async function signOut(db: TestDb) {
  await db.exec("RESET ROLE");
  await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
}

/** Run queries as a signed-in user (row-level security on), then switch back to the owner. */
export async function asUser<T>(db: TestDb, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [userId]);
  await db.exec("SET ROLE authenticated");
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE");
    await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
  }
}
