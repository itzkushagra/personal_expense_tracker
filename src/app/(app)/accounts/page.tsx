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
  CreditCard,
  PiggyBank,
  Building2,
  BarChart3,
  Banknote,
  Smartphone,
  Star,
  ScrollText,
  Link2,
  ArrowLeftRight,
} from "lucide-react";
import {
  type Account,
  type AccountType,
  type Debt,
  type NetWorthSnapshot,
  type Transfer,
  LIABILITY_ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPE_COLORS,
  DEBT_TYPE_LABELS,
} from "@/types";
import type { NetWorthBreakdown } from "@/lib/net-worth";
import { formatCurrency, formatDate, toLocalDateString } from "@/lib/utils";
import { AccountSelect, refreshAccounts } from "@/components/account-select";
import { toast } from "sonner";
import { startLoad } from "@/lib/load";

const ACCOUNT_ICONS: Record<AccountType, React.ElementType> = {
  checking: Landmark,
  savings: PiggyBank,
  cash: Banknote,
  wallet: Smartphone,
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
  // Debt form: the card / loan account this entry is (undefined = not chosen, so the
  // server links a same-named card or loan account if there is exactly one).
  const [debtLink, setDebtLink] = useState<string | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [unlinked, setUnlinked] = useState<{ expenses: number; incomes: number; loan_entries: number } | null>(null);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState<Transfer | null>(null);
  const [tFrom, setTFrom] = useState<string | null>(null);
  const [tTo, setTTo] = useState<string | null>(null);
  const [linkAccount, setLinkAccount] = useState<string | null>(null);
  const [linkFrom, setLinkFrom] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [accRes, debtRes, nwRes, currentRes, trRes, unlinkedRes] = await Promise.all([
        fetch("/api/accounts"),
        fetch("/api/debts"),
        fetch("/api/net-worth"),
        fetch("/api/net-worth?current=1"),
        fetch("/api/transfers"),
        fetch("/api/accounts/unlinked"),
      ]);
      const [accJson, debtJson, nwJson, currentJson, trJson, unlinkedJson] = await Promise.all([
        accRes.json(),
        debtRes.json(),
        nwRes.json(),
        currentRes.json(),
        trRes.json(),
        unlinkedRes.json(),
      ]);
      setAccounts(accJson.data || []);
      setTransfers(trJson.data || []);
      setUnlinked(unlinkedJson.data || null);
      refreshAccounts();
      setDebts(debtJson.data || []);
      setNetWorthHistory(nwJson.data || []);
      setCurrent(currentJson.data || null);
      return (accJson.data || []) as Account[];
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  // Quick add (/accounts?transfer=1) opens the transfer form once accounts are loaded.
  useEffect(() => {
    const wantsTransfer = new URLSearchParams(window.location.search).get("transfer");
    let active = true;
    startLoad(fetchData).then((list) => {
      if (!active || !wantsTransfer || !list) return;
      window.history.replaceState(null, "", "/accounts");
      if (list.length >= 2) openTransfer(null, list);
      else toast.info("Add at least two accounts to record a transfer");
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openTransfer only uses state setters and the list passed in
  }, [fetchData]);

  const totalAssets = current?.total_assets ?? 0;
  const totalLiabilities = current?.total_liabilities ?? 0;
  const netWorth = current?.net_worth ?? 0;
  const adj = current?.adjustments;

  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "Deleted account";

  // A Debt Tracker entry linked to a card / loan account owes what that account owes.
  const linkedAccount = (d: Debt) => (d.account_id ? accounts.find((a) => a.id === d.account_id) : undefined);
  const debtBalance = (d: Debt) => {
    const acc = linkedAccount(d);
    return acc ? Number(acc.balance) : Number(d.current_balance);
  };
  const liabilityAccounts = accounts.filter((a) => LIABILITY_ACCOUNT_TYPES.includes(a.type));
  const totalDebt = debts.filter((d) => d.is_active).reduce((s, d) => s + debtBalance(d), 0);

  async function handleSaveAccount(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const actual = fd.get("actual_balance") as string | null;
    const body = {
      name: fd.get("name"),
      type: fd.get("type"),
      opening_balance: parseFloat(fd.get("opening_balance") as string) || 0,
      opening_date: fd.get("opening_date") || toLocalDateString(),
      is_default: fd.get("is_default") === "on",
      institution: fd.get("institution") || "",
      color: ACCOUNT_TYPE_COLORS[(fd.get("type") as AccountType) || "checking"],
      ...(actual ? { actual_balance: parseFloat(actual) } : {}),
    };

    try {
      const url = editingAccount ? `/api/accounts/${editingAccount.id}` : "/api/accounts";
      const method = editingAccount ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      toast.success(editingAccount ? (actual ? "Balance matched to your bank" : "Account updated") : "Account added");
      setShowAccountDialog(false);
      setEditingAccount(null);
      fetchData();
      fetch("/api/net-worth", { method: "POST" });
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Failed to save account");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveTransfer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!tFrom || !tTo || tFrom === tTo) {
      toast.error("Pick two different accounts");
      return;
    }
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      from_account_id: tFrom,
      to_account_id: tTo,
      amount: parseFloat(fd.get("amount") as string),
      date: fd.get("date") || toLocalDateString(),
      note: fd.get("note") || "",
    };
    try {
      const res = await fetch(editingTransfer ? `/api/transfers/${editingTransfer.id}` : "/api/transfers", {
        method: editingTransfer ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      toast.success(editingTransfer ? "Transfer updated" : "Transfer recorded");
      setShowTransferDialog(false);
      setEditingTransfer(null);
      fetchData();
      fetch("/api/net-worth", { method: "POST" });
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Failed to save transfer");
    } finally {
      setSaving(false);
    }
  }

  function openTransfer(t: Transfer | null, list: Account[] = accounts) {
    setEditingTransfer(t);
    const first = list.find((a) => a.is_default)?.id ?? list[0]?.id ?? null;
    setTFrom(t ? t.from_account_id : first);
    setTTo(t ? t.to_account_id : list.find((a) => a.id !== first)?.id ?? null);
    setShowTransferDialog(true);
  }

  async function handleDeleteTransfer(t: Transfer) {
    if (!confirm(`Delete this ${formatCurrency(Number(t.amount))} transfer?`)) return;
    try {
      const res = await fetch(`/api/transfers/${t.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Transfer deleted");
      fetchData();
    } catch {
      toast.error("Failed to delete transfer");
    }
  }

  async function handleLinkAll() {
    if (!linkAccount || !unlinked) return;
    const kinds = (["expenses", "incomes", "loan_entries"] as const).filter((k) => unlinked[k] > 0);
    const name = accounts.find((a) => a.id === linkAccount)?.name;
    if (!confirm(`Link all unlinked records${linkFrom ? ` dated ${formatDate(linkFrom)} or later` : ""} to ${name}?`)) return;
    setSaving(true);
    try {
      const res = await fetch("/api/accounts/unlinked", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: linkAccount, kinds, from: linkFrom || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const n = Object.values(json.data as Record<string, number>).reduce((sum, v) => sum + v, 0);
      toast.success(`Linked ${n} records to ${name}`);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Failed to link");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAccount(id: string) {
    if (!confirm("Delete this account? Linked expenses and income are kept but become unlinked; transfers involving it are deleted.")) return;
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
      ...(debtLink !== undefined ? { account_id: debtLink } : {}),
    };

    try {
      const url = editingDebt ? `/api/debts/${editingDebt.id}` : "/api/debts";
      const method = editingDebt ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      toast.success(editingDebt ? "Debt updated" : "Debt added");
      setShowDebtDialog(false);
      setEditingDebt(null);
      fetchData();
      fetch("/api/net-worth", { method: "POST" });
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Failed to save debt");
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
          <div>
            <CardTitle className="text-base">Accounts ({accounts.length})</CardTitle>
            <p className="text-xs text-muted-foreground">Balances are calculated from every linked expense, income, loan entry and transfer.</p>
          </div>
          <Dialog open={showAccountDialog} onOpenChange={(o) => { setShowAccountDialog(o); if (!o) setEditingAccount(null); }}>
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="mr-1 h-4 w-4" /> Add Account
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingAccount ? "Edit Account" : "Add Account"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSaveAccount} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="acc-name">Account Name</Label>
                    <Input id="acc-name" name="name" required defaultValue={editingAccount?.name || ""} placeholder="e.g. HDFC Salary, Cash" />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select name="type" defaultValue={editingAccount?.type || "savings"}>
                      <SelectTrigger className="w-full"><SelectValue>{(v: string) => (ACCOUNT_TYPE_LABELS as Record<string, string>)[v] ?? v}</SelectValue></SelectTrigger>
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
                </div>
                <div className="space-y-2">
                  <Label htmlFor="acc-institution">Bank / Provider</Label>
                  <Input id="acc-institution" name="institution" defaultValue={editingAccount?.institution || ""} placeholder="e.g. HDFC Bank, Paytm" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="acc-opening">Starting balance</Label>
                    <Input id="acc-opening" name="opening_balance" type="number" step="0.01" defaultValue={editingAccount?.opening_balance ?? ""} placeholder="0" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="acc-opening-date">as of</Label>
                    <Input id="acc-opening-date" name="opening_date" type="date" defaultValue={editingAccount?.opening_date || toLocalDateString()} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  The balance on that date. Everything linked to this account from that date on is added or subtracted
                  automatically. For a credit card, enter the amount you owe.
                </p>
                {editingAccount && (
                  <div className="space-y-2 rounded-lg border border-dashed p-3">
                    <Label htmlFor="acc-actual">Match my bank balance (optional)</Label>
                    <Input id="acc-actual" name="actual_balance" type="number" step="0.01" placeholder={`Currently ${formatCurrency(Number(editingAccount.balance))}`} />
                    <p className="text-xs text-muted-foreground">Enter what your bank app shows right now and the starting balance is adjusted so they match.</p>
                  </div>
                )}
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" name="is_default" className="h-4 w-4 accent-primary" defaultChecked={editingAccount?.is_default ?? accounts.length === 0} />
                  Default account for new expenses and income
                </label>
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
            <p className="py-8 text-center text-sm text-muted-foreground">
              No accounts yet. Add your bank accounts, cash and UPI wallets to track where every rupee sits.
            </p>
          ) : (
            <div className="space-y-2">
              {accounts.map((acc) => {
                const Icon = ACCOUNT_ICONS[acc.type] || Landmark;
                const isLiability = LIABILITY_ACCOUNT_TYPES.includes(acc.type);
                const bal = Number(acc.balance);
                return (
                  <div key={acc.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${ACCOUNT_TYPE_COLORS[acc.type]}20` }}>
                      <Icon className="h-5 w-5" style={{ color: ACCOUNT_TYPE_COLORS[acc.type] }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{acc.name}</p>
                        {acc.is_default && <Star className="h-3.5 w-3.5 shrink-0 fill-yellow-400 text-yellow-400" aria-label="Default account" />}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <Badge variant="secondary" className="text-xs">{ACCOUNT_TYPE_LABELS[acc.type]}</Badge>
                        {acc.institution && <span>{acc.institution}</span>}
                        <span className="text-xs">since {formatDate(acc.opening_date)}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-lg font-semibold ${isLiability ? (bal > 0 ? "text-destructive" : "") : bal < 0 ? "text-destructive" : "text-green-600"}`}>
                        {formatCurrency(bal)}
                      </p>
                      {isLiability && <p className="text-xs text-muted-foreground">owed</p>}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Link href={`/accounts/${acc.id}`}>
                        <Button variant="outline" size="sm" className="h-8">
                          <ScrollText className="mr-1 h-3.5 w-3.5" /> Statement
                        </Button>
                      </Link>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingAccount(acc); setShowAccountDialog(true); }} aria-label="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteAccount(acc.id)} aria-label="Delete">
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

      {/* Unlinked records */}
      {accounts.length > 0 && unlinked && unlinked.expenses + unlinked.incomes + unlinked.loan_entries > 0 && (
        <Card className="border-yellow-200 bg-yellow-50/40 dark:border-yellow-900 dark:bg-yellow-950/10">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4 text-yellow-600" /> Not linked to any account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {[
                unlinked.expenses > 0 && `${unlinked.expenses} expenses`,
                unlinked.incomes > 0 && `${unlinked.incomes} incomes`,
                unlinked.loan_entries > 0 && `${unlinked.loan_entries} People & Loans entries`,
              ].filter(Boolean).join(", ")}{" "}
              aren&apos;t counted in any account balance. Link them all to one account here, or set the account on each one
              when you edit it. Only records dated on or after an account&apos;s &quot;as of&quot; date change its balance.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <AccountSelect value={linkAccount} onChange={setLinkAccount} placeholder="Choose account" className="w-full sm:w-64" />
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">from</span>
                <Input type="date" value={linkFrom} onChange={(e) => setLinkFrom(e.target.value)} className="w-40" aria-label="Only records from this date" />
              </div>
              <Button onClick={handleLinkAll} disabled={!linkAccount || saving}>Link all</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transfers */}
      {accounts.length >= 2 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Transfers</CardTitle>
              <p className="text-xs text-muted-foreground">ATM withdrawals, credit card bill payments, moving money to savings: not spending, just moving.</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => openTransfer(null)}>
              <ArrowLeftRight className="mr-1 h-4 w-4" /> New Transfer
            </Button>
          </CardHeader>
          <CardContent>
            {transfers.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No transfers yet.</p>
            ) : (
              <div className="space-y-2">
                {transfers.slice(0, 20).map((t) => (
                  <div key={t.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                    <ArrowLeftRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {accountName(t.from_account_id)} → {accountName(t.to_account_id)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatDate(t.date)}{t.note && ` · ${t.note}`}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold">{formatCurrency(Number(t.amount))}</span>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openTransfer(t)} aria-label="Edit transfer">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteTransfer(t)} aria-label="Delete transfer">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={showTransferDialog} onOpenChange={(o) => { setShowTransferDialog(o); if (!o) setEditingTransfer(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTransfer ? "Edit Transfer" : "New Transfer"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveTransfer} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>From</Label>
                <AccountSelect value={tFrom} onChange={setTFrom} placeholder="Choose account" />
              </div>
              <div className="space-y-2">
                <Label>To</Label>
                <AccountSelect value={tTo} onChange={setTTo} placeholder="Choose account" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tr-amount">Amount</Label>
                <Input id="tr-amount" name="amount" type="number" min="1" step="0.01" required defaultValue={editingTransfer?.amount ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tr-date">Date</Label>
                <Input id="tr-date" name="date" type="date" defaultValue={editingTransfer?.date || toLocalDateString()} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tr-note">Note (optional)</Label>
              <Input id="tr-note" name="note" defaultValue={editingTransfer?.note || ""} placeholder="e.g. ATM withdrawal, card bill" />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editingTransfer ? "Update" : "Save Transfer"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

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
          <Dialog open={showDebtDialog} onOpenChange={(o) => { setShowDebtDialog(o); if (o) setDebtLink(editingDebt ? editingDebt.account_id : undefined); else setEditingDebt(null); }}>
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
                {liabilityAccounts.length > 0 && (
                  <div className="space-y-2">
                    <Label>Same as account</Label>
                    <Select value={debtLink ?? "none"} onValueChange={(v) => setDebtLink(!v || v === "none" ? null : (v as string))}>
                      <SelectTrigger className="w-full">
                        <SelectValue>{(v: string) => liabilityAccounts.find((a) => a.id === v)?.name ?? "Not in Accounts"}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not in Accounts</SelectItem>
                        {liabilityAccounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.name} ({ACCOUNT_TYPE_LABELS[a.type]})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      If this card or loan is also an account, link it so it&apos;s counted once. Its balance then comes from the account.
                    </p>
                  </div>
                )}
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
                const linked = linkedAccount(debt);
                const balance = debtBalance(debt);
                const paidOff = Number(debt.original_amount) - balance;
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
                        {linked && (
                          <p className="text-xs text-muted-foreground">Same as account {linked.name}: balance from the account, counted once</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold text-destructive">{formatCurrency(balance)}</p>
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
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingDebt(debt); setDebtLink(debt.account_id); setShowDebtDialog(true); }}>
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
