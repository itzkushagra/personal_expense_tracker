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
  DialogTrigger,
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
} from "lucide-react";
import {
  type Income,
  type IncomeType,
  type Expense,
  INCOME_TYPE_LABELS,
  INCOME_TYPE_COLORS,
  outOfPocket,
} from "@/types";
import { FiftyThirtyTwenty } from "@/components/dashboard/fifty-thirty-twenty";
import { formatCurrency, formatDate, toLocalDateString } from "@/lib/utils";
import { toast } from "sonner";

export default function IncomePage() {
  const today = new Date();
  const [cursor, setCursor] = useState({ month: today.getMonth() + 1, year: today.getFullYear() });
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [prevIncomes, setPrevIncomes] = useState<Income[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Income | null>(null);
  const [saving, setSaving] = useState(false);

  const { month, year } = cursor;
  const prev = month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
  const isCurrentMonth = month === today.getMonth() + 1 && year === today.getFullYear();
  const monthLabel = new Date(year, month - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [incRes, prevRes, expRes] = await Promise.all([
        fetch(`/api/incomes?month=${month}&year=${year}`),
        fetch(`/api/incomes?month=${prev.month}&year=${prev.year}`),
        fetch(`/api/expenses?month=${month}&year=${year}&limit=1000`),
      ]);
      const [incJson, prevJson, expJson] = await Promise.all([incRes.json(), prevRes.json(), expRes.json()]);
      setIncomes(incJson.data || []);
      setPrevIncomes(prevJson.data || []);
      setExpenses(expJson.data || []);
    } catch {
      toast.error("Failed to load income");
    } finally {
      setLoading(false);
    }
  }, [month, year, prev.month, prev.year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function shiftMonth(delta: number) {
    setCursor(({ month: m, year: y }) => {
      const d = new Date(y, m - 1 + delta, 1);
      return { month: d.getMonth() + 1, year: d.getFullYear() };
    });
  }

  const totalIncome = incomes.reduce((s, i) => s + Number(i.amount), 0);
  const totalSpent = expenses.reduce((s, e) => s + outOfPocket(e), 0);
  const saved = totalIncome - totalSpent;
  const savingsRate = totalIncome > 0 ? (saved / totalIncome) * 100 : 0;
  const prevTotal = prevIncomes.reduce((s, i) => s + Number(i.amount), 0);

  const byType: Partial<Record<IncomeType, number>> = {};
  for (const i of incomes) byType[i.type] = (byType[i.type] || 0) + Number(i.amount);

  // Offer to repeat last month's salary entries that haven't been added this month yet.
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
      type: fd.get("type") || "salary",
      date: fd.get("date") || toLocalDateString(),
      note: fd.get("note") || "",
    };
    try {
      const res = await fetch(editing ? `/api/incomes/${editing.id}` : "/api/incomes", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      toast.success(editing ? "Income updated" : "Income added");
      setShowDialog(false);
      setEditing(null);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? `Failed to save income: ${err.message}` : "Failed to save income");
    } finally {
      setSaving(false);
    }
  }

  async function repeatSalaries() {
    setSaving(true);
    try {
      const results = await Promise.all(
        missingSalaries.map((p) => {
          // Same day of month as last time, clamped to this month's length.
          const day = Math.min(Number(p.date.slice(8, 10)), new Date(year, month, 0).getDate());
          return fetch("/api/incomes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              amount: p.amount,
              source: p.source,
              type: "salary",
              date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
              note: p.note,
            }),
          });
        })
      );
      if (results.some((r) => !r.ok)) throw new Error();
      toast.success("Salary added for " + monthLabel);
      fetchData();
    } catch {
      toast.error("Failed to add salary");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this income entry?")) return;
    try {
      await fetch(`/api/incomes/${id}`, { method: "DELETE" });
      toast.success("Income deleted");
      fetchData();
    } catch {
      toast.error("Failed to delete");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Income</h1>
          <p className="text-muted-foreground">Salary and other money that&apos;s yours to keep</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shiftMonth(-1)} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="w-36 text-center text-sm font-medium">{monthLabel}</span>
          <Button variant="outline" size="icon" onClick={() => shiftMonth(1)} disabled={isCurrentMonth} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Dialog open={showDialog} onOpenChange={(o) => { setShowDialog(o); if (!o) setEditing(null); }}>
            <DialogTrigger render={<Button />}>
              <Plus className="mr-1 h-4 w-4" /> Add Income
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Income" : "Add Income"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="inc-amount">Amount (₹)</Label>
                    <Input id="inc-amount" name="amount" type="number" min="1" step="0.01" required defaultValue={editing?.amount || ""} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inc-date">Date</Label>
                    <Input
                      id="inc-date"
                      name="date"
                      type="date"
                      defaultValue={editing?.date || (isCurrentMonth ? toLocalDateString() : `${year}-${String(month).padStart(2, "0")}-01`)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="inc-source">Source</Label>
                    <Input id="inc-source" name="source" required defaultValue={editing?.source || ""} placeholder="e.g. Company name, client" />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select name="type" defaultValue={editing?.type || "salary"}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.entries(INCOME_TYPE_LABELS) as [IncomeType, string][]).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inc-note">Note (optional)</Label>
                  <Input id="inc-note" name="note" defaultValue={editing?.note || ""} placeholder="e.g. includes Diwali bonus" />
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
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {missingSalaries.length > 0 && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <Repeat className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                  <p className="text-sm">
                    Salary from <span className="font-medium">{missingSalaries.map((s) => s.source).join(", ")}</span> isn&apos;t
                    added for {monthLabel} yet. Last month it was {formatCurrency(missingSalaries.reduce((s, p) => s + Number(p.amount), 0))}.
                  </p>
                </div>
                <Button variant="outline" onClick={repeatSalaries} disabled={saving}>Add same amount</Button>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Income</CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{formatCurrency(totalIncome)}</div>
                <p className="text-xs text-muted-foreground">
                  {prevTotal > 0 ? `${formatCurrency(prevTotal)} last month` : `${incomes.length} entries`}
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
                <p className="text-xs text-muted-foreground">out of pocket</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Left Over</CardTitle>
                <PiggyBank className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${saved >= 0 ? "text-green-600" : "text-destructive"}`}>{formatCurrency(saved)}</div>
                <p className="text-xs text-muted-foreground">{saved >= 0 ? "available to save or invest" : "overspent this month"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Savings Rate</CardTitle>
                <Percent className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${savingsRate >= 20 ? "text-green-600" : savingsRate >= 0 ? "text-yellow-600" : "text-destructive"}`}>
                  {totalIncome > 0 ? `${savingsRate.toFixed(0)}%` : "—"}
                </div>
                <p className="text-xs text-muted-foreground">aim for 20% or more</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Entries</CardTitle>
              </CardHeader>
              <CardContent>
                {incomes.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No income recorded for {monthLabel}.</p>
                ) : (
                  <div className="space-y-2">
                    {incomes.map((i) => (
                      <div key={i.id} className="flex items-center gap-3 rounded-lg border p-3">
                        <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: INCOME_TYPE_COLORS[i.type] }} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{i.source}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{formatDate(i.date)}</span>
                            <Badge variant="secondary" className="text-xs">{INCOME_TYPE_LABELS[i.type]}</Badge>
                            {i.note && <span className="truncate">{i.note}</span>}
                          </div>
                        </div>
                        <span className="shrink-0 font-semibold text-green-600">+{formatCurrency(Number(i.amount))}</span>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(i); setShowDialog(true); }} aria-label="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(i.id)} aria-label="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
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

            <FiftyThirtyTwenty income={totalIncome} expenses={expenses} title={`50/30/20 Check: ${monthLabel}`} />
          </div>
        </>
      )}
    </div>
  );
}
