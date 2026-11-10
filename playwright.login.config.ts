import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

/**
 * `npm run test:e2e:login`: signs the dedicated test user in (you run it; it types the test
 * password), checks login / persistence / logout, and saves the session other tests reuse.
 */
export default defineConfig({
  ...base,
  testMatch: /login\.flow\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  projects: [{ name: "login", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
});
