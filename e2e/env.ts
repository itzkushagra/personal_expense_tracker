import fs from "node:fs";
import path from "node:path";

/**
 * Saved signed-in browser state for the dedicated test user. Git-ignored; never commit it.
 * Created by `npm run test:e2e:login`, which you run yourself (it types the test password).
 */
export const AUTH_FILE = path.join(__dirname, ".auth", "user.json");

/** Email of the dedicated test user (from .env.test.local). Never a personal account. */
export const TEST_EMAIL = process.env.E2E_EMAIL?.trim().toLowerCase() ?? "";

/**
 * Signed-in tests run only when a test user is configured and its session has been saved.
 * Every run first checks that the saved session really belongs to that test user (session.setup.ts).
 */
export function authTestsEnabled() {
  return !!TEST_EMAIL && fs.existsSync(AUTH_FILE);
}

export const AUTH_SKIP_REASON =
  "Signed-in tests need E2E_EMAIL in .env.test.local and a saved session: run `npm run test:e2e:login` first";

/** Tag put in every record a test creates, so cleanup only ever touches this run's records. */
export const RUN_ID = process.env.E2E_RUN_ID ?? `e2e-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;
