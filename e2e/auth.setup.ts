import fs from "node:fs";
import path from "node:path";
import { test as setup, expect } from "@playwright/test";
import { AUTH_FILE, AUTH_SKIP_REASON, authTestsEnabled } from "./env";

setup("sign in with the local test account", async ({ page }) => {
  setup.skip(!authTestsEnabled(), AUTH_SKIP_REASON);
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.E2E_EMAIL!);
  await page.getByLabel("Password").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
});
