"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  Plus,
  Trash2,
  Pencil,
  Wallet,
  IndianRupee,
  PiggyBank,
  Percent,
  ChevronLeft,
  ChevronRight,
  Repeat,
  Hourglass,
  CheckCircle2,
} from "lucide-react";
import {
  type Income,
  type IncomeType,
  type Expense,
  INCOME_TYPE_LABELS,
  INCOME_TYPE_COLORS,
  SAVINGS_CATEGORIES,
  outOfPocket,
} from "@/types";
import { FiftyThirtyTwenty } from "@/components/dashboard/fifty-thirty-twenty";
import { AccountSelect, refreshAccounts, useAccounts } from "@/components/account-select";
import { cn, formatCurrency, formatDate, toLocalDateString } from "@/lib/utils";
import { toast } from "sonner";

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-08-01" → "Aug 2026" */
function monthName(forMonth: string, style: "short" | "long" = "short") {
  const [y, m] = forMonth.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-IN", { month: style, year: "numeric" });
}

/**
 * Salary paid early in a month (on or before the 15th) is usually for the
 * previous month; anything later is for the month it arrives in.
 */
function guessForMonth(date: string, type: IncomeType) {
  const [y, m, d] = date.split("-").map(Number);
  if (type === "salary" && d <= 15) {
    const prev = new Date(y, m - 2, 1);
    return `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}`;
  }
  return `${y}-${pad(m)}`;
}

/** Same day-offset from the earned month, shifted to a new earned month (clamped to month length). */
function shiftPayDate(source: Income, targetForMonth: string) {
  const [fy, fm] = source.for_month.split("-").map(Number);
  const [dy, dm, dd] = source.date.split("-").map(Number);
  const monthsAfter = (dy - fy) * 12 + (dm - fm);
  const [ty, tm] = targetForMonth.split("-").map(Number);
  const payMonth = new Date(ty, tm - 1 + monthsAfter, 1);
  const lastDay = new Date(payMonth.getFullYear(), payMonth.getMonth() + 1, 0).getDate();
  return `${payMonth.getFullYear()}-${pad(payMonth.getMonth() + 1)}-${pad(Math.min(dd, lastDay))}`;
}

export default function IncomePage() {
  const today = new Date();
  const todayStr = toLocalDateString(today);
  const [cursor, setCursor] = useState({ month: today.getMonth() + 1, year: today.getFullYear() });
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [prevIncomes, setPrevIncomes] = useState<Income[]>([]);
  const [pending, setPending] = useState<Income[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Dialog form state (controlled so "For month" can follow the date until edited by hand)
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Income | null>(null);
  const [fType, setFType] = useState<IncomeType>("salary");
  const [fDate, setFDate] = useState(todayStr);
  const [fForMonth, setFForMonth] = useState(guessForMonth(todayStr, "salary"));
  const [fForMonthTouched, setFForMonthTouched] = useState(false);
  const [fReceived, setFReceived] = useState(true);
  const [fAccount, setFAccount] = useState<string | null>(null);
  const { defaultId, loaded: defaultLoaded } = useAccounts();

  const { month, year } = cursor;
  const forMonthKey = `${year}-${pad(month)}-01`;
  const prev = month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
  const isCurrentMonth = month === today.getMonth() + 1 && year === today.getFullYear();
  const monthLabel = monthName(forMonthKey, "long");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [incRes, prevRes, pendRes, expRes] = await Promise.all([
        fetch(`/api/incomes?month=${month}&year=${year}`),
        fetch(`/api/incomes?month=${prev.month}&year=${prev.year}`),
        fetch("/api/incomes?pending=1"),
        fetch(`/api/expenses?month=${month}&year=${year}&limit=1000`),
      ]);
      const [incJson, prevJson, pendJson, expJson] = await Promise.all([
        incRes.json(),
        prevRes.json(),
        pendRes.json(),
        expRes.json(),
      ]);
      setIncomes(incJson.data || []);
      setPrevIncomes(prevJson.data || []);
      setPending(pendJson.data || []);
      setExpenses(expJson.data || []);
    } catch {
      toast.error("Failed to load income");
    } finally {
      setLoading(false);
    }
  }, [month, year, prev.month, prev.year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Quick add (/income?new=1) opens the form straight away.
  const [autoOpened, setAutoOpened] = useState(false);
  useEffect(() => {
    if (autoOpened || !defaultLoaded) return;
    setAutoOpened(true);
    if (new URLSearchParams(window.location.search).get("new")) {
      window.history.replaceState(null, "", "/income");
      openDialog(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time check once accounts have loaded
  }, [autoOpened, defaultLoaded]);

  function shiftMonth(delta: number) {
    setCursor(({ month: m, year: y }) => {
      const d = new Date(y, m - 1 + delta, 1);
      return { month: d.getMonth() + 1, year: d.getFullYear() };
    });
  }

  function openDialog(income: Income | null) {
    setEditing(income);
    if (income) {
      setFType(income.type);
      setFDate(income.date);
      setFForMonth(income.for_month.slice(0, 7));
      setFForMonthTouched(true);
      setFReceived(income.is_received);
      setFAccount(income.account_id);
    } else {
      const date = isCurrentMonth ? todayStr : `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`;
      setFType("salary");
      setFDate(date);
      setFForMonth(`${year}-${pad(month)}`);
      setFForMonthTouched(!isCurrentMonth);
      setFReceived(true);
      setFAccount(defaultId);
    }
    setShowDialog(true);
  }

  function onDateChange(date: string) {
    setFDate(date);
    if (!fForMonthTouched && date) setFForMonth(guessForMonth(date, fType));
    if (date > todayStr) setFReceived(false);
  }

  function onTypeChange(type: IncomeType) {
    setFType(type);
    if (!fForMonthTouched && fDate) setFForMonth(guessForMonth(fDate, type));
  }

  const received = incomes.filter((i) => i.is_received);
  const expected = incomes.filter((i) => !i.is_received);
  const totalReceived = received.reduce((s, i) => s + Number(i.amount), 0);
  const totalExpected = expected.reduce((s, i) => s + Number(i.amount), 0);
  const totalEarned = totalReceived + totalExpected;
  const totalSpent = expenses.reduce((s, e) => s + outOfPocket(e), 0);
  const invested = expenses
    .filter((e) => SAVINGS_CATEGORIES.includes(e.category))
    .reduce((s, e) => s + Number(e.amount), 0);
  const leftOver = totalEarned - totalSpent;
  const savingsRate = totalEarned > 0 ? (leftOver / totalEarned) * 100 : 0;
  const prevTotal = prevIncomes.reduce((s, i) => s + Number(i.amount), 0);
  const allPending = pending.reduce((s, i) => s + Number(i.amount), 0);

  const byType: Partial<Record<IncomeType, number>> = {};
  for (const i of incomes) byType[i.type] = (byType[i.type] || 0) + Number(i.amount);

  // Offer to repeat last month's salary entries that haven't been added for this month yet.
  const missingSalaries = prevIncomes.filter(
    (p) => p.type === "salary" && !incomes.some((i) => i.type === "salary" && i.source.toLowerCase() === p.source.toLowerCase())
  );

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      amount: parseFloat(fd.get("amount") as string),
      source: (fd.get("source") as string).trim(),
      type: fType,
      date: fDate || todayStr,
      for_month: `${fForMonth}-01`,
      is_received: fReceived,
      account_id: fAccount,
      note: fd.get("note") || "",
    };
    try {
      const res = await fetch(editing ? `/api/incomes/${editing.id}` : "/api/incomes", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      toast.success(
        `${editing ? "Updated" : fReceived ? "Added" : "Added as expected"}: ${body.source}, ${monthName(body.for_month)}`
      );
      setShowDialog(false);
      setEditing(null);
      fetchData();
      refreshAccounts();
      fetch("/api/net-worth", { method: "POST" });
    } catch (err) {
      toast.error(err instanceof Error && err.message ? `Failed to save income: ${err.message}` : "Failed to save income");
    } finally {
      setSaving(false);
    }
  }

  async function markReceived(income: Income) {
    try {
      const res = await fetch(`/api/incomes/${income.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_received: true,
          date: income.date > todayStr ? todayStr : income.date,
          account_id: income.account_id ?? defaultId,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${income.source} (${monthName(income.for_month)}) marked as received`);
      fetchData();
      refreshAccounts();
      fetch("/api/net-worth", { method: "POST" });
    } catch {
      toast.error("Failed to update");
    }
  }

  async function repeatSalaries() {
    setSaving(true);
    try {
      const results = await Promise.all(
        missingSalaries.map((p) => {
          const date = shiftPayDate(p, forMonthKey);
          return fetch("/api/incomes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              amount: p.amount,
              source: p.source,
              type: "salary",
              date,
              for_month: forMonthKey,
              is_received: date <= todayStr,
              account_id: p.account_id ?? defaultId,
              note: "",
            }),
          });
        })
      );
      if (results.some((r) => !r.ok)) throw new Error();
      toast.success(`Salary added for ${monthLabel}`);
      fetchData();
    } catch {
      toast.error("Failed to add salary");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(income: Income) {
    if (!confirm(`Delete ${income.source} (${formatCurrency(Number(income.amount))}, ${monthName(income.for_month)})?`)) return;
    try {
      const res = await fetch(`/api/incomes/${income.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Income deleted");
      fetchData();
      refreshAccounts();
      fetch("/api/net-worth", { method: "POST" });
    } catch {
      toast.error("Failed to delete");
    }
  }

  function renderIncomeRow(i: Income, showMonth = false) {
    const paidLater = i.date.slice(0, 7) !== i.for_month.slice(0, 7);
    return (
      <div key={i.id} className={cn("flex items-center gap-3 rounded-lg border p-3", !i.is_received && "border-dashed")}>
        <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: INCOME_TYPE_COLORS[i.type] }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{i.source}</p>
            {showMonth && <Badge variant="secondary" className="text-xs">{monthName(i.for_month)}</Badge>}
            {!i.is_received && <Badge variant="outline" className="text-xs text-yellow-600">Expected</Badge>}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>{INCOME_TYPE_LABELS[i.type]}</span>
            <span>
              · {i.is_received ? "received" : "expected"} {formatDate(i.date)}
              {paidLater && !showMonth && ` (for ${monthName(i.for_month)})`}
            </span>
            {i.note && <span className="truncate">· {i.note}</span>}
          </div>
        </div>
        <span className={cn("shrink-0 font-semibold", i.is_received ? "text-green-600" : "text-muted-foreground")}>
          +{formatCurrency(Number(i.amount))}
        </span>
        {!i.is_received && (
          <Button variant="outline" size="sm" className="h-8" onClick={() => markReceived(i)}>
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Received
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDialog(i)} aria-label="Edit">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(i)} aria-label="Delete">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Income</h1>
          <p className="text-muted-foreground">Grouped by the month it was earned for, not the day it arrived</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shiftMonth(-1)} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="w-36 text-center text-sm font-medium">{monthLabel}</span>
          <Button variant="outline" size="icon" onClick={() => shiftMonth(1)} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button onClick={() => openDialog(null)}>
            <Plus className="mr-1 h-4 w-4" /> Add Income
          </Button>
        </div>
      </div>

      <Dialog open={showDialog} onOpenChange={(o) => { setShowDialog(o); if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Income" : "Add Income"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {[true, false].map((r) => (
                <button
                  key={String(r)}
                  type="button"
                  onClick={() => setFReceived(r)}
                  className={cn(
                    "rounded-lg border p-2 text-sm font-medium transition-colors",
                    fReceived === r ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
                  )}
                >
                  {r ? "Received" : "Expected (not yet received)"}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="inc-amount">Amount (₹)</Label>
                <Input id="inc-amount" name="amount" type="number" min="1" step="0.01" required defaultValue={editing?.amount || ""} />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={fType} onValueChange={(v) => onTypeChange((v as IncomeType) || "salary")}>
                  <SelectTrigger>
                    <SelectValue>{(v: string) => INCOME_TYPE_LABELS[v as IncomeType] ?? v}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(INCOME_TYPE_LABELS) as [IncomeType, string][]).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inc-source">Source</Label>
              <Input id="inc-source" name="source" required defaultValue={editing?.source || ""} placeholder="e.g. Company name, client, Mom" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="inc-date">{fReceived ? "Received on" : "Expected on"}</Label>
                <Input id="inc-date" type="date" value={fDate} onChange={(e) => onDateChange(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inc-for">For month</Label>
                <Input
                  id="inc-for"
                  type="month"
                  value={fForMonth}
                  onChange={(e) => { setFForMonth(e.target.value); setFForMonthTouched(true); }}
                  required
                />
              </div>
            </div>
            {fType === "salary" && fDate && fForMonth && fDate.slice(0, 7) !== fForMonth && (
              <p className="text-xs text-muted-foreground">
                Paid {formatDate(fDate)}, counted as {monthName(`${fForMonth}-01`, "long")} salary.
              </p>
            )}
            <div className="space-y-2">
              <Label>{fReceived ? "Received in" : "Will arrive in"}</Label>
              <AccountSelect value={fAccount} onChange={setFAccount} placeholder="Not linked to an account" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inc-note">Note (optional)</Label>
              <Input id="inc-note" name="note" defaultValue={editing?.note || ""} placeholder="e.g. includes F&F settlement" />
            </div>
            <p className="text-xs text-muted-foreground">
              Don&apos;t add company reimbursements, loans from friends, or money someone paid back to you here. Those
              are tracked in Reimbursements and People &amp; Loans, so they aren&apos;t counted twice.
            </p>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editing ? "Update" : "Add Income"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <Card className="border-yellow-200 bg-yellow-50/40 dark:border-yellow-900 dark:bg-yellow-950/10">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Hourglass className="h-4 w-4 text-yellow-600" />
                  Still to receive: {formatCurrency(allPending)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {pending.map((i) => renderIncomeRow(i, true))}
              </CardContent>
            </Card>
          )}

          {missingSalaries.length > 0 && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <Repeat className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                  <p className="text-sm">
                    No {monthLabel} salary from <span className="font-medium">{missingSalaries.map((s) => s.source).join(", ")}</span> yet.
                    Last month it was {formatCurrency(missingSalaries.reduce((s, p) => s + Number(p.amount), 0))}.
                  </p>
                </div>
                <Button variant="outline" onClick={repeatSalaries} disabled={saving}>Add same amount</Button>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Earned</CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{formatCurrency(totalEarned)}</div>
                <p className={`text-xs ${totalExpected > 0 ? "text-yellow-600" : "text-muted-foreground"}`}>
                  {totalExpected > 0
                    ? `${formatCurrency(totalExpected)} not received yet`
                    : prevTotal > 0 ? `${formatCurrency(prevTotal)} last month` : `${incomes.length} entries`}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Spent</CardTitle>
                <IndianRupee className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(totalSpent)}</div>
                <p className="text-xs text-muted-foreground">out of pocket, excl. savings &amp; investments</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Left Over</CardTitle>
                <PiggyBank className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${leftOver >= 0 ? "text-green-600" : "text-destructive"}`}>{formatCurrency(leftOver)}</div>
                <p className="text-xs text-muted-foreground">
                  {invested > 0 ? `incl. ${formatCurrency(invested)} saved / invested` : leftOver >= 0 ? "available to save or invest" : "overspent this month"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Savings Rate</CardTitle>
                <Percent className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${savingsRate >= 20 ? "text-green-600" : savingsRate >= 0 ? "text-yellow-600" : "text-destructive"}`}>
                  {totalEarned > 0 ? `${savingsRate.toFixed(0)}%` : "—"}
                </div>
                <p className="text-xs text-muted-foreground">aim for 20% or more</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{monthLabel} Income</CardTitle>
              </CardHeader>
              <CardContent>
                {incomes.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No income recorded for {monthLabel}.</p>
                ) : (
                  <div className="space-y-2">
                    {incomes.map((i) => renderIncomeRow(i))}
                    {Object.keys(byType).length > 1 && (
                      <div className="flex flex-wrap gap-2 pt-2">
                        {(Object.entries(byType) as [IncomeType, number][]).map(([t, v]) => (
                          <Badge key={t} variant="outline" className="gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: INCOME_TYPE_COLORS[t] }} />
                            {INCOME_TYPE_LABELS[t]}: {formatCurrency(v)}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <FiftyThirtyTwenty income={totalEarned} expenses={expenses} title={`50/30/20 Check: ${monthLabel}`} />
          </div>
        </>
      )}
    </div>
  );
}
