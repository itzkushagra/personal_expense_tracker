import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

// Same env files the app uses (.env.local etc.), so the safety checks in e2e/env.ts see the real target.
loadEnvConfig(process.cwd(), true);

const PORT = Number(process.env.E2E_PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

const viewports = {
  "desktop-1440": { width: 1440, height: 900 },
  "laptop-1366": { width: 1366, height: 768 },
  "tablet-768": { width: 768, height: 1024 },
  "mobile-390": { width: 390, height: 844 },
} as const;

const themes = ["light", "dark"] as const;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // The dev server compiles each page on first visit; a few workers keep it from timing out.
  workers: process.env.CI ? 2 : 4,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    // Signs in once (only when a local test account is configured) and saves the session.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    ...Object.entries(viewports).flatMap(([vp, viewport]) =>
      themes.map((theme) => ({
        name: `${vp}-${theme}`,
        dependencies: ["setup"],
        testIgnore: /auth\.setup\.ts/,
        use: {
          ...devices["Desktop Chrome"],
          viewport,
          isMobile: viewport.width < 768,
          hasTouch: viewport.width < 768,
          colorScheme: theme,
          theme,
        },
      }))
    ),
  ],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
