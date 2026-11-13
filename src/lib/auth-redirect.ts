/**
 * Where to send someone after an email link (password reset, sign-up confirmation, email change).
 * Only paths inside this app are allowed, so a crafted link can't bounce a signed-in user to
 * another site ("//evil.com", "https://evil.com", "/\\evil.com" are all refused).
 */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(next)) return fallback;
  return next;
}

/** Minimum length for new passwords set in the app. */
export const MIN_PASSWORD_LENGTH = 8;

/** A problem with a new password, or null when it's fine. */
export function passwordProblem(password: string, confirm?: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters`;
  if (confirm !== undefined && password !== confirm) return "The two passwords don't match";
  return null;
}
