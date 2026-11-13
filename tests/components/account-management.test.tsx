// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// The Supabase client is mocked: no request leaves the test.
const auth = {
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
};
const push = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { LoginForm } from "@/components/login-form";
import { SignupForm } from "@/components/signup-form";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { AccountSecurity } from "@/components/account-security";

beforeEach(() => {
  for (const f of Object.values(auth)) f.mockReset();
  push.mockReset();
});
afterEach(cleanup);

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = (button: string) => fireEvent.submit(screen.getByRole("button", { name: button }).closest("form")!);

describe("signing in", () => {
  it("links to password reset, and explains an expired email link", () => {
    render(<LoginForm linkError />);
    expect(screen.getByRole("link", { name: "Forgot password?" }).getAttribute("href")).toBe("/forgot-password");
    expect(screen.getByText(/expired or was already used/)).toBeTruthy();
  });
});

describe("signing up", () => {
  it("asks you to confirm your email when Supabase requires it, instead of bouncing to sign in", async () => {
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    render(<SignupForm />);
    type("Name", "Divya");
    type("Email", "new@example.com");
    type("Password", "a good password");
    submit("Create account");
    expect(await screen.findByText(/sent a confirmation link/)).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
    expect(auth.signUp.mock.calls[0][0].options.emailRedirectTo).toBe("http://localhost:3000/auth/callback?next=/dashboard");
  });

  it("refuses a short password before calling Supabase", async () => {
    render(<SignupForm />);
    type("Name", "Divya");
    type("Email", "new@example.com");
    type("Password", "short");
    fireEvent.submit(screen.getByRole("button", { name: "Create account" }).closest("form")!);
    expect(await screen.findByText(/at least 8/)).toBeTruthy();
    expect(auth.signUp).not.toHaveBeenCalled();
  });
});

describe("forgot password", () => {
  it("sends a reset link that comes back to set a new password", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    render(<ForgotPasswordForm />);
    type("Email", " me@example.com ");
    submit("Send reset link");
    expect(await screen.findByText("Check your email")).toBeTruthy();
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("me@example.com", {
      redirectTo: "http://localhost:3000/auth/callback?next=/reset-password",
    });
  });
});

describe("setting a new password from the email", () => {
  it("checks both entries match, then saves and goes to the dashboard", async () => {
    auth.updateUser.mockResolvedValue({ error: null });
    render(<ResetPasswordForm />);
    type("New password", "new password 1");
    type("Confirm new password", "new password 2");
    submit("Save new password");
    expect(await screen.findByText(/don't match/)).toBeTruthy();
    type("Confirm new password", "new password 1");
    submit("Save new password");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new password 1" });
  });
});

describe("Settings → Account", () => {
  it("won't change the password without the right current one", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    render(<AccountSecurity email="me@example.com" />);
    fireEvent.click(screen.getByRole("button", { name: /Change password/ }));
    type("Current password", "wrong one");
    type("New password", "brand new pass");
    type("Confirm new password", "brand new pass");
    submit("Save new password");
    expect(await screen.findByText("Your current password isn't right")).toBeTruthy();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("changes the password after checking the current one", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });
    auth.updateUser.mockResolvedValue({ error: null });
    render(<AccountSecurity email="me@example.com" />);
    fireEvent.click(screen.getByRole("button", { name: /Change password/ }));
    type("Current password", "old password");
    type("New password", "brand new pass");
    type("Confirm new password", "brand new pass");
    submit("Save new password");
    await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith({ password: "brand new pass" }));
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "me@example.com", password: "old password" });
  });

  it("changing email sends a confirmation link back to Settings", async () => {
    auth.updateUser.mockResolvedValue({ error: null });
    render(<AccountSecurity email="me@example.com" />);
    fireEvent.click(screen.getByRole("button", { name: /Change email/ }));
    type("New email address", "new@example.com");
    submit("Send confirmation link");
    expect(await screen.findByText(/Check new@example.com/)).toBeTruthy();
    expect(auth.updateUser).toHaveBeenCalledWith(
      { email: "new@example.com" },
      { emailRedirectTo: "http://localhost:3000/auth/callback?next=/settings" }
    );
  });

  it("signs out on every device", async () => {
    auth.signOut.mockResolvedValue({ error: null });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AccountSecurity email="me@example.com" />);
    fireEvent.click(screen.getByRole("button", { name: /Sign out everywhere/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "global" });
  });
});
