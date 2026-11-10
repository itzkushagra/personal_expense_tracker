import { test as setup, expect } from "@playwright/test";
import { AUTH_FILE, AUTH_SKIP_REASON, TEST_EMAIL, authTestsEnabled } from "./env";

/**
 * Runs before every signed-in project. Read-only: opens Settings with the saved session and
 * checks it belongs to the dedicated test user. If it doesn't, every signed-in test is blocked,
 * so nothing can ever write to a personal account.
 */
setup("saved session belongs to the dedicated test user", async ({ browser }) => {
  setup.skip(!authTestsEnabled(), AUTH_SKIP_REASON);

  const context = await browser.newContext({ storageState: AUTH_FILE });
  const page = await context.newPage();
  await page.goto("/settings");
  if (/\/login$/.test(new URL(page.url()).pathname)) {
    throw new Error("The saved test session has expired or was signed out. Run `npm run test:e2e:login` again.");
  }

  await expect(page.getByText(TEST_EMAIL, { exact: true }).first(), "signed-in user must be the E2E_EMAIL test user").toBeVisible();

  // Opening a page lets the server refresh the session; save it so the next run starts fresh
  // (Supabase refresh tokens are single-use, so reusing an old file would end the session).
  await context.storageState({ path: AUTH_FILE });
  await context.close();
});
