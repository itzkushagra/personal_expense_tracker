"use client";

import { useEffect, useState, useCallback } from "react";
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
  Users,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  X,
} from "lucide-react";
import {
  type HeldFundWithBalance,
  type HeldFundRelation,
  HELD_FUND_RELATION_LABELS,
} from "@/types";
import { formatCurrency, formatDate, toLocalDateString, daysUntil } from "@/lib/utils";
import { toast } from "sonner";

export default function HeldMoneyPage() {
  const [funds, setFunds] = useState<HeldFundWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<HeldFundWithBalance | null>(null);
  const [saving, setSaving] = useState(false);
  const [entryFor, setEntryFor] = useState<{ id: string; type: "received" | "returned" } | null>(null);
  const [entryAmount, setEntryAmount] = useState("");
  const [entryNote, setEntryNote] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showSettled, setShowSettled] = useState(false);

  const fetchFunds = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/held-funds");
      const json = await res.json();
      setFunds(json.data || []);
    } catch {
      toast.error("Failed to load held money");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFunds(); }, [fetchFunds]);

  const active = funds.filter((f) => f.balance > 0);
  const settled = funds.filter((f) => f.balance <= 0);
  const totalHeld = active.reduce((s, f) => s + f.balance, 0);
  const overdue = active.filter((f) => f.expected_return_date && daysUntil(f.expected_return_date) < 0);
  const dueSoon = active.filter((f) => {
    if (!f.expected_return_date) return false;
    const d = daysUntil(f.expected_return_date);
    return d >= 0 && d <= 14;
  });
  const people = new Set(active.map((f) => f.person_name.trim().toLowerCase())).size;

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const base = {
      person_name: (fd.get("person_name") as string).trim(),
      relation: (fd.get("relation") as HeldFundRelation) || "friend",
      purpose: fd.get("purpose") || "",
      expected_return_date: fd.get("expected_return_date") || null,
    };

    try {
      const res = editing
        ? await fetch(`/api/held-funds/${editing.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...base, is_settled: editing.is_settled }),
          })
        : await fetch("/api/held-funds", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...base,
              amount: parseFloat(fd.get("amount") as string),
              date: fd.get("date") || toLocalDateString(),
            }),
          });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(editing ? "Updated" : `Recorded money from ${base.person_name}`);
      setShowDialog(false);
      setEditing(null);
      fetchFunds();
      fetch("/api/net-worth", { method: "POST" });
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
    try {
      const res = await fetch(`/api/held-funds/${entryFor.id}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: entryFor.type, amount, date: toLocalDateString(), note: entryNote }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const fund = funds.find((f) => f.id === entryFor.id);
      toast.success(
        entryFor.type === "returned"
          ? json.balance <= 0
            ? `All settled with ${fund?.person_name}`
            : `Returned ${formatCurrency(amount)} to ${fund?.person_name}`
          : `Received ${formatCurrency(amount)} more from ${fund?.person_name}`
      );
      setEntryFor(null);
      setEntryAmount("");
      setEntryNote("");
      fetchFunds();
      fetch("/api/net-worth", { method: "POST" });
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Failed to save");
    }
  }

  async function handleDeleteEntry(fundId: string, entryId: string) {
    if (!confirm("Delete this entry?")) return;
    try {
      const res = await fetch(`/api/held-funds/${fundId}/entries?entry_id=${entryId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Entry deleted");
      fetchFunds();
    } catch {
      toast.error("Failed to delete entry");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this record and its full history?")) return;
    try {
      await fetch(`/api/held-funds/${id}`, { method: "DELETE" });
      toast.success("Deleted");
      fetchFunds();
      fetch("/api/net-worth", { method: "POST" });
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

  function renderFund(fund: HeldFundWithBalance) {
    const returnedPct = fund.total_received > 0 ? (fund.total_returned / fund.total_received) * 100 : 0;
    const days = fund.expected_return_date ? daysUntil(fund.expected_return_date) : null;
    const isOpen = expanded === fund.id;

    return (
      <Card key={fund.id} className={fund.balance <= 0 ? "opacity-75" : undefined}>
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium">{fund.person_name}</p>
                <Badge variant="secondary" className="text-xs">{HELD_FUND_RELATION_LABELS[fund.relation]}</Badge>
              </div>
              {fund.purpose && <p className="truncate text-xs text-muted-foreground">{fund.purpose}</p>}
            </div>
            {fund.balance <= 0 ? (
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
            <span className="text-xl font-bold">{formatCurrency(fund.balance)}</span>
            <span className="text-sm text-muted-foreground">
              {formatCurrency(fund.total_returned)} of {formatCurrency(fund.total_received)} returned
            </span>
          </div>
          <Progress value={returnedPct} indicatorClassName="bg-green-500" />
          {fund.expected_return_date && fund.balance > 0 && (
            <p className="text-xs text-muted-foreground">Return by {formatDate(fund.expected_return_date)}</p>
          )}

          {entryFor?.id === fund.id ? (
            <div className="space-y-2 rounded-lg border p-2">
              <p className="text-xs font-medium">
                {entryFor.type === "returned" ? `Return money to ${fund.person_name}` : `Received more from ${fund.person_name}`}
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
                {entryFor.type === "returned" && (
                  <Button size="sm" variant="outline" className="h-8" onClick={() => setEntryAmount(String(fund.balance))}>
                    All
                  </Button>
                )}
              </div>
              <Input placeholder="Note (optional)" value={entryNote} onChange={(e) => setEntryNote(e.target.value)} className="h-8" />
              <div className="flex gap-2">
                <Button size="sm" className="h-8 flex-1" onClick={handleEntry}>Save</Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => { setEntryFor(null); setEntryAmount(""); setEntryNote(""); }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              {fund.balance > 0 && (
                <Button size="sm" className="h-8 flex-1" onClick={() => setEntryFor({ id: fund.id, type: "returned" })}>
                  <ArrowUpRight className="mr-1 h-3 w-3" /> Return
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-8 flex-1" onClick={() => setEntryFor({ id: fund.id, type: "received" })}>
                <ArrowDownLeft className="mr-1 h-3 w-3" /> Received more
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setExpanded(isOpen ? null : fund.id)} aria-label="Show history">
                {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(fund); setShowDialog(true); }} aria-label="Edit">
                <Pencil className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(fund.id)} aria-label="Delete">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}

          {isOpen && (
            <div className="space-y-1.5 border-t pt-3">
              {fund.entries.map((entry) => (
                <div key={entry.id} className="flex items-center gap-2 text-sm">
                  {entry.type === "received" ? (
                    <ArrowDownLeft className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                  ) : (
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-green-600" />
                  )}
                  <span className="text-muted-foreground">{formatDate(entry.date)}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{entry.note}</span>
                  <span className={entry.type === "received" ? "text-blue-600" : "text-green-600"}>
                    {entry.type === "received" ? "+" : "−"}{formatCurrency(Number(entry.amount))}
                  </span>
                  <button className="text-muted-foreground hover:text-destructive" onClick={() => handleDeleteEntry(fund.id, entry.id)} aria-label="Delete entry">
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
          <h1 className="text-2xl font-bold">Held Money</h1>
          <p className="text-muted-foreground">Money friends & family gave you to keep, which you return later</p>
        </div>
        <Dialog open={showDialog} onOpenChange={(o) => { setShowDialog(o); if (!o) setEditing(null); }}>
          <DialogTrigger render={<Button />}>
            <Plus className="mr-1 h-4 w-4" /> Record Money
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? `Edit: ${editing.person_name}` : "Money Received to Keep"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="hf-person">Who gave it?</Label>
                  <Input id="hf-person" name="person_name" required defaultValue={editing?.person_name || ""} placeholder="e.g. Rahul, Mom" />
                </div>
                <div className="space-y-2">
                  <Label>Relation</Label>
                  <Select name="relation" defaultValue={editing?.relation || "friend"}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(HELD_FUND_RELATION_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {!editing && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="hf-amount">Amount</Label>
                    <Input id="hf-amount" name="amount" type="number" min="1" step="1" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hf-date">Received On</Label>
                    <Input id="hf-date" name="date" type="date" defaultValue={toLocalDateString()} />
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="hf-purpose">Purpose / Note</Label>
                <Input id="hf-purpose" name="purpose" defaultValue={editing?.purpose || ""} placeholder="e.g. Keeping safe while abroad" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hf-return">Return By (optional)</Label>
                <Input id="hf-return" name="expected_return_date" type="date" defaultValue={editing?.expected_return_date || ""} />
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">You Currently Hold</CardTitle>
            <HandCoins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalHeld)}</div>
            <p className="text-xs text-muted-foreground">not yours, so don&apos;t spend it</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">People</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{people}</div>
            <p className="text-xs text-muted-foreground">{settled.length} settled in the past</p>
          </CardContent>
        </Card>
        <Card className={overdue.length > 0 ? "border-red-200 dark:border-red-900" : undefined}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Due to Return</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${overdue.length > 0 ? "text-destructive" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency([...overdue, ...dueSoon].reduce((s, f) => s + f.balance, 0))}
            </div>
            <p className={`text-xs ${overdue.length > 0 ? "text-destructive" : "text-muted-foreground"}`}>
              {overdue.length > 0 ? `${overdue.length} overdue` : "in the next 2 weeks"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-blue-200 bg-blue-50/40 dark:border-blue-900 dark:bg-blue-950/10">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Held money is not counted as an expense or as income. It is subtracted from your net worth until you
          return it, so your balance shows what&apos;s really yours. Tip: keep it in a separate savings account or
          sweep FD so you don&apos;t spend it by accident.
        </CardContent>
      </Card>

      {active.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">{active.map(renderFund)}</div>
      )}

      {funds.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <HandCoins className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">
              Nothing held right now. When a friend or family member gives you money to keep, record it here.
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
          {showSettled && <div className="grid gap-4 sm:grid-cols-2">{settled.map(renderFund)}</div>}
        </div>
      )}
    </div>
  );
}
