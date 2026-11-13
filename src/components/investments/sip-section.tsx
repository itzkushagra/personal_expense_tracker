"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarClock, CheckCircle2, Loader2, Pause, Pencil, Play, Plus, Repeat, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AccountSelect, useAccounts } from "@/components/account-select";
import type { HoldingWithSummary, SipWithStatus } from "@/lib/investments";
import { unitsForAmount } from "@/lib/portfolio";
import { cn, formatCurrency, formatDate, formatPrice, toLocalDateString } from "@/lib/utils";

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Server returned ${res.status}`);
  return json;
}

const ordinal = (d: number) => {
  const s = d % 100 >= 11 && d % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[d % 10] ?? "th";
  return `${d}${s}`;
};

const STATE_LABEL: Record<SipWithStatus["status"]["state"], string> = {
  logged: "Logged",
  due: "Due",
  upcoming: "Upcoming",
  paused: "Paused",
  not_started: "Not started",
};

/** Monthly SIPs: what's due this month, logging an instalment, and managing the plans. */
export function SipSection({
  sips,
  holdings,
  onChanged,
}: {
  sips: SipWithStatus[];
  holdings: HoldingWithSummary[];
  onChanged: (message: string) => Promise<void> | void;
}) {
  const { accounts } = useAccounts();
  const [planDialog, setPlanDialog] = useState<{ editing: SipWithStatus | null } | null>(null);
  const [logDialog, setLogDialog] = useState<SipWithStatus | null>(null);
  const [planAccount, setPlanAccount] = useState<string | null>(null);
  const [logAccount, setLogAccount] = useState<string | null>(null);
  const [logAmount, setLogAmount] = useState("");
  const [logNav, setLogNav] = useState("");
  const [logFees, setLogFees] = useState("");
  const [saving, setSaving] = useState(false);
  const today = toLocalDateString();

  const active = sips.filter((s) => s.is_active);
  const monthlyTotal = active.reduce((s, x) => s + Number(x.amount), 0);
  const dueNow = sips.filter((s) => s.status.state === "due");
  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name;

  function openPlan(editing: SipWithStatus | null) {
    setPlanAccount(editing ? editing.account_id : null);
    setPlanDialog({ editing });
  }

  function openLog(sip: SipWithStatus) {
    setLogAccount(sip.account_id);
    setLogAmount(String(sip.amount));
    setLogNav("");
    setLogFees("");
    setLogDialog(sip);
  }

  async function savePlan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const editing = planDialog?.editing;
    const body = {
      ...(editing ? {} : { holding_id: fd.get("holding_id") }),
      amount: fd.get("amount"),
      day_of_month: Number(fd.get("day_of_month")),
      start_date: fd.get("start_date"),
      account_id: planAccount,
    };
    setSaving(true);
    try {
      await send(editing ? `/api/investments/sips/${editing.id}` : "/api/investments/sips", editing ? "PUT" : "POST", body);
      setPlanDialog(null);
      await onChanged(editing ? "SIP updated" : "SIP added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the SIP");
    } finally {
      setSaving(false);
    }
  }

  async function logInstalment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!logDialog) return;
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    try {
      await send(`/api/investments/${logDialog.holding_id}/transactions`, "POST", {
        type: "buy",
        sip_id: logDialog.id,
        date: fd.get("date"),
        amount: logAmount,
        price: logNav,
        fees: logFees || 0,
        account_id: logAccount,
        note: "SIP instalment",
      });
      setLogDialog(null);
      await onChanged("SIP instalment logged");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't log the instalment");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(sip: SipWithStatus) {
    try {
      await send(`/api/investments/sips/${sip.id}`, "PUT", { is_active: !sip.is_active });
      await onChanged(sip.is_active ? "SIP paused" : "SIP resumed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the SIP");
    }
  }

  async function remove(sip: SipWithStatus) {
    if (!confirm(`Stop tracking the ${formatCurrency(Number(sip.amount))} SIP in ${sip.holding_name}? Instalments already logged stay in the fund.`)) return;
    try {
      await send(`/api/investments/sips/${sip.id}`, "DELETE");
      await onChanged("SIP removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't remove the SIP");
    }
  }

  const units = unitsForAmount(Number(logAmount) || 0, Number(logNav) || 0, Number(logFees) || 0);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Repeat className="h-5 w-5" /> Monthly SIPs
          </CardTitle>
          {active.length > 0 && (
            <p className="mt-1 text-sm text-muted-foreground" data-testid="sip-total">
              {formatCurrency(monthlyTotal)} a month across {active.length} SIP{active.length === 1 ? "" : "s"}
              {dueNow.length > 0 && ` · ${dueNow.length} to log`}
            </p>
          )}
        </div>
        <Button size="sm" variant="outline" disabled={holdings.length === 0} onClick={() => openPlan(null)}>
          <Plus className="mr-1 h-4 w-4" /> Add SIP
        </Button>
      </CardHeader>
      <CardContent>
        {sips.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {holdings.length === 0
              ? "Add a fund first, then set up its monthly SIP."
              : "No SIPs yet. Add one for each fund you invest in every month."}
          </p>
        ) : (
          <ul className="divide-y">
            {sips.map((sip) => {
              const st = sip.status;
              return (
                <li key={sip.id} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid="sip">
                  <div className="min-w-0">
                    <p className="font-medium">{sip.holding_name || "Fund"}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(Number(sip.amount))} on the {ordinal(sip.day_of_month)}
                      {accountName(sip.account_id) ? ` · from ${accountName(sip.account_id)}` : ""}
                      {st.state === "logged" && st.logged
                        ? ` · ${st.logged.quantity.toLocaleString("en-IN", { maximumFractionDigits: 4 })} units at ${formatPrice(st.logged.price)}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={st.state === "due" ? "destructive" : "secondary"}
                      className={cn(st.state === "logged" && "text-green-700 dark:text-green-500")}
                    >
                      {st.state === "logged" ? <CheckCircle2 className="mr-1 h-3 w-3" /> : st.state === "due" || st.state === "upcoming" ? <CalendarClock className="mr-1 h-3 w-3" /> : null}
                      {STATE_LABEL[st.state]}
                      {(st.state === "due" || st.state === "upcoming") && ` ${formatDate(st.due_date)}`}
                    </Badge>
                    {(st.state === "due" || st.state === "upcoming") && (
                      <Button size="sm" onClick={() => openLog(sip)}>
                        Log {st.state === "due" ? "now" : "early"}
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={sip.is_active ? "Pause SIP" : "Resume SIP"} onClick={() => toggle(sip)}>
                      {sip.is_active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Edit SIP" onClick={() => openPlan(sip)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label="Remove SIP" onClick={() => remove(sip)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      {/* Add / edit SIP plan */}
      <Dialog open={!!planDialog} onOpenChange={(o) => !o && setPlanDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{planDialog?.editing ? "Edit SIP" : "Add SIP"}</DialogTitle>
            <DialogDescription>A fixed amount into one fund every month.</DialogDescription>
          </DialogHeader>
          {planDialog && (
            <form onSubmit={savePlan} className="space-y-4">
              {!planDialog.editing && (
                <div className="space-y-2">
                  <Label>Fund</Label>
                  <Select name="holding_id" defaultValue={holdings[0]?.id}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{(v: string) => holdings.find((h) => h.id === v)?.name ?? "Choose a fund"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {holdings.map((h) => (
                        <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="sip-amount">Amount (₹)</Label>
                  <Input id="sip-amount" name="amount" type="number" step="any" min="1" required defaultValue={planDialog.editing?.amount ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sip-day">Day of month</Label>
                  <Input id="sip-day" name="day_of_month" type="number" min="1" max="31" required defaultValue={planDialog.editing?.day_of_month ?? 5} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sip-start">Started on</Label>
                <Input id="sip-start" name="start_date" type="date" defaultValue={planDialog.editing?.start_date ?? today} />
              </div>
              <div className="space-y-2">
                <Label>Debited from</Label>
                <AccountSelect value={planAccount} onChange={setPlanAccount} placeholder="Not tracked" className="w-full" />
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {planDialog.editing ? "Save" : "Add SIP"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Log this month's instalment */}
      <Dialog open={!!logDialog} onOpenChange={(o) => !o && setLogDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log SIP: {logDialog?.holding_name}</DialogTitle>
            <DialogDescription>
              Enter the NAV it was bought at (on the fund&apos;s SMS / statement). Units are worked out from the amount.
            </DialogDescription>
          </DialogHeader>
          {logDialog && (
            <form onSubmit={logInstalment} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="log-date">Date</Label>
                  <Input
                    id="log-date"
                    name="date"
                    type="date"
                    required
                    max={today}
                    defaultValue={logDialog.status.due_date <= today ? logDialog.status.due_date : today}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="log-amount">Amount (₹)</Label>
                  <Input id="log-amount" type="number" step="any" min="1" required value={logAmount} onChange={(e) => setLogAmount(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="log-nav">NAV (₹ per unit)</Label>
                  <Input id="log-nav" type="number" step="any" min="0.0001" required value={logNav} onChange={(e) => setLogNav(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="log-fees">Stamp duty / charges</Label>
                  <Input id="log-fees" type="number" step="any" min="0" placeholder="0" value={logFees} onChange={(e) => setLogFees(e.target.value)} />
                </div>
              </div>
              <p className="text-sm text-muted-foreground" data-testid="sip-units">
                {units > 0 ? `${units.toLocaleString("en-IN", { maximumFractionDigits: 4 })} units` : "Enter the NAV to see the units"}
              </p>
              <div className="space-y-2">
                <Label>Debited from</Label>
                <AccountSelect value={logAccount} onChange={setLogAccount} placeholder="Not tracked" className="w-full" />
              </div>
              <Button type="submit" className="w-full" disabled={saving || units <= 0}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Log instalment
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
