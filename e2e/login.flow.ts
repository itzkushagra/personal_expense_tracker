import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { AUTH_FILE, TEST_EMAIL } from "./env";

/**
 * Sign-in flow for the dedicated test user. You run this yourself (`npm run test:e2e:login`):
 * it types the test password from .env.test.local into the login form.
 *
 * Covers successful login, session persistence across a reload, logout (the app's sign-out ends
 * every session for the user) and protected pages after logout, then signs in again and saves the
 * session that all other signed-in tests reuse.
 */
test.describe.configure({ mode: "serial" });

const password = process.env.E2E_PASSWORD ?? "";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEST_EMAIL);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
}

test("sign in, stay signed in, sign out, sign in again and save the session", async ({ page }) => {
  expect(TEST_EMAIL, "set E2E_EMAIL in .env.test.local").not.toBe("");
  expect(password, "set E2E_PASSWORD in .env.test.local").not.toBe("");

  await test.step("successful login", () => signIn(page));

  await test.step("session survives a reload", async () => {
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  await test.step("it is the test user", async () => {
    await page.goto("/settings");
    await expect(page.getByText(TEST_EMAIL, { exact: true }).first()).toBeVisible();
  });

  await test.step("logout returns to /login and protects pages", async () => {
    await page.getByRole("button", { name: /sign out/i }).first().click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/expenses");
    await expect(page).toHaveURL(/\/login$/);
  });

  await test.step("sign in again and save the session for the other tests", async () => {
    await signIn(page);
    fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
    await page.context().storageState({ path: AUTH_FILE });
  });
});
