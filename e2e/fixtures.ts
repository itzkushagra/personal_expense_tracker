import { test as base, expect, type Page } from "@playwright/test";

export type Theme = "light" | "dark";

/** Console errors and failed requests seen while a test ran. */
export interface PageProblems {
  console: string[];
  network: string[];
}

// Noise that is not an app bug (dev-mode HMR, React DevTools hint, browser favicon probes).
const IGNORED = [/Download the React DevTools/i, /\[HMR\]/, /\[Fast Refresh\]/, /favicon\.ico/];

export const test = base.extend<{ theme: Theme; allowedConsole: RegExp[]; problems: PageProblems }>({
  theme: ["dark", { option: true }],
  // Console errors a test expects (e.g. the 400 from a deliberately wrong password).
  allowedConsole: [[], { option: true }],

  // next-themes reads the "theme" key from localStorage before the first paint.
  page: async ({ page, theme }, provide) => {
    await page.addInitScript((t) => {
      try {
        localStorage.setItem("theme", t);
      } catch {}
    }, theme);
    await provide(page);
  },

  // Every test fails if the page logged an error or a request failed / returned 5xx.
  problems: [
    async ({ page, allowedConsole }, provide, testInfo) => {
      const problems: PageProblems = { console: [], network: [] };
      page.on("console", (msg) => {
        const text = msg.text();
        if (msg.type() === "error" && ![...IGNORED, ...allowedConsole].some((r) => r.test(text))) {
          problems.console.push(text);
        }
      });
      page.on("pageerror", (err) => problems.console.push(`pageerror: ${err.message}`));
      page.on("response", (res) => {
        if (res.status() >= 500 && !IGNORED.some((r) => r.test(res.url()))) {
          problems.network.push(`${res.status()} ${res.request().method()} ${res.url()}`);
        }
      });
      page.on("requestfailed", (req) => {
        const failure = req.failure()?.errorText ?? "";
        // Navigations cancel in-flight requests; that is expected.
        if (!/ERR_ABORTED|NS_BINDING_ABORTED/.test(failure)) {
          problems.network.push(`failed ${req.method()} ${req.url()} ${failure}`);
        }
      });
      await provide(problems);
      if (problems.console.length || problems.network.length) {
        await testInfo.attach("page-problems", {
          body: JSON.stringify(problems, null, 2),
          contentType: "application/json",
        });
      }
      expect(problems.console, "console errors").toEqual([]);
      expect(problems.network, "failed or 5xx requests").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** True when the page is wider than the viewport (sideways scrolling). */
export async function hasHorizontalOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
}

export async function expectTheme(page: Page, theme: Theme) {
  await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
}
