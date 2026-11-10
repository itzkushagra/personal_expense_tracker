import path from "node:path";

/** Saved signed-in browser state. Git-ignored; never commit it. */
export const AUTH_FILE = path.join(__dirname, ".auth", "user.json");

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The Supabase the app talks to is running on this machine (supabase start). */
export function supabaseIsLocal() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return false;
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Signed-in tests run only with a dedicated test account on a local Supabase.
 * They never run against the hosted project, so real financial data is never touched.
 */
export function authTestsEnabled() {
  return !!process.env.E2E_EMAIL && !!process.env.E2E_PASSWORD && supabaseIsLocal();
}

export const AUTH_SKIP_REASON =
  "Signed-in tests need a local Supabase (supabase start) and E2E_EMAIL / E2E_PASSWORD for a test account in .env.test.local";
