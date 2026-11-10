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
  Loader2,
  Plus,
  Trash2,
  Pencil,
  HandCoins,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  X,
} from "lucide-react";
import {
  type PersonLoanWithBalance,
  type PersonRelation,
  type LoanDirection,
  PERSON_RELATION_LABELS,
  LOAN_DIRECTION_LABELS,
  loanEntryTypes,
} from "@/types";
import { cn, formatCurrency, formatDate, toLocalDateString, daysUntil } from "@/lib/utils";
import { AccountSelect, refreshAccounts, useAccounts } from "@/components/account-select";
import { toast } from "sonner";

const DIRECTION_INFO: Record<
  LoanDirection,
  { hint: string; principal: string; repayment: string; addLabel: string; youOwe: boolean }
> = {
  holding: {
    hint: "They gave you money to keep safe. You'll give it back.",
    principal: "Received more",
    repayment: "Give back",
    addLabel: "Amount they gave you",
    youOwe: true,
  },
  borrowed: {
    hint: "They lent you money or helped you out, and you'll repay it.",
    principal: "Borrowed more",
    repayment: "Repay",
    addLabel: "Amount you borrowed",
    youOwe: true,
  },
  lent: {
    hint: "You lent them money. They'll pay you back.",
    principal: "Lent more",
    repayment: "Got paid back",
    addLabel: "Amount you lent",
    youOwe: false,
  },
};

export default function PeopleLoansPage() {
  const [loans, setLoans] = useState<PersonLoanWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<PersonLoanWithBalance | null>(null);
  const [newDirection, setNewDirection] = useState<LoanDirection>("borrowed");
  const [saving, setSaving] = useState(false);
  const [entryFor, setEntryFor] = useState<{ id: string; kind: "principal" | "repayment" } | null>(null);
  const [entryAmount, setEntryAmount] = useState("");
  const [entryNote, setEntryNote] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showSettled, setShowSettled] = useState(false);
  const [editEntry, setEditEntry] = useState<{ loanId: string; id: string; amount: string; date: string; note: string; account_id: string | null } | null>(null);
  const { defaultId } = useAccounts();
  const [newAccount, setNewAccount] = useState<string | null | undefined>(undefined);
  const [entryAccount, setEntryAccount] = useState<string | null | undefined>(undefined);
  const newAccountId = newAccount === undefined ? defaultId : newAccount;
  const entryAccountId = entryAccount === undefined ? defaultId : entryAccount;

  const fetchLoans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/people-loans");
      const json = await res.json();
      setLoans(json.data || []);
    } catch {
      toast.error("Failed to load records");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLoans(); }, [fetchLoans]);

  // Quick add (/people?new=1) opens the form straight away.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new")) {
      window.history.replaceState(null, "", "/people");
      setShowDialog(true);
    }
  }, []);

  const active = loans.filter((l) => l.balance > 0);
  const settled = loans.filter((l) => l.balance <= 0);
  const youOwe = active.filter((l) => DIRECTION_INFO[l.direction].youOwe);
  const owedToYou = active.filter((l) => !DIRECTION_INFO[l.direction].youOwe);
  const totalYouOwe = youOwe.reduce((s, l) => s + l.balance, 0);
  const totalOwedToYou = owedToYou.reduce((s, l) => s + l.balance, 0);
  const overdueYouOwe = youOwe.filter((l) => l.expected_return_date && daysUntil(l.expected_return_date) < 0);
  const overdueOwedToYou = owedToYou.filter((l) => l.expected_return_date && daysUntil(l.expected_return_date) < 0);

  function refreshAll() {
    fetchLoans();
    refreshAccounts();
    fetch("/api/net-worth", { method: "POST" });
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const base = {
      person_name: (fd.get("person_name") as string).trim(),
      relation: (fd.get("relation") as PersonRelation) || "friend",
      purpose: fd.get("purpose") || "",
      expected_return_date: fd.get("expected_return_date") || null,
    };

    try {
      const res = editing
        ? await fetch(`/api/people-loans/${editing.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(base),
          })
        : await fetch("/api/people-loans", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...base,
              direction: newDirection,
              account_id: newAccountId,
              amount: parseFloat(fd.get("amount") as string),
              date: fd.get("date") || toLocalDateString(),
            }),
          });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(editing ? "Updated" : `Saved: ${LOAN_DIRECTION_LABELS[newDirection].toLowerCase()} (${base.person_name})`);
      setShowDialog(false);
      setEditing(null);
      refreshAll();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleEntry() {
    if (!entryFor) return;
    const amount = parseFloat(entryAmount);
    if (!amount || amount <= 0) return;
    const loan = loans.find((l) => l.id === entryFor.id);
    if (!loan) return;
    try {
      const res = await fetch(`/api/people-loans/${entryFor.id}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: entryFor.kind, amount, date: toLocalDateString(), note: entryNote, account_id: entryAccountId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const info = DIRECTION_INFO[loan.direction];
      toast.success(
        entryFor.kind === "repayment" && json.balance <= 0
          ? `All settled with ${loan.person_name}`
          : `${entryFor.kind === "repayment" ? info.repayment : info.principal}: ${formatCurrency(amount)} (${loan.person_name})`
      );
      setEntryFor(null);
      setEntryAmount("");
      setEntryNote("");
      refreshAll();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Failed to save");
    }
  }

  async function handleUpdateEntry() {
    if (!editEntry) return;
    const amount = parseFloat(editEntry.amount);
    if (!amount || amount <= 0) return;
    try {
      const res = await fetch(`/api/people-loans/${editEntry.loanId}/entries`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entry_id: editEntry.id, amount, date: editEntry.date, note: editEntry.note, account_id: editEntry.account_id }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      toast.success("Entry updated");
      setEditEntry(null);
      refreshAll();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Failed to update entry");
    }
  }

  async function handleDeleteEntry(loanId: string, entryId: string) {
    if (!confirm("Delete this entry?")) return;
    try {
      const res = await fetch(`/api/people-loans/${loanId}/entries?entry_id=${entryId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Entry deleted");
      refreshAll();
    } catch {
      toast.error("Failed to delete entry");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this record and its full history?")) return;
    try {
      const res = await fetch(`/api/people-loans/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Deleted");
      refreshAll();
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

  function renderLoan(loan: PersonLoanWithBalance) {
    const info = DIRECTION_INFO[loan.direction];
    const { repayment } = loanEntryTypes(loan.direction);
    const repaidPct = loan.total_principal > 0 ? (loan.total_repaid / loan.total_principal) * 100 : 0;
    const days = loan.expected_return_date ? daysUntil(loan.expected_return_date) : null;
    const isOpen = expanded === loan.id;

    return (
      <Card key={loan.id} className={loan.balance <= 0 ? "opacity-75" : undefined}>
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-medium">{loan.person_name}</p>
                <Badge variant="secondary" className="text-xs">{PERSON_RELATION_LABELS[loan.relation]}</Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {LOAN_DIRECTION_LABELS[loan.direction]}
                {loan.purpose && ` · ${loan.purpose}`}
              </p>
            </div>
            {loan.balance <= 0 ? (
              <Badge variant="secondary" className="gap-1 text-xs text-green-600">
                <CheckCircle2 className="h-3 w-3" /> Settled
              </Badge>
            ) : days !== null && days < 0 ? (
              <Badge variant="destructive" className="text-xs">Overdue {Math.abs(days)}d</Badge>
            ) : days !== null && days <= 14 ? (
              <Badge variant="secondary" className="bg-yellow-500/20 text-xs text-yellow-700">Due in {days}d</Badge>
            ) : null}
          </div>

          <div className="flex items-baseline justify-between">
            <span className={cn("text-xl font-bold", info.youOwe ? "" : "text-blue-600")}>{formatCurrency(loan.balance)}</span>
            <span className="text-sm text-muted-foreground">
              {formatCurrency(loan.total_repaid)} of {formatCurrency(loan.total_principal)} {info.youOwe ? "returned" : "received back"}
            </span>
          </div>
          <Progress value={repaidPct} indicatorClassName="bg-green-500" />
          {loan.expected_return_date && loan.balance > 0 && (
            <p className="text-xs text-muted-foreground">
              {info.youOwe ? "Return by" : "Expected back by"} {formatDate(loan.expected_return_date)}
            </p>
          )}

          {entryFor?.id === loan.id ? (
            <div className="space-y-2 rounded-lg border p-2">
              <p className="text-xs font-medium">
                {entryFor.kind === "repayment" ? info.repayment : info.principal}: {loan.person_name}
              </p>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Amount"
                  value={entryAmount}
                  onChange={(e) => setEntryAmount(e.target.value)}
                  className="h-8"
                  autoFocus
                />
                {entryFor.kind === "repayment" && (
                  <Button size="sm" variant="outline" className="h-8" onClick={() => setEntryAmount(String(loan.balance))}>
                    All
                  </Button>
                )}
              </div>
              <Input placeholder="Note (optional)" value={entryNote} onChange={(e) => setEntryNote(e.target.value)} className="h-8" />
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {(entryFor.kind === "repayment" ? loanEntryTypes(loan.direction).repayment : loanEntryTypes(loan.direction).principal) === "in"
                    ? "Money came into"
                    : "Money went out of"}
                </p>
                <AccountSelect value={entryAccountId} onChange={setEntryAccount} className="h-8 w-full" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="h-8 flex-1" onClick={handleEntry}>Save</Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => { setEntryFor(null); setEntryAmount(""); setEntryNote(""); }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              {loan.balance > 0 && (
                <Button size="sm" className="h-8 flex-1" onClick={() => setEntryFor({ id: loan.id, kind: "repayment" })}>
                  {repayment === "in" ? <ArrowDownLeft className="mr-1 h-3 w-3" /> : <ArrowUpRight className="mr-1 h-3 w-3" />}
                  {info.repayment}
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-8 flex-1" onClick={() => setEntryFor({ id: loan.id, kind: "principal" })}>
                <Plus className="mr-1 h-3 w-3" /> {info.principal}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setExpanded(isOpen ? null : loan.id)} aria-label="Show history">
                {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(loan); setShowDialog(true); }} aria-label="Edit">
                <Pencil className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(loan.id)} aria-label="Delete">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}

          {isOpen && (
            <div className="space-y-1.5 border-t pt-3">
              {loan.entries.map((entry) => editEntry?.id === entry.id ? (
                <div key={entry.id} className="space-y-2 rounded-lg border p-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="number" className="h-8" value={editEntry.amount} onChange={(e) => setEditEntry({ ...editEntry, amount: e.target.value })} aria-label="Amount" />
                    <Input type="date" className="h-8" value={editEntry.date} onChange={(e) => setEditEntry({ ...editEntry, date: e.target.value })} aria-label="Date" />
                  </div>
                  <Input className="h-8" placeholder="Note" value={editEntry.note} onChange={(e) => setEditEntry({ ...editEntry, note: e.target.value })} />
                  <AccountSelect value={editEntry.account_id} onChange={(id) => setEditEntry({ ...editEntry, account_id: id })} className="h-8 w-full" />
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 flex-1" onClick={handleUpdateEntry}>Save</Button>
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditEntry(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div key={entry.id} className="flex items-center gap-2 text-sm">
                  {entry.type === "in" ? (
                    <ArrowDownLeft className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                  ) : (
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-orange-600" />
                  )}
                  <span className="text-muted-foreground">{formatDate(entry.date)}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {entry.type === "in" ? "to you" : "from you"}{entry.note && ` · ${entry.note}`}
                  </span>
                  <span className={entry.type === "in" ? "text-blue-600" : "text-orange-600"}>
                    {entry.type === "in" ? "+" : "−"}{formatCurrency(Number(entry.amount))}
                  </span>
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setEditEntry({ loanId: loan.id, id: entry.id, amount: String(entry.amount), date: entry.date, note: entry.note, account_id: entry.account_id })}
                    aria-label="Edit entry"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button className="text-muted-foreground hover:text-destructive" onClick={() => handleDeleteEntry(loan.id, entry.id)} aria-label="Delete entry">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">People & Loans</h1>
          <p className="text-muted-foreground">Money between you and friends or family that has to be paid back</p>
        </div>
        <Dialog open={showDialog} onOpenChange={(o) => { setShowDialog(o); if (!o) setEditing(null); }}>
          <DialogTrigger render={<Button />}>
            <Plus className="mr-1 h-4 w-4" /> New Record
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? `Edit: ${editing.person_name}` : "New Record"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-4">
              {!editing && (
                <div className="space-y-2">
                  <Label>What happened?</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(DIRECTION_INFO) as LoanDirection[]).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setNewDirection(d)}
                        className={cn(
                          "rounded-lg border p-2 text-center text-xs font-medium transition-colors",
                          newDirection === d ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
                        )}
                      >
                        {LOAN_DIRECTION_LABELS[d]}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {DIRECTION_INFO[newDirection].hint} If it&apos;s a gift you don&apos;t have to return,{" "}
                    <Link href="/income" className="underline">add it as income</Link> instead.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pl-person">Person</Label>
                  <Input id="pl-person" name="person_name" required defaultValue={editing?.person_name || ""} placeholder="e.g. Rahul, Mom" />
                </div>
                <div className="space-y-2">
                  <Label>Relation</Label>
                  <Select name="relation" defaultValue={editing?.relation || "friend"}>
                    <SelectTrigger><SelectValue>{(v: string) => (PERSON_RELATION_LABELS as Record<string, string>)[v] ?? v}</SelectValue></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PERSON_RELATION_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {!editing && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pl-amount">{DIRECTION_INFO[newDirection].addLabel}</Label>
                    <Input id="pl-amount" name="amount" type="number" min="1" step="1" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pl-date">Date</Label>
                    <Input id="pl-date" name="date" type="date" defaultValue={toLocalDateString()} />
                  </div>
                </div>
              )}
              {!editing && (
                <div className="space-y-2">
                  <Label>{loanEntryTypes(newDirection).principal === "in" ? "Money came into" : "Money went out of"}</Label>
                  <AccountSelect value={newAccountId} onChange={setNewAccount} placeholder="Not linked to an account" />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="pl-purpose">Purpose / Note</Label>
                <Input id="pl-purpose" name="purpose" defaultValue={editing?.purpose || ""} placeholder="e.g. Helped with deposit, keeping while abroad" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pl-return">
                  {(editing ? DIRECTION_INFO[editing.direction] : DIRECTION_INFO[newDirection]).youOwe ? "Return by" : "Expected back by"} (optional)
                </Label>
                <Input id="pl-return" name="expected_return_date" type="date" defaultValue={editing?.expected_return_date || ""} />
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {editing ? "Update" : "Save"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className={overdueYouOwe.length > 0 ? "border-red-200 dark:border-red-900" : undefined}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">You Owe</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalYouOwe)}</div>
            <p className={`text-xs ${overdueYouOwe.length > 0 ? "text-destructive" : "text-muted-foreground"}`}>
              {overdueYouOwe.length > 0 ? `${overdueYouOwe.length} overdue` : `to ${youOwe.length} ${youOwe.length === 1 ? "person" : "people"}`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Owed to You</CardTitle>
            <ArrowDownLeft className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{formatCurrency(totalOwedToYou)}</div>
            <p className={`text-xs ${overdueOwedToYou.length > 0 ? "text-yellow-600" : "text-muted-foreground"}`}>
              {overdueOwedToYou.length > 0 ? `${overdueOwedToYou.length} past the expected date` : `from ${owedToYou.length} ${owedToYou.length === 1 ? "person" : "people"}`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Position</CardTitle>
            {overdueYouOwe.length > 0 ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <HandCoins className="h-4 w-4 text-muted-foreground" />}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalOwedToYou - totalYouOwe >= 0 ? "text-green-600" : "text-destructive"}`}>
              {formatCurrency(totalOwedToYou - totalYouOwe)}
            </div>
            <p className="text-xs text-muted-foreground">{settled.length} settled in the past</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-blue-200 bg-blue-50/40 dark:border-blue-900 dark:bg-blue-950/10">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          None of this counts as spending or income. Money you owe is subtracted from your net worth, and money owed
          to you is added, so your net worth shows what&apos;s really yours. If someone pays back what they owe, use
          <span className="font-medium"> Got paid back</span> here. Don&apos;t add it as income.
        </CardContent>
      </Card>

      {youOwe.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">You owe</h2>
          <div className="grid gap-4 sm:grid-cols-2">{youOwe.map(renderLoan)}</div>
        </div>
      )}

      {owedToYou.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Owed to you</h2>
          <div className="grid gap-4 sm:grid-cols-2">{owedToYou.map(renderLoan)}</div>
        </div>
      )}

      {loans.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <HandCoins className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">
              Nothing here yet. Record money you&apos;re keeping for someone, money you borrowed, or money you lent.
            </p>
          </CardContent>
        </Card>
      )}

      {settled.length > 0 && (
        <div className="space-y-3">
          <Button variant="ghost" size="sm" onClick={() => setShowSettled(!showSettled)}>
            {showSettled ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
            Settled ({settled.length})
          </Button>
          {showSettled && <div className="grid gap-4 sm:grid-cols-2">{settled.map(renderLoan)}</div>}
        </div>
      )}
    </div>
  );
}
