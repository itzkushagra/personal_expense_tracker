"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  Briefcase,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Undo2,
  PlusCircle,
} from "lucide-react";
import {
  type Expense,
  type ReimbursementStatus,
  REIMBURSEMENT_STATUS_LABELS,
  CATEGORY_COLORS,
} from "@/types";
import { cn, formatCurrency, formatDate, toLocalDateString, daysUntil } from "@/lib/utils";
import { toast } from "sonner";

const TABS: ReimbursementStatus[] = ["pending", "submitted", "reimbursed", "rejected"];

export default function ReimbursementsPage() {
  const [claims, setClaims] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ReimbursementStatus>("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<ReimbursementStatus | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reimbursements");
      const json = await res.json();
      setClaims(json.data || []);
    } catch {
      toast.error("Failed to load reimbursements");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchClaims(); }, [fetchClaims]);

  const byStatus = (s: ReimbursementStatus) => claims.filter((c) => c.reimbursement_status === s);
  const sum = (list: Expense[], field: "amount" | "reimbursed_amount" = "amount") =>
    list.reduce((s, c) => s + Number(c[field]), 0);

  const pending = byStatus("pending");
  const submitted = byStatus("submitted");
  const reimbursed = byStatus("reimbursed");
  const thisYear = String(new Date().getFullYear());
  const receivedThisYear = reimbursed.filter((c) => (c.reimbursed_date || "").startsWith(thisYear));
  const shortfall = reimbursed.reduce((s, c) => s + Math.max(0, Number(c.amount) - Number(c.reimbursed_amount)), 0);
  // Expenses older than 30 days that still haven't been submitted risk missing the company's claim window.
  const stale = pending.filter((c) => daysUntil(c.date) < -30);

  const visible = byStatus(tab);
  const selectedClaims = visible.filter((c) => selected.has(c.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(selectedClaims.length === visible.length ? new Set() : new Set(visible.map((c) => c.id)));
  }

  async function applyStatus(status: ReimbursementStatus, extra: Record<string, unknown> = {}) {
    if (selectedClaims.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/reimbursements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedClaims.map((c) => c.id), status, ...extra }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${selectedClaims.length} claim${selectedClaims.length > 1 ? "s" : ""} marked ${REIMBURSEMENT_STATUS_LABELS[status].toLowerCase()}`);
      setSelected(new Set());
      setAction(null);
      fetchClaims();
      fetch("/api/net-worth", { method: "POST" });
    } catch {
      toast.error("Failed to update claims");
    } finally {
      setSaving(false);
    }
  }

  function handleDialogSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (action === "submitted") {
      const ref = (fd.get("claim_reference") as string).trim();
      applyStatus("submitted", ref ? { claim_reference: ref } : {});
    } else if (action === "reimbursed") {
      const amount = fd.get("reimbursed_amount") as string | null;
      applyStatus("reimbursed", {
        reimbursed_date: fd.get("reimbursed_date") || toLocalDateString(),
        ...(amount ? { reimbursed_amount: parseFloat(amount) } : {}),
      });
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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Reimbursements</h1>
          <p className="text-muted-foreground">Office expenses you paid for that your company will pay back</p>
        </div>
        <Link href="/expenses/add">
          <Button><PlusCircle className="mr-1 h-4 w-4" /> Add Expense</Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">To Submit</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(sum(pending))}</div>
            <p className={`text-xs ${stale.length > 0 ? "text-destructive" : "text-muted-foreground"}`}>
              {stale.length > 0 ? `${stale.length} older than 30 days` : `${pending.length} expenses`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Awaiting Payment</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{formatCurrency(sum(submitted))}</div>
            <p className="text-xs text-muted-foreground">{submitted.length} submitted claims</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Received {thisYear}</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(sum(receivedThisYear, "reimbursed_amount"))}</div>
            <p className="text-xs text-muted-foreground">{receivedThisYear.length} claims paid</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Out of Pocket</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{formatCurrency(shortfall + sum(byStatus("rejected")))}</div>
            <p className="text-xs text-muted-foreground">rejected or partly paid, counted as your spending</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <Button
                key={t}
                size="sm"
                variant={tab === t ? "default" : "outline"}
                onClick={() => { setTab(t); setSelected(new Set()); }}
              >
                {REIMBURSEMENT_STATUS_LABELS[t]}
                <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">{byStatus(t).length}</Badge>
              </Button>
            ))}
          </div>

          {visible.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={selectedClaims.length > 0 && selectedClaims.length === visible.length}
                  onChange={toggleAll}
                />
                {selectedClaims.length > 0
                  ? `${selectedClaims.length} selected · ${formatCurrency(sum(selectedClaims))}`
                  : "Select all"}
              </label>
              {selectedClaims.length > 0 && (
                <div className="ml-auto flex flex-wrap gap-2">
                  {tab === "pending" && (
                    <Button size="sm" onClick={() => setAction("submitted")} disabled={saving}>
                      <Send className="mr-1 h-3 w-3" /> Mark submitted
                    </Button>
                  )}
                  {(tab === "pending" || tab === "submitted") && (
                    <Button size="sm" variant={tab === "submitted" ? "default" : "outline"} onClick={() => setAction("reimbursed")} disabled={saving}>
                      <CheckCircle2 className="mr-1 h-3 w-3" /> Mark reimbursed
                    </Button>
                  )}
                  {tab === "submitted" && (
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => applyStatus("rejected")} disabled={saving}>
                      <XCircle className="mr-1 h-3 w-3" /> Rejected
                    </Button>
                  )}
                  {tab !== "pending" && (
                    <Button size="sm" variant="ghost" onClick={() => applyStatus("pending")} disabled={saving}>
                      <Undo2 className="mr-1 h-3 w-3" /> Back to “To Submit”
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {visible.length === 0 ? (
            <div className="py-10 text-center">
              <Briefcase className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">
                {tab === "pending"
                  ? "Nothing to submit. When adding an expense, tick “Company will reimburse this”."
                  : `No ${REIMBURSEMENT_STATUS_LABELS[tab].toLowerCase()} claims.`}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {visible.map((c) => (
                <label
                  key={c.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50",
                    selected.has(c.id) && "border-primary bg-primary/5"
                  )}
                >
                  <input type="checkbox" className="h-4 w-4 shrink-0 accent-primary" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                  <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[c.category] || "#94a3b8" }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.description}</p>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span>{formatDate(c.date)}</span>
                      <span>· {c.category}</span>
                      {c.claim_reference && <span>· Ref {c.claim_reference}</span>}
                      {c.reimbursed_date && <span>· Paid {formatDate(c.reimbursed_date)}</span>}
                      {tab === "pending" && daysUntil(c.date) < -30 && <span className="text-destructive">· {Math.abs(daysUntil(c.date))} days old</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold">{formatCurrency(Number(c.amount))}</p>
                    {c.reimbursement_status === "reimbursed" && Number(c.reimbursed_amount) < Number(c.amount) && (
                      <p className="text-xs text-destructive">got {formatCurrency(Number(c.reimbursed_amount))}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={action === "submitted" || action === "reimbursed"} onOpenChange={(o) => { if (!o) setAction(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === "submitted" ? "Mark as submitted" : "Mark as reimbursed"} ({selectedClaims.length}, {formatCurrency(sum(selectedClaims))})
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleDialogSubmit} className="space-y-4">
            {action === "submitted" ? (
              <div className="space-y-2">
                <Label htmlFor="rb-ref">Claim reference (optional)</Label>
                <Input id="rb-ref" name="claim_reference" placeholder="e.g. EXP-2026-114" />
                <p className="text-xs text-muted-foreground">Applied to every selected expense, so you can match the payout later.</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="rb-date">Received on</Label>
                  <Input id="rb-date" name="reimbursed_date" type="date" defaultValue={toLocalDateString()} />
                </div>
                {selectedClaims.length === 1 && (
                  <div className="space-y-2">
                    <Label htmlFor="rb-amount">Amount received</Label>
                    <Input
                      id="rb-amount"
                      name="reimbursed_amount"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={Number(selectedClaims[0].amount)}
                    />
                    <p className="text-xs text-muted-foreground">If the company paid less, the difference counts as your own spending.</p>
                  </div>
                )}
              </>
            )}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
