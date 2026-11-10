import { test, expect, hasHorizontalOverflow, expectTheme } from "./fixtures";

// Pages anyone can open. Safe against any backend: nothing is written.

test.describe("signed out", () => {
  for (const path of ["/login", "/signup"]) {
    test(`${path} renders without errors or sideways scroll`, async ({ page, theme }) => {
      await page.goto(path);
      await expect(page.getByLabel("Email")).toBeVisible();
      await expect(page.getByLabel("Password")).toBeVisible();
      await expectTheme(page, theme);
      expect(await hasHorizontalOverflow(page)).toBe(false);
    });
  }

  const protectedPages = [
    "/dashboard", "/expenses", "/income", "/accounts", "/people", "/reimbursements",
    "/rent", "/bills", "/budgets", "/goals", "/reports", "/yearly", "/settings",
  ];
  for (const path of protectedPages) {
    test(`${path} sends a signed-out visitor to /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    });
  }

  test("login form blocks an empty submit", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
