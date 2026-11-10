// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// The Supabase client is mocked: no request leaves the test.
const signInWithPassword = vi.fn();
const push = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signInWithPassword } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

import { LoginForm } from "@/components/login-form";

beforeEach(() => {
  signInWithPassword.mockReset();
  push.mockReset();
});
afterEach(cleanup);

function submit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
}

describe("LoginForm (mocked Supabase)", () => {
  it("shows the error from Supabase and stays on the page", async () => {
    signInWithPassword.mockResolvedValueOnce({ error: { message: "Invalid login credentials" } });
    render(<LoginForm />);
    submit("someone@example.com", "wrong-password");
    expect(await screen.findByText("Invalid login credentials")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
    // The button is usable again for another try.
    expect((screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables the button while signing in, then goes to the dashboard", async () => {
    let finish!: (v: { error: null }) => void;
    signInWithPassword.mockReturnValueOnce(new Promise((r) => (finish = r)));
    render(<LoginForm />);
    submit("someone@example.com", "right-password");
    const busy = await screen.findByRole("button", { name: "Signing in..." });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    finish({ error: null });
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "someone@example.com", password: "right-password" });
  });
});
