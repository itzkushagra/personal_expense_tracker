import { test, expect, hasHorizontalOverflow, expectTheme } from "./fixtures";
import { AUTH_FILE, AUTH_SKIP_REASON, authTestsEnabled } from "./env";

// Every main page, signed in as the local test account. Read-only: opens pages, writes nothing.
test.skip(!authTestsEnabled(), AUTH_SKIP_REASON);
test.use({ storageState: authTestsEnabled() ? AUTH_FILE : undefined });

const modules: { path: string; heading: RegExp }[] = [
  { path: "/dashboard", heading: /dashboard/i },
  { path: "/expenses", heading: /expenses/i },
  { path: "/income", heading: /income/i },
  { path: "/accounts", heading: /accounts/i },
  { path: "/people", heading: /people|friends/i },
  { path: "/reimbursements", heading: /reimburse/i },
  { path: "/rent", heading: /rent/i },
  { path: "/bills", heading: /bills/i },
  { path: "/budgets", heading: /budgets/i },
  { path: "/goals", heading: /goals/i },
  { path: "/reports", heading: /reports/i },
  { path: "/yearly", heading: /year/i },
  { path: "/settings", heading: /settings/i },
];

for (const { path, heading } of modules) {
  test(`${path} loads cleanly`, async ({ page, theme }, testInfo) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expectTheme(page, theme);
    expect(await hasHorizontalOverflow(page), "sideways scroll").toBe(false);
    await page.screenshot({ path: testInfo.outputPath(`${path.slice(1)}.png`), fullPage: true });
  });
}
