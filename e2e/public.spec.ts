import { test, expect, hasHorizontalOverflow, expectTheme } from "./fixtures";

// Pages anyone can open. Safe against any backend: nothing is written.

test.describe("signed out", () => {
  for (const path of ["/login", "/signup"]) {
    test(`${path} renders without errors or sideways scroll`, async ({
      page,
      theme,
    }, testInfo) => {
      await page.goto(path);
      await expect(page.getByLabel("Email")).toBeVisible();
      await expect(page.getByLabel("Password")).toBeVisible();
      await expectTheme(page, theme);
      expect(await hasHorizontalOverflow(page)).toBe(false);
      await page.screenshot({
        path: testInfo.outputPath(`${path.slice(1)}.png`),
        fullPage: true,
      });
    });
  }

  const protectedPages = [
    "/dashboard",
    "/expenses",
    "/income",
    "/accounts",
    "/people",
    "/reimbursements",
    "/rent",
    "/bills",
    "/budgets",
    "/goals",
    "/reports",
    "/yearly",
    "/settings",
    "/investments",
  ];
  for (const path of protectedPages) {
    test(`${path} sends a signed-out visitor to /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    });
  }

  test.describe("invalid login", () => {
    // Supabase answers a wrong password with a 400, which Chromium logs as a console error.
    test.use({ allowedConsole: [/status of 400/] });

    test("shows an error and stays on /login", async ({ page }) => {
      // A made-up address and password: no real account is involved.
      await page.goto("/login");
      await page.waitForLoadState("networkidle"); // form hydrated, so the click runs the app's handler
      await page.getByLabel("Email").fill("no-such-user@example.invalid");
      await page.getByLabel("Password").fill("not-a-real-password");
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.locator("p.text-destructive")).toBeVisible();
      await expect(page).toHaveURL(/\/login$/);
    });
  });

  test("login form blocks an empty submit", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
