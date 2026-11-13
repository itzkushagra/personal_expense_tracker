"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  FileJson,
  FileSpreadsheet,
  Keyboard,
  Landmark,
  User,
  Palette,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/theme-toggle";
import { AccountSecurity } from "@/components/account-security";
import { QUICK_ACTIONS } from "@/components/layout/quick-add";
import { useAccounts } from "@/components/account-select";
import { type Income, INCOME_TYPE_LABELS } from "@/types";
import { toast } from "sonner";

function csvCell(v: unknown) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function download(filename: string, content: BlobPart, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function SettingsPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { accounts, defaultId } = useAccounts();
  const defaultAccount = accounts.find((a) => a.id === defaultId);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function backup() {
    setBusy("backup");
    try {
      const res = await fetch("/api/export");
      if (!res.ok) throw new Error();
      download(`spendwise-backup-${today}.json`, await res.blob(), "application/json");
      toast.success("Backup downloaded");
    } catch {
      toast.error("Backup failed");
    } finally {
      setBusy(null);
    }
  }

  async function exportExpenses() {
    setBusy("expenses");
    try {
      const res = await fetch("/api/expenses?limit=20000");
      const rows = (await res.json()).data || [];
      const names = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
      const lines = [
        "Date,Description,Category,Amount,Account,Reimbursable,Tags",
        ...rows.map((e: { date: string; description: string; category: string; amount: number; account_id: string | null; is_reimbursable: boolean; tags: string[] }) =>
          [e.date, e.description, e.category, e.amount, e.account_id ? names[e.account_id] ?? "" : "", e.is_reimbursable ? "yes" : "", (e.tags || []).join("; ")]
            .map(csvCell)
            .join(",")
        ),
      ];
      download(`expenses-${today}.csv`, "﻿" + lines.join("\n"), "text/csv;charset=utf-8");
      toast.success(`Exported ${rows.length} expenses`);
    } catch {
      toast.error("Export failed");
    } finally {
      setBusy(null);
    }
  }

  async function exportIncome() {
    setBusy("income");
    try {
      const res = await fetch("/api/incomes");
      const rows: Income[] = (await res.json()).data || [];
      const names = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
      const lines = [
        "For month,Date,Source,Type,Amount,Status,Account,Note",
        ...rows.map((i) =>
          [i.for_month.slice(0, 7), i.date, i.source, INCOME_TYPE_LABELS[i.type], i.amount, i.is_received ? "Received" : "Expected", i.account_id ? names[i.account_id] ?? "" : "", i.note]
            .map(csvCell)
            .join(",")
        ),
      ];
      download(`income-${today}.csv`, "﻿" + lines.join("\n"), "text/csv;charset=utf-8");
      toast.success(`Exported ${rows.length} income entries`);
    } catch {
      toast.error("Export failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings & Data</h1>
        <p className="text-muted-foreground">Your account, preferences, shortcuts and backups</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card id="account" className="scroll-mt-20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><User className="h-4 w-4" /> Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Signed in as</span>
              <span className="font-medium">{email ?? "…"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Currency</span>
              <Badge variant="secondary">₹ Indian Rupee</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-muted-foreground"><Palette className="h-3.5 w-3.5" /> Theme</span>
              <ThemeToggle />
            </div>
            <AccountSecurity email={email} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Landmark className="h-4 w-4" /> Default Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              New expenses, income and loan entries start on this account. You can change it on each entry.
            </p>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="font-medium">{defaultAccount ? defaultAccount.name : "No accounts yet"}</span>
              <Link href="/accounts"><Button variant="outline" size="sm">Manage accounts</Button></Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" /> Backup & Export</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Button variant="outline" className="h-auto flex-col items-start gap-1 p-4 text-left" onClick={backup} disabled={busy !== null}>
            <span className="flex items-center gap-2 font-medium">
              {busy === "backup" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileJson className="h-4 w-4" />} Full backup (JSON)
            </span>
            <span className="whitespace-normal text-xs font-normal text-muted-foreground">Everything: accounts, expenses, income, loans, budgets, bills, goals</span>
          </Button>
          <Button variant="outline" className="h-auto flex-col items-start gap-1 p-4 text-left" onClick={exportExpenses} disabled={busy !== null}>
            <span className="flex items-center gap-2 font-medium">
              {busy === "expenses" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Expenses (CSV)
            </span>
            <span className="whitespace-normal text-xs font-normal text-muted-foreground">Opens in Excel or Google Sheets</span>
          </Button>
          <Button variant="outline" className="h-auto flex-col items-start gap-1 p-4 text-left" onClick={exportIncome} disabled={busy !== null}>
            <span className="flex items-center gap-2 font-medium">
              {busy === "income" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Income (CSV)
            </span>
            <span className="whitespace-normal text-xs font-normal text-muted-foreground">With the month each payment was for</span>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Keyboard className="h-4 w-4" /> Keyboard Shortcuts</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <span>Open quick add</span>
            <kbd className="rounded border px-2 text-xs">N</kbd>
          </div>
          {QUICK_ACTIONS.map((a) => (
            <div key={a.key} className="flex items-center justify-between rounded-lg border px-3 py-2">
              <span className="flex items-center gap-2"><a.icon className="h-3.5 w-3.5 text-muted-foreground" /> {a.label}</span>
              <span className="text-xs text-muted-foreground">
                <kbd className="rounded border px-2">N</kbd> then <kbd className="rounded border px-2 uppercase">{a.key}</kbd>
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <span>Close menus and dialogs</span>
            <kbd className="rounded border px-2 text-xs">Esc</kbd>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
