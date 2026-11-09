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
  CalendarClock,
  Bell,
  CheckCircle2,
  AlertTriangle,
  Clock,
  CreditCard,
  Repeat,
  X,
} from "lucide-react";
import {
  type Bill,
  type BillPayment,
  EXPENSE_CATEGORIES,
  BILL_FREQUENCY_LABELS,
} from "@/types";
import { formatCurrency, formatDate, toLocalDateString } from "@/lib/utils";
import { toast } from "sonner";

export default function BillsPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Bill | null>(null);
  const [saving, setSaving] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState<Record<string, BillPayment[]>>({});
  const [showHistory, setShowHistory] = useState<string | null>(null);

  const fetchBills = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/bills");
      const json = await res.json();
      setBills(json.data || []);
    } catch {
      toast.error("Failed to load bills");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBills(); }, [fetchBills]);

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
    let nextDue = new Date(now.getFullYear(), now.getMonth(), dueDay);
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
    };

    try {
      const url = editing ? `/api/bills/${editing.id}` : "/api/bills";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      toast.success(editing ? "Bill updated" : "Bill added");
      setShowDialog(false);
      setEditing(null);
      fetchBills();
    } catch {
      toast.error("Failed to save bill");
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkPaid(bill: Bill) {
    try {
      const res = await fetch(`/api/bills/${bill.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_paid: bill.amount,
          paid_date: todayStr,
          status: bill.next_due_date < todayStr ? "late" : "paid",
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Marked ${bill.name} as paid and added it to expenses`);
      fetchBills();
    } catch {
      toast.error("Failed to mark as paid");
    }
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

  async function handleDeletePayment(billId: string, paymentId: string) {
    if (!confirm("Delete this payment record? The matching expense stays in Expenses; delete it there if needed.")) return;
    try {
      const res = await fetch(`/api/bills/${billId}/payments?payment_id=${paymentId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setPaymentHistory((prev) => ({ ...prev, [billId]: (prev[billId] || []).filter((p) => p.id !== paymentId) }));
      toast.success("Payment record deleted");
    } catch {
      toast.error("Failed to delete payment");
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
        <Dialog open={showDialog} onOpenChange={(o) => { setShowDialog(o); if (!o) setEditing(null); }}>
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
                <Input id="bill-name" name="name" required defaultValue={editing?.name || ""} placeholder="e.g. Netflix, Electricity" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bill-amount">Amount</Label>
                  <Input id="bill-amount" name="amount" type="number" step="0.01" min="0" required defaultValue={editing?.amount || ""} />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select name="category" defaultValue={editing?.category || "Bills & Utilities"}>
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
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {editing ? "Update Bill" : "Add Bill"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

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
                          <Badge variant="secondary" className="text-xs">{bill.category}</Badge>
                          <span>{BILL_FREQUENCY_LABELS[bill.frequency]}</span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-lg font-semibold">{formatCurrency(Number(bill.amount))}</p>
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
                        <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => handleMarkPaid(bill)}>
                          <CheckCircle2 className="h-3.5 w-3.5" /> Paid
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8" onClick={() => handleShowHistory(bill.id)}>
                          <Clock className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(bill); setShowDialog(true); }}>
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
                              <div key={p.id} className="flex items-center justify-between text-sm">
                                <span>{formatDate(p.paid_date)}</span>
                                <div className="flex items-center gap-2">
                                  <span>{formatCurrency(Number(p.amount_paid))}</span>
                                  <Badge variant={p.status === "paid" ? "secondary" : "destructive"} className="text-xs">
                                    {p.status}
                                  </Badge>
                                  <button
                                    className="text-muted-foreground hover:text-destructive"
                                    onClick={() => handleDeletePayment(bill.id, p.id)}
                                    aria-label="Delete payment"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
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
