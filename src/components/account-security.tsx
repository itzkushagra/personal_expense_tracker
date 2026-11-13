"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, LogOut, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MIN_PASSWORD_LENGTH, passwordProblem } from "@/lib/auth-redirect";

type Panel = "password" | "email" | null;

/** Change password, change email and sign out of every device, for the signed-in user. */
export function AccountSecurity({ email }: { email: string | null }) {
  const [open, setOpen] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const router = useRouter();

  function toggle(p: Panel) {
    setOpen(open === p ? null : p);
    setError(null);
    setNotice(null);
  }

  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const current = String(fd.get("current") || "");
    const next = String(fd.get("next") || "");
    const problem = passwordProblem(next, String(fd.get("confirm") || ""));
    if (problem) return setError(problem);
    if (next === current) return setError("The new password is the same as the current one");
    if (!email) return setError("Couldn't read your email; reload the page and try again");
    setBusy(true);
    setError(null);
    const supabase = createClient();
    // Confirm it's really you before changing it: someone at an unlocked screen can't.
    const check = await supabase.auth.signInWithPassword({ email, password: current });
    if (check.error) {
      setBusy(false);
      return setError("Your current password isn't right");
    }
    const { error } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (error) return setError(error.message);
    (e.target as HTMLFormElement).reset();
    setOpen(null);
    toast.success("Password changed");
  }

  async function changeEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next = String(new FormData(e.currentTarget).get("email") || "").trim();
    if (!next || next.toLowerCase() === email?.toLowerCase()) return setError("Enter a different email address");
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.updateUser(
      { email: next },
      { emailRedirectTo: `${window.location.origin}/auth/callback?next=/settings` }
    );
    setBusy(false);
    if (error) return setError(error.message);
    setNotice(
      `Check ${next} for a confirmation link. Your email changes once it's opened; if Supabase also sends one to ${email}, open that too.`
    );
  }

  async function signOutEverywhere() {
    if (!confirm("Sign out on every device and browser, including this one?")) return;
    setBusy(true);
    const { error } = await createClient().auth.signOut({ scope: "global" });
    setBusy(false);
    if (error) return toast.error(error.message);
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={open === "password" ? "secondary" : "outline"} onClick={() => toggle("password")}>
          <KeyRound className="mr-1.5 h-3.5 w-3.5" /> Change password
        </Button>
        <Button size="sm" variant={open === "email" ? "secondary" : "outline"} onClick={() => toggle("email")}>
          <Mail className="mr-1.5 h-3.5 w-3.5" /> Change email
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={signOutEverywhere}>
          <LogOut className="mr-1.5 h-3.5 w-3.5" /> Sign out everywhere
        </Button>
      </div>

      {open === "password" && (
        <form onSubmit={changePassword} className="space-y-3 rounded-lg border p-3">
          <div className="space-y-1.5">
            <Label htmlFor="acc-current-pw">Current password</Label>
            <Input id="acc-current-pw" name="current" type="password" required autoComplete="current-password" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="acc-new-pw">New password</Label>
              <Input id="acc-new-pw" name="next" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password"
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acc-confirm-pw">Confirm new password</Label>
              <Input id="acc-confirm-pw" name="confirm" type="password" required autoComplete="new-password" />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" size="sm" disabled={busy}>
            {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save new password
          </Button>
        </form>
      )}

      {open === "email" && (
        <form onSubmit={changeEmail} className="space-y-3 rounded-lg border p-3">
          <div className="space-y-1.5">
            <Label htmlFor="acc-new-email">New email address</Label>
            <Input id="acc-new-email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {notice ? (
            <p className="text-sm text-muted-foreground">{notice}</p>
          ) : (
            <Button type="submit" size="sm" disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Send confirmation link
            </Button>
          )}
        </form>
      )}
    </div>
  );
}
