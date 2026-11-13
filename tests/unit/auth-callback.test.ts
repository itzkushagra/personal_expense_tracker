import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { passwordProblem, safeNext } from "@/lib/auth-redirect";

describe("where an email link may send you", () => {
  it("allows paths in this app", () => {
    expect(safeNext("/reset-password")).toBe("/reset-password");
    expect(safeNext("/settings?tab=account")).toBe("/settings?tab=account");
  });
  it("refuses other sites and odd input", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "evil.com", "", null, undefined, "/ok\r\nSet-Cookie: x"]) {
      expect(safeNext(bad)).toBe("/dashboard");
    }
  });
});

describe("new passwords", () => {
  it("need 8+ characters and a matching confirmation", () => {
    expect(passwordProblem("short")).toMatch(/at least 8/);
    expect(passwordProblem("long enough", "different")).toMatch(/don't match/);
    expect(passwordProblem("long enough", "long enough")).toBeNull();
  });
});

// --- GET /auth/callback with a mocked Supabase client
const exchangeCodeForSession = vi.fn();
const verifyOtp = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession, verifyOtp } }),
}));

import { GET } from "@/app/auth/callback/route";

const call = async (qs: string) => {
  const res = await GET(new NextRequest(`http://localhost:3000/auth/callback?${qs}`));
  return { status: res.status, to: res.headers.get("location") };
};

describe("GET /auth/callback", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
    verifyOtp.mockReset().mockResolvedValue({ error: null });
  });

  it("signs in from a reset link and continues to set a new password", async () => {
    expect(await call("code=abc&next=/reset-password")).toEqual({ status: 307, to: "http://localhost:3000/reset-password" });
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
  });

  it("works with token-hash links too", async () => {
    expect((await call("token_hash=h&type=recovery&next=/reset-password")).to).toBe("http://localhost:3000/reset-password");
    expect(verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "h" });
  });

  it("never redirects to another site", async () => {
    expect((await call("code=abc&next=https://evil.com")).to).toBe("http://localhost:3000/dashboard");
    expect((await call("code=abc&next=//evil.com")).to).toBe("http://localhost:3000/dashboard");
  });

  it("an expired or reused link goes back to sign in with a message", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "invalid flow state" } });
    expect((await call("code=old&next=/reset-password")).to).toBe("http://localhost:3000/login?error=link");
    expect((await call("next=/reset-password")).to).toBe("http://localhost:3000/login?error=link");
  });
});
