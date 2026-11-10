"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  CalendarClock,
  Bell,
  CheckCircle2,
  AlertTriangle,
  Clock,
  CreditCard,
  Repeat,
  Undo2,
  Wallet,
} from "lucide-react";
import {
  type Bill,
  type BillKind,
  type BillPayment,
  type Debt,
  EXPENSE_CATEGORIES,
  BILL_FREQUENCY_LABELS,
  BILL_KIND_LABELS,
} from "@/types";
import { emiSplit } from "@/lib/bill-payments";
import { AccountSelect, refreshAccounts, useAccounts } from "@/components/account-select";
import { formatCurrency, formatDate, toLocalDateString } from "@/lib/utils";
import { toast } from "sonner";
import { startLoad } from "@/lib/load";

export default function BillsPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Bill | null>(null);
  const [saving, setSaving] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState<Record<string, BillPayment[]>>({});
  const { defaultId, accounts } = useAccounts();
  // undefined = untouched: use the bill's account when editing, else the default account.
  const [billAccount, setBillAccount] = useState<string | null | undefined>(undefined);
  const billAccountId = billAccount === undefined ? (editing ? editing.account_id : defaultId) : billAccount;
  const [showHistory, setShowHistory] = useState<string | null>(null);
  const [debts, setDebts] = useState<Debt[]>([]);
  // Bill form: what kind of bill, and what a card/EMI bill pays off ("acc:<id>" or "debt:<id>").
  const [billKind, setBillKind] = useState<BillKind>("expense");
  const [payTarget, setPayTarget] = useState("");
  // Pay dialog (EMIs, and part payments of any bill)
  const [payBill, setPayBill] = useState<Bill | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payInterest, setPayInterest] = useState("");
  const [payFees, setPayFees] = useState("");
  const [payAccount, setPayAccount] = useState<string | null>(null);
  const [paySettles, setPaySettles] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  // One request id per payment attempt, kept until the server gives a definite answer, so a
  // retry after a dropped connection (or a double click) can't record the payment twice.
  const attemptKeys = useRef<Record<string, string>>({});

  const cardAccounts = accounts.filter((a) => a.type === "credit_card");
  const debtById = Object.fromEntries(debts.map((d) => [d.id, d]));
  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name;

  const fetchBills = useCallback(async () => {
    try {
      const [res, debtRes] = await Promise.all([fetch("/api/bills"), fetch("/api/debts")]);
      const [json, debtJson] = await Promise.all([res.json(), debtRes.json()]);
      setBills(json.data || []);
      setDebts(debtJson.data || []);
    } catch {
      toast.error("Failed to load bills");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { startLoad(fetchBills); }, [fetchBills]);

  /** Load the bill's kind fields into the form when it opens (blank for a new bill). */
  function syncKindFields(bill: Bill | null) {
    setBillKind(bill?.kind ?? "expense");
    setPayTarget(bill?.to_account_id ? `acc:${bill.to_account_id}` : bill?.debt_id ? `debt:${bill.debt_id}` : "");
  }

  const today = new Date();
  const todayStr = toLocalDateString(today);
  const upcomingBills = bills.filter((b) => {
    const due = new Date(b.next_due_date);
    const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff >= 0 && diff <= 7;
  });
  const overdueBills = bills.filter((b) => b.next_due_date < todayStr);
  const totalMonthly = bills
    .filter((b) => b.is_active)
    .reduce((s, b) => {
      const amt = Number(b.amount);
      switch (b.frequency) {
        case "weekly": return s + amt * 4.33;
        case "monthly": return s + amt;
        case "quarterly": return s + amt / 3;
        case "yearly": return s + amt / 12;
        default: return s + amt;
      }
    }, 0);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const dueDay = parseInt(fd.get("due_day") as string) || 1;
    const now = new Date();
    const nextDue = new Date(now.getFullYear(), now.getMonth(), dueDay);
    if (nextDue <= now) nextDue.setMonth(nextDue.getMonth() + 1);

    const body = {
      name: fd.get("name"),
      amount: parseFloat(fd.get("amount") as string),
      category: fd.get("category") || "Bills & Utilities",
      frequency: fd.get("frequency") || "monthly",
      due_day: dueDay,
      // toISOString() turned local midnight on the 15th into the 14th in IST.
      next_due_date: fd.get("next_due_date") || toLocalDateString(nextDue),
      is_auto_pay: fd.get("is_auto_pay") === "on",
      reminder_days_before: parseInt(fd.get("reminder_days_before") as string) || 3,
      account_id: billAccountId,
      kind: billKind,
      to_account_id: billKind === "credit_card" && payTarget.startsWith("acc:") ? payTarget.slice(4) : null,
      debt_id: billKind !== "expense" && payTarget.startsWith("debt:") ? payTarget.slice(5) : null,
    };

    try {
      const url = editing ? `/api/bills/${editing.id}` : "/api/bills";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      toast.success(editing ? "Bill updated" : "Bill added");
      setShowDialog(false);
      setBillAccount(undefined);
      setEditing(null);
      fetchBills();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Failed to save bill");
    } finally {
      setSaving(false);
    }
  }

  const remainingFor = (bill: Bill) => Math.max(0, Math.round((Number(bill.amount) - Number(bill.paid_toward_due || 0)) * 100) / 100);

  /** attempt: identifies this payment attempt; the same attempt always reuses its request id. */
  async function recordPayment(bill: Bill, attempt: string, extra: Record<string, unknown>) {
    if (payingId) return;
    setPayingId(bill.id);
    const key = (attemptKeys.current[attempt] ??= crypto.randomUUID());
    let definite = false;
    try {
      const res = await fetch(`/api/bills/${bill.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_paid: remainingFor(bill) || Number(bill.amount),
          paid_date: todayStr,
          status: bill.next_due_date < todayStr ? "late" : "paid",
          occurrence_date: bill.next_due_date,
          idempotency_key: key,
          ...extra,
        }),
      });
      definite = true;
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error);
      const plan = json.plan as { principal: number; interest: number; fees: number } | undefined;
      const settled = json.data?.settles_occurrence !== false;
      toast.success(
        json.replayed
          ? `That payment for ${bill.name} was already recorded`
          : !settled
            ? `Part payment of ${formatCurrency(Number(json.data?.amount_paid))} recorded for ${bill.name}`
            : bill.kind === "credit_card"
              ? `Paid ${bill.name}: card balance reduced, not counted as spending`
              : bill.kind === "loan_emi" && plan
                ? `Paid ${bill.name}: ${formatCurrency(plan.principal)} off the loan, ${formatCurrency(plan.interest + plan.fees)} interest & charges`
                : `Marked ${bill.name} as paid and added it to expenses`
      );
      setPayBill(null);
      fetchBills();
      refreshAccounts();
      if (showHistory === bill.id) setShowHistory(null);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Failed to record payment");
      if (definite) fetchBills();
    } finally {
      // A network failure leaves the key in place so retrying reuses it; any answer from the server clears it.
      if (definite) delete attemptKeys.current[attempt];
      setPayingId(null);
    }
  }

  function openPayDialog(bill: Bill, part: boolean) {
    const debt = bill.debt_id ? debtById[bill.debt_id] : undefined;
    const amount = part ? 0 : remainingFor(bill) || Number(bill.amount);
    setPayBill(bill);
    setPayAmount(part ? "" : String(amount));
    setPayInterest(bill.kind === "loan_emi" && debt && amount ? String(emiSplit(amount, debt).interest) : "0");
    setPayFees("0");
    setPayAccount(bill.account_id ?? defaultId);
    setPaySettles(!part);
    attemptKeys.current[`dialog:${bill.id}`] = crypto.randomUUID();
  }

  function handleMarkPaid(bill: Bill) {
    // EMIs confirm the principal / interest split first; other bills pay what's left in one click.
    if (bill.kind === "loan_emi") return openPayDialog(bill, false);
    return recordPayment(bill, `paid:${bill.id}:${bill.next_due_date}`, { settles: true });
  }

  async function handleShowHistory(billId: string) {
    if (showHistory === billId) {
      setShowHistory(null);
      return;
    }
    try {
      const res = await fetch(`/api/bills/${billId}/payments`);
      const json = await res.json();
      setPaymentHistory((prev) => ({ ...prev, [billId]: json.data || [] }));
      setShowHistory(billId);
    } catch {
      toast.error("Failed to load history");
    }
  }

  async function handleReversePayment(billId: string, paymentId: string) {
    const reason = window.prompt(
      "Reverse this payment? Its expense, card transfer and loan repayment are undone and the due date reopens. The payment stays in the history, marked reversed.\n\nReason (optional):",
      ""
    );
    if (reason === null) return;
    try {
      const qs = new URLSearchParams({ payment_id: paymentId, ...(reason.trim() ? { reason: reason.trim() } : {}) });
      const res = await fetch(`/api/bills/${billId}/payments?${qs}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error);
      refreshAccounts();
      fetchBills();
      setPaymentHistory((prev) => ({ ...prev, [billId]: (prev[billId] || []).map((p) => (p.id === paymentId ? json.data : p)) }));
      toast.success("Payment reversed");
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Failed to reverse payment");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this bill?")) return;
    try {
      const res = await fetch(`/api/bills/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Bill deleted");
      fetchBills();
    } catch {
      toast.error("Failed to delete");
    }
  }

  function getDaysUntilDue(dateStr: string) {
    return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bills & Subscriptions</h1>
          <p className="text-muted-foreground">Track recurring payments and due dates</p>
        </div>
        <Dialog open={showDialog} onOpenChange={(o) => { setShowDialog(o); if (o) syncKindFields(editing); else { setEditing(null); setBillAccount(undefined); } }}>
          <DialogTrigger render={<Button />}>
            <Plus className="mr-1 h-4 w-4" /> Add Bill
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Bill" : "Add Bill"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="bill-name">Bill Name</Label>
                <Input id="bill-name" name="name" required defaultValue={editing?.name || ""} placeholder="e.g. Netflix, Electricity, HDFC card" />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={billKind} onValueChange={(v) => { setBillKind((v as BillKind) || "expense"); setPayTarget(""); }}>
                  <SelectTrigger className="w-full"><SelectValue>{(v: string) => BILL_KIND_LABELS[v as BillKind] ?? v}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(BILL_KIND_LABELS) as [BillKind, string][]).map(([val, label]) => (
                      <SelectItem key={val} value={val}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {billKind === "credit_card" && (
                  <p className="text-xs text-muted-foreground">Paying it moves money to the card. Your card purchases are already expenses, so this isn&apos;t counted again.</p>
                )}
                {billKind === "loan_emi" && (
                  <p className="text-xs text-muted-foreground">Each payment reduces the loan by the principal; only the interest counts as spending.</p>
                )}
              </div>
              {billKind === "credit_card" && (
                <div className="space-y-2">
                  <Label>Card being paid</Label>
                  <Select value={payTarget} onValueChange={(v) => setPayTarget((v as string) || "")}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v: string) =>
                          v.startsWith("acc:") ? accountName(v.slice(4)) ?? "Card"
                            : v.startsWith("debt:") ? debtById[v.slice(5)]?.name ?? "Card"
                              : "Choose a card"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {cardAccounts.map((a) => (
                        <SelectItem key={a.id} value={`acc:${a.id}`}>{a.name} (account)</SelectItem>
                      ))}
                      {debts.filter((d) => d.type === "credit_card" && !d.account_id).map((d) => (
                        <SelectItem key={d.id} value={`debt:${d.id}`}>{d.name} (Debt Tracker)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {cardAccounts.length === 0 && debts.every((d) => d.type !== "credit_card") && (
                    <p className="text-xs text-destructive">Add the card under Accounts (type Credit Card) first.</p>
                  )}
                </div>
              )}
              {billKind === "loan_emi" && (
                <div className="space-y-2">
                  <Label>Loan</Label>
                  <Select value={payTarget} onValueChange={(v) => setPayTarget((v as string) || "")}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{(v: string) => (v.startsWith("debt:") ? debtById[v.slice(5)]?.name ?? "Loan" : "Choose a loan")}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {debts.filter((d) => d.type !== "credit_card").map((d) => (
                        <SelectItem key={d.id} value={`debt:${d.id}`}>
                          {d.name} · {formatCurrency(Number(d.current_balance))} at {Number(d.interest_rate)}%
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {debts.every((d) => d.type === "credit_card") && (
                    <p className="text-xs text-destructive">Add the loan in Accounts → Debt Tracker first.</p>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bill-amount">Amount</Label>
                  <Input id="bill-amount" name="amount" type="number" step="0.01" min="0" required defaultValue={editing?.amount || ""} />
                </div>
                <div className="space-y-2">
                  <Label>{billKind === "loan_emi" ? "Interest category" : "Category"}</Label>
                  <Select name="category" defaultValue={editing?.category || "Bills & Utilities"} disabled={billKind === "credit_card"}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Frequency</Label>
                  <Select name="frequency" defaultValue={editing?.frequency || "monthly"}>
                    <SelectTrigger><SelectValue>{(v: string) => (BILL_FREQUENCY_LABELS as Record<string, string>)[v] ?? v}</SelectValue></SelectTrigger>
                    <SelectContent>
                      {(Object.entries(BILL_FREQUENCY_LABELS) as [string, string][]).map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bill-due">Due Day</Label>
                  <Input id="bill-due" name="due_day" type="number" min="1" max="31" defaultValue={editing?.due_day || 1} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bill-next-due">Next Due Date</Label>
                  <Input id="bill-next-due" name="next_due_date" type="date" defaultValue={editing?.next_due_date || ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bill-reminder">Remind Days Before</Label>
                  <Input id="bill-reminder" name="reminder_days_before" type="number" min="0" max="30" defaultValue={editing?.reminder_days_before || 3} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="bill-auto" name="is_auto_pay" defaultChecked={editing?.is_auto_pay || false} className="rounded" />
                <Label htmlFor="bill-auto" className="text-sm">Auto-pay enabled</Label>
              </div>
              <div className="space-y-2">
                <Label>Pay from</Label>
                <AccountSelect value={billAccountId} onChange={setBillAccount} placeholder="Not linked to an account" />
                <p className="text-xs text-muted-foreground">
                  {billKind === "credit_card"
                    ? "The account you pay the card from."
                    : billKind === "loan_emi"
                      ? "The account the EMI is debited from."
                      : "Marking the bill paid records the expense against this account."}
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {editing ? "Update Bill" : "Add Bill"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!payBill} onOpenChange={(o) => { if (!o) setPayBill(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {payBill?.kind === "loan_emi" ? "Pay EMI" : "Part payment"}: {payBill?.name}
            </DialogTitle>
          </DialogHeader>
          {payBill && (() => {
            const isEmi = payBill.kind === "loan_emi";
            const amount = parseFloat(payAmount) || 0;
            const interest = isEmi ? parseFloat(payInterest) || 0 : 0;
            const fees = isEmi ? parseFloat(payFees) || 0 : 0;
            const principal = Math.round((amount - interest - fees) * 100) / 100;
            const debt = payBill.debt_id ? debtById[payBill.debt_id] : undefined;
            const remaining = remainingFor(payBill);
            const invalid = !(amount > 0) || interest < 0 || fees < 0 || principal < 0;
            return (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Due {formatDate(payBill.next_due_date)}: {formatCurrency(Number(payBill.amount))}
                  {Number(payBill.paid_toward_due) > 0 && <>, {formatCurrency(Number(payBill.paid_toward_due))} already paid, {formatCurrency(remaining)} left</>}
                </p>
                <div className={isEmi ? "grid grid-cols-3 gap-3" : "space-y-2"}>
                  <div className="space-y-2">
                    <Label htmlFor="pay-amount">Amount paid</Label>
                    <Input id="pay-amount" type="number" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} autoFocus />
                  </div>
                  {isEmi && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="pay-interest">Interest</Label>
                        <Input id="pay-interest" type="number" min="0" step="0.01" value={payInterest} onChange={(e) => setPayInterest(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pay-fees">Charges</Label>
                        <Input id="pay-fees" type="number" min="0" step="0.01" value={payFees} onChange={(e) => setPayFees(e.target.value)} />
                      </div>
                    </>
                  )}
                </div>
                {isEmi && (
                  <>
                    <p className={`text-sm ${principal < 0 ? "text-destructive" : ""}`}>
                      <span className="font-medium">{formatCurrency(principal)}</span> reduces the loan
                      {debt && principal >= 0 && <> (to {formatCurrency(Number(debt.current_balance) - principal)})</>};{" "}
                      <span className="font-medium">{formatCurrency(interest + fees)}</span> is recorded as interest &amp; charges.
                    </p>
                    {debt && (
                      <p className="text-xs text-muted-foreground">
                        Interest estimated as {formatCurrency(Number(debt.current_balance))} × {Number(debt.interest_rate)}% ÷ 12. Charges are late fees, GST and the like. Use your loan statement&apos;s figures if they differ.
                      </p>
                    )}
                  </>
                )}
                <div className="space-y-2">
                  <Label>Paid from</Label>
                  <AccountSelect value={payAccount} onChange={setPayAccount} placeholder="Not linked to an account" />
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-primary" checked={paySettles} onChange={(e) => setPaySettles(e.target.checked)} />
                  This completes the bill due {formatDate(payBill.next_due_date)}
                </label>
                <Button
                  className="w-full"
                  disabled={invalid || payingId !== null}
                  onClick={() =>
                    recordPayment(payBill, `dialog:${payBill.id}`, {
                      amount_paid: amount,
                      account_id: payAccount,
                      settles: paySettles,
                      ...(isEmi ? { interest_amount: interest, fees_amount: fees } : {}),
                    })
                  }
                >
                  {payingId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Record {formatCurrency(amount)}
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <CreditCard className="h-4 w-4" /> Monthly Commitment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalMonthly)}</div>
            <p className="text-xs text-muted-foreground">{bills.length} active bills</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Bell className="h-4 w-4" /> Due Soon
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{upcomingBills.length}</div>
            <p className="text-xs text-muted-foreground">within next 7 days</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <AlertTriangle className="h-4 w-4" /> Overdue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${overdueBills.length > 0 ? "text-destructive" : "text-green-600"}`}>
              {overdueBills.length}
            </div>
            <p className="text-xs text-muted-foreground">{overdueBills.length === 0 ? "all on track" : "need attention"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Bills List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Bills & Subscriptions</CardTitle>
        </CardHeader>
        <CardContent>
          {bills.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No bills tracked yet.</p>
          ) : (
            <div className="space-y-3">
              {bills.map((bill) => {
                const daysUntil = getDaysUntilDue(bill.next_due_date);
                const isOverdue = daysUntil < 0;
                const isDueSoon = daysUntil >= 0 && daysUntil <= bill.reminder_days_before;
                return (
                  <div key={bill.id} className="space-y-2">
                    <div className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${isOverdue ? "bg-red-100 dark:bg-red-900/30" : isDueSoon ? "bg-yellow-100 dark:bg-yellow-900/30" : "bg-muted"}`}>
                        {bill.frequency === "monthly" || bill.frequency === "weekly" ? (
                          <Repeat className={`h-5 w-5 ${isOverdue ? "text-red-500" : isDueSoon ? "text-yellow-600" : "text-muted-foreground"}`} />
                        ) : (
                          <CalendarClock className={`h-5 w-5 ${isOverdue ? "text-red-500" : isDueSoon ? "text-yellow-600" : "text-muted-foreground"}`} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{bill.name}</p>
                          {bill.is_auto_pay && <Badge variant="secondary" className="text-xs">Auto-pay</Badge>}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Badge variant="secondary" className="text-xs">
                            {bill.kind === "expense" ? bill.category : BILL_KIND_LABELS[bill.kind]}
                          </Badge>
                          <span>{BILL_FREQUENCY_LABELS[bill.frequency]}</span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-lg font-semibold">{formatCurrency(Number(bill.amount))}</p>
                        {Number(bill.paid_toward_due) > 0 && (
                          <p className="text-xs text-muted-foreground">{formatCurrency(Number(bill.paid_toward_due))} paid so far</p>
                        )}
                        <div className="flex items-center gap-1 text-xs">
                          {isOverdue ? (
                            <span className="flex items-center gap-1 text-destructive">
                              <AlertTriangle className="h-3 w-3" />
                              Overdue by {Math.abs(daysUntil)} days
                            </span>
                          ) : daysUntil === 0 ? (
                            <span className="flex items-center gap-1 text-yellow-600">
                              <Clock className="h-3 w-3" />
                              Due today
                            </span>
                          ) : isDueSoon ? (
                            <span className="flex items-center gap-1 text-yellow-600">
                              <Bell className="h-3 w-3" />
                              Due in {daysUntil} days
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              Due {formatDate(bill.next_due_date)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button variant="ghost" size="sm" className="h-8 gap-1" disabled={payingId === bill.id} onClick={() => handleMarkPaid(bill)}>
                          {payingId === bill.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Paid
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openPayDialog(bill, true)} aria-label="Part payment" title="Part payment">
                          <Wallet className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8" onClick={() => handleShowHistory(bill.id)}>
                          <Clock className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(bill); syncKindFields(bill); setShowDialog(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(bill.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {showHistory === bill.id && (
                      <div className="ml-12 rounded border bg-muted/30 p-3">
                        <p className="mb-2 text-sm font-medium">Payment History</p>
                        {(paymentHistory[bill.id] || []).length === 0 ? (
                          <p className="text-xs text-muted-foreground">No payments recorded yet.</p>
                        ) : (
                          <div className="space-y-1">
                            {(paymentHistory[bill.id] || []).map((p) => (
                              <div key={p.id} className={`flex items-center justify-between gap-2 text-sm ${p.reversed_at ? "text-muted-foreground" : ""}`}>
                                <span className={p.reversed_at ? "line-through" : ""}>
                                  {formatDate(p.paid_date)}
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    {p.occurrence_date && `for ${formatDate(p.occurrence_date)}${p.settles_occurrence ? "" : " (part)"} · `}
                                    {p.kind === "loan_emi"
                                      ? `principal ${formatCurrency(Number(p.principal_amount))} · interest ${formatCurrency(Number(p.interest_amount))}${Number(p.fees_amount) > 0 ? ` · charges ${formatCurrency(Number(p.fees_amount))}` : ""}`
                                      : p.kind === "credit_card"
                                        ? p.transfer_id || p.reversed_at ? "transferred to card" : "card balance reduced"
                                        : p.expense_id || p.reversed_at ? "added to expenses" : "logged elsewhere"}
                                  </span>
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className={p.reversed_at ? "line-through" : ""}>{formatCurrency(Number(p.amount_paid))}</span>
                                  {p.reversed_at ? (
                                    <Badge variant="outline" className="text-xs" title={p.reversal_reason || undefined}>
                                      Reversed {formatDate(p.reversed_at.slice(0, 10))}{p.reversal_reason ? `: ${p.reversal_reason}` : ""}
                                    </Badge>
                                  ) : (
                                    <>
                                      <Badge variant={p.status === "paid" ? "secondary" : "destructive"} className="text-xs">
                                        {p.status}
                                      </Badge>
                                      <button
                                        className="text-muted-foreground hover:text-destructive"
                                        onClick={() => handleReversePayment(bill.id, p.id)}
                                        aria-label="Reverse payment"
                                        title="Reverse payment"
                                      >
                                        <Undo2 className="h-3 w-3" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
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
