"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Loader2,
  Plus,
  Trash2,
  Pencil,
  Landmark,
  TrendingUp,
  TrendingDown,
  CreditCard,
  PiggyBank,
  Building2,
  BarChart3,
} from "lucide-react";
import {
  type Account,
  type AccountType,
  type Debt,
  type NetWorthSnapshot,
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPE_COLORS,
  DEBT_TYPE_LABELS,
} from "@/types";
import type { NetWorthBreakdown } from "@/lib/net-worth";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

const ACCOUNT_ICONS: Record<AccountType, React.ElementType> = {
  checking: Landmark,
  savings: PiggyBank,
  credit_card: CreditCard,
  loan: Building2,
  investment: BarChart3,
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [netWorthHistory, setNetWorthHistory] = useState<NetWorthSnapshot[]>([]);
  const [current, setCurrent] = useState<NetWorthBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [showDebtDialog, setShowDebtDialog] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [accRes, debtRes, nwRes, currentRes] = await Promise.all([
        fetch("/api/accounts"),
        fetch("/api/debts"),
        fetch("/api/net-worth"),
        fetch("/api/net-worth?current=1"),
      ]);
      const [accJson, debtJson, nwJson, currentJson] = await Promise.all([
        accRes.json(),
        debtRes.json(),
        nwRes.json(),
        currentRes.json(),
      ]);
      setAccounts(accJson.data || []);
      setDebts(debtJson.data || []);
      setNetWorthHistory(nwJson.data || []);
      setCurrent(currentJson.data || null);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalAssets = current?.total_assets ?? 0;
  const totalLiabilities = current?.total_liabilities ?? 0;
  const netWorth = current?.net_worth ?? 0;
  const adj = current?.adjustments;

  const totalDebt = debts.filter((d) => d.is_active).reduce((s, d) => s + Number(d.current_balance), 0);

  async function handleSaveAccount(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      name: fd.get("name"),
      type: fd.get("type"),
      balance: parseFloat(fd.get("balance") as string),
      institution: fd.get("institution") || "",
      color: ACCOUNT_TYPE_COLORS[(fd.get("type") as AccountType) || "checking"],
    };

    try {
      const url = editingAccount ? `/api/accounts/${editingAccount.id}` : "/api/accounts";
      const method = editingAccount ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      toast.success(editingAccount ? "Account updated" : "Account added");
      setShowAccountDialog(false);
      setEditingAccount(null);
      fetchData();
      fetch("/api/net-worth", { method: "POST" });
    } catch {
      toast.error("Failed to save account");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAccount(id: string) {
    if (!confirm("Delete this account?")) return;
    try {
      const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Account deleted");
      fetchData();
    } catch {
      toast.error("Failed to delete");
    }
  }

  async function handleSaveDebt(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      name: fd.get("name"),
      type: fd.get("type"),
      original_amount: parseFloat(fd.get("original_amount") as string),
      current_balance: parseFloat(fd.get("current_balance") as string),
      interest_rate: parseFloat(fd.get("interest_rate") as string) || 0,
      minimum_payment: parseFloat(fd.get("minimum_payment") as string) || 0,
      due_day: parseInt(fd.get("due_day") as string) || 1,
    };

    try {
      const url = editingDebt ? `/api/debts/${editingDebt.id}` : "/api/debts";
      const method = editingDebt ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      toast.success(editingDebt ? "Debt updated" : "Debt added");
      setShowDebtDialog(false);
      setEditingDebt(null);
      fetchData();
      fetch("/api/net-worth", { method: "POST" });
    } catch {
      toast.error("Failed to save debt");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteDebt(id: string) {
    if (!confirm("Delete this debt?")) return;
    try {
      const res = await fetch(`/api/debts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Debt deleted");
      fetchData();
    } catch {
      toast.error("Failed to delete");
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Accounts & Net Worth</h1>
        <p className="text-muted-foreground">Manage your accounts and track net worth</p>
      </div>

      {/* Net Worth Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Assets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalAssets)}</div>
            {adj && (adj.security_deposit > 0 || adj.pending_reimbursements > 0 || adj.pending_income > 0 || adj.owed_to_you > 0) && (
              <p className="text-xs text-muted-foreground">
                incl.{" "}
                {[
                  adj.security_deposit > 0 && `${formatCurrency(adj.security_deposit)} rent deposit`,
                  adj.pending_reimbursements > 0 && `${formatCurrency(adj.pending_reimbursements)} pending claims`,
                  adj.pending_income > 0 && `${formatCurrency(adj.pending_income)} salary due`,
                  adj.owed_to_you > 0 && `${formatCurrency(adj.owed_to_you)} lent out`,
                ].filter(Boolean).join(" + ")}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Liabilities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{formatCurrency(totalLiabilities)}</div>
            {adj && (adj.tracked_debt > 0 || adj.owed_by_you > 0) && (
              <p className="text-xs text-muted-foreground">
                incl.{" "}
                {[
                  adj.tracked_debt > 0 && `${formatCurrency(adj.tracked_debt)} tracked debts`,
                  adj.owed_by_you > 0 && `${formatCurrency(adj.owed_by_you)} owed to friends & family`,
                ].filter(Boolean).join(" + ")}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Worth</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netWorth >= 0 ? "text-green-600" : "text-destructive"}`}>
              {formatCurrency(netWorth)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Net Worth Over Time Chart */}
      {netWorthHistory.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Net Worth Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={netWorthHistory}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => new Date(v).toLocaleDateString("en-IN", { month: "short", year: "2-digit" })} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={{ borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card)", color: "var(--card-foreground)" }} />
                <Line type="monotone" dataKey="net_worth" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Accounts List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Accounts ({accounts.length})</CardTitle>
          <Dialog open={showAccountDialog} onOpenChange={(o) => { setShowAccountDialog(o); if (!o) setEditingAccount(null); }}>
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="mr-1 h-4 w-4" /> Add Account
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingAccount ? "Edit Account" : "Add Account"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSaveAccount} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="acc-name">Account Name</Label>
                  <Input id="acc-name" name="name" required defaultValue={editingAccount?.name || ""} placeholder="e.g. HDFC Savings" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select name="type" defaultValue={editingAccount?.type || "checking"}>
                      <SelectTrigger><SelectValue>{(v: string) => (ACCOUNT_TYPE_LABELS as Record<string, string>)[v] ?? v}</SelectValue></SelectTrigger>
                      <SelectContent>
                        {(Object.entries(ACCOUNT_TYPE_LABELS) as [AccountType, string][])
                          // Loans live in the Debt Tracker; keep the option only for existing loan accounts.
                          .filter(([val]) => val !== "loan" || editingAccount?.type === "loan")
                          .map(([val, label]) => (
                            <SelectItem key={val} value={val}>{label}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="acc-balance">Balance</Label>
                    <Input id="acc-balance" name="balance" type="number" step="0.01" required defaultValue={editingAccount?.balance || ""} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="acc-institution">Institution</Label>
                  <Input id="acc-institution" name="institution" defaultValue={editingAccount?.institution || ""} placeholder="e.g. HDFC Bank" />
                </div>
                <Button type="submit" className="w-full" disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {editingAccount ? "Update" : "Add Account"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No accounts added yet.</p>
          ) : (
            <div className="space-y-2">
              {accounts.map((acc) => {
                const Icon = ACCOUNT_ICONS[acc.type] || Landmark;
                const isLiability = acc.type === "credit_card" || acc.type === "loan";
                return (
                  <div key={acc.id} className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: `${ACCOUNT_TYPE_COLORS[acc.type]}20` }}>
                      <Icon className="h-5 w-5" style={{ color: ACCOUNT_TYPE_COLORS[acc.type] }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{acc.name}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Badge variant="secondary" className="text-xs">{ACCOUNT_TYPE_LABELS[acc.type]}</Badge>
                        {acc.institution && <span>{acc.institution}</span>}
                      </div>
                    </div>
                    <span className={`shrink-0 text-lg font-semibold ${isLiability ? "text-destructive" : "text-green-600"}`}>
                      {isLiability ? "-" : ""}{formatCurrency(Math.abs(Number(acc.balance)))}
                    </span>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingAccount(acc); setShowAccountDialog(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteAccount(acc.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Debt Tracker */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Debt Tracker</CardTitle>
            {totalDebt > 0 && <p className="text-sm text-muted-foreground">Total outstanding: {formatCurrency(totalDebt)}</p>}
            <p className="text-xs text-muted-foreground">
              Bank loans, EMIs and credit cards; counted in net worth. Money from friends or family goes in{" "}
              <Link href="/people" className="underline">People & Loans</Link>.
            </p>
          </div>
          <Dialog open={showDebtDialog} onOpenChange={(o) => { setShowDebtDialog(o); if (!o) setEditingDebt(null); }}>
            <DialogTrigger render={<Button size="sm" variant="outline" />}>
              <Plus className="mr-1 h-4 w-4" /> Add Debt
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingDebt ? "Edit Debt" : "Add Debt"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSaveDebt} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="debt-name">Name</Label>
                  <Input id="debt-name" name="name" required defaultValue={editingDebt?.name || ""} placeholder="e.g. Home Loan" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select name="type" defaultValue={editingDebt?.type || "personal_loan"}>
                      <SelectTrigger><SelectValue>{(v: string) => (DEBT_TYPE_LABELS as Record<string, string>)[v] ?? v}</SelectValue></SelectTrigger>
                      <SelectContent>
                        {(Object.entries(DEBT_TYPE_LABELS) as [string, string][]).map(([val, label]) => (
                          <SelectItem key={val} value={val}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="debt-due">Due Day</Label>
                    <Input id="debt-due" name="due_day" type="number" min="1" max="31" defaultValue={editingDebt?.due_day || 1} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="debt-original">Original Amount</Label>
                    <Input id="debt-original" name="original_amount" type="number" step="0.01" required defaultValue={editingDebt?.original_amount || ""} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="debt-current">Current Balance</Label>
                    <Input id="debt-current" name="current_balance" type="number" step="0.01" required defaultValue={editingDebt?.current_balance || ""} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="debt-rate">Interest Rate (%)</Label>
                    <Input id="debt-rate" name="interest_rate" type="number" step="0.01" defaultValue={editingDebt?.interest_rate || 0} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="debt-min">Min. Payment</Label>
                    <Input id="debt-min" name="minimum_payment" type="number" step="0.01" defaultValue={editingDebt?.minimum_payment || 0} />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {editingDebt ? "Update" : "Add Debt"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {debts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No debts tracked yet.</p>
          ) : (
            <div className="space-y-3">
              {debts.map((debt) => {
                const paidOff = Number(debt.original_amount) - Number(debt.current_balance);
                const pctPaid = Number(debt.original_amount) > 0 ? (paidOff / Number(debt.original_amount)) * 100 : 0;
                return (
                  <div key={debt.id} className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{debt.name}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Badge variant="secondary" className="text-xs">{DEBT_TYPE_LABELS[debt.type]}</Badge>
                          <span>{debt.interest_rate}% APR</span>
                          <span>Due: {debt.due_day}th</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold text-destructive">{formatCurrency(Number(debt.current_balance))}</p>
                        <p className="text-xs text-muted-foreground">of {formatCurrency(Number(debt.original_amount))}</p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{formatCurrency(paidOff)} paid off</span>
                        <span>{pctPaid.toFixed(0)}%</span>
                      </div>
                      <Progress value={pctPaid} indicatorClassName="bg-green-500" />
                    </div>
                    {Number(debt.minimum_payment) > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Min. payment: {formatCurrency(Number(debt.minimum_payment))}/month
                      </p>
                    )}
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingDebt(debt); setShowDebtDialog(true); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteDebt(debt.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
