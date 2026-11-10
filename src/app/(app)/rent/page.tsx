"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  Home,
  Pencil,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  CalendarClock,
  FileText,
  Receipt,
  BellPlus,
  Trash2,
} from "lucide-react";
import {
  type Rental,
  type Expense,
  type Bill,
  HOUSING_CATEGORIES,
  CATEGORY_COLORS,
  outOfPocket,
} from "@/types";
import { AccountSelect, refreshAccounts, useAccounts } from "@/components/account-select";
import { formatCurrency, formatDate, toLocalDateString, daysUntil } from "@/lib/utils";
import { toast } from "sonner";
import { startLoad } from "@/lib/load";

/** Indian financial year (Apr–Mar) containing the given date. */
function financialYear(d: Date) {
  const startYear = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return {
    label: `FY ${startYear}-${String(startYear + 1).slice(2)}`,
    start: `${startYear}-04-01`,
    end: `${startYear + 1}-03-31`,
  };
}

function nextDueDate(dueDay: number, from = new Date()) {
  const clamp = (y: number, m: number) => Math.min(dueDay, new Date(y, m + 1, 0).getDate());
  let y = from.getFullYear();
  let m = from.getMonth();
  if (from.getDate() > clamp(y, m)) {
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return new Date(y, m, clamp(y, m));
}

export default function RentPage() {
  const [rental, setRental] = useState<Rental | null>(null);
  const [rentExpenses, setRentExpenses] = useState<Expense[]>([]);
  const [monthExpenses, setMonthExpenses] = useState<Expense[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logging, setLogging] = useState<string | null>(null);

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const monthLabel = now.toLocaleString("en-IN", { month: "long", year: "numeric" });
  const { defaultId } = useAccounts();
  const [payAccount, setPayAccount] = useState<string | null | undefined>(undefined);
  const rentBill = bills.find((b) => b.is_active && (b.category === "Rent" || /\brent\b/i.test(b.name)));
  const payAccountId = payAccount === undefined ? rentBill?.account_id ?? defaultId : payAccount;

  const fetchData = useCallback(async () => {
    const today = new Date();
    const month = today.getMonth() + 1;
    const year = today.getFullYear();
    try {
      const [rentalRes, rentRes, monthRes, billsRes] = await Promise.all([
        fetch("/api/rental"),
        fetch("/api/expenses?category=Rent&limit=500"),
        fetch(`/api/expenses?month=${month}&year=${year}&limit=1000`),
        fetch("/api/bills"),
      ]);
      const [rentalJson, rentJson, monthJson, billsJson] = await Promise.all([
        rentalRes.json(),
        rentRes.json(),
        monthRes.json(),
        billsRes.json(),
      ]);
      setRental(rentalJson.data || null);
      setRentExpenses(rentJson.data || []);
      setMonthExpenses(monthJson.data || []);
      setBills(billsJson.data || []);
    } catch {
      toast.error("Failed to load rent details");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { startLoad(fetchData); }, [fetchData]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const num = (k: string) => parseFloat(fd.get(k) as string) || 0;
    const body = {
      address: fd.get("address") || "",
      landlord_name: fd.get("landlord_name") || "",
      landlord_contact: fd.get("landlord_contact") || "",
      monthly_rent: num("monthly_rent"),
      maintenance_charges: num("maintenance_charges"),
      rent_due_day: Math.min(31, Math.max(1, parseInt(fd.get("rent_due_day") as string) || 1)),
      security_deposit: num("security_deposit"),
      lease_start: fd.get("lease_start") || null,
      lease_end: fd.get("lease_end") || null,
      annual_increment_pct: num("annual_increment_pct"),
      notice_period_days: parseInt(fd.get("notice_period_days") as string) || 30,
    };

    try {
      const res = await fetch("/api/rental", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      toast.success("Flat details saved");
      setShowDialog(false);
      fetchData();
      fetch("/api/net-worth", { method: "POST" });
    } catch {
      toast.error("Failed to save flat details");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!confirm("Remove your flat details? Rent payments you've logged stay in Expenses.")) return;
    try {
      const res = await fetch("/api/rental", { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Flat details removed");
      fetchData();
      fetch("/api/net-worth", { method: "POST" });
    } catch {
      toast.error("Failed to remove");
    }
  }

  async function logPayment(kind: "rent" | "maintenance") {
    if (!rental) return;
    setLogging(kind);
    const isRent = kind === "rent";
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: isRent ? Number(rental.monthly_rent) : Number(rental.maintenance_charges),
          description: `${isRent ? "Flat rent" : "Society maintenance"} - ${monthLabel}`,
          category: isRent ? "Rent" : "Home & Maintenance",
          date: toLocalDateString(),
          input_method: "manual",
          ai_categorized: false,
          account_id: payAccountId,
        }),
      });
      if (!res.ok) throw new Error();
      refreshAccounts();

      // Keep the Bills reminder in step: mark this month's rent bill paid (expense already added above).
      const monthEnd = toLocalDateString(new Date(year, month, 0));
      if (isRent && rentBill && rentBill.next_due_date <= monthEnd) {
        await fetch(`/api/bills/${rentBill.id}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount_paid: Number(rental.monthly_rent),
            paid_date: toLocalDateString(),
            status: rentBill.next_due_date < toLocalDateString() ? "late" : "paid",
            create_expense: false,
          }),
        });
      }
      toast.success(`${isRent ? "Rent" : "Maintenance"} for ${monthLabel} logged`);
      fetchData();
    } catch {
      toast.error("Failed to log payment");
    } finally {
      setLogging(null);
    }
  }

  async function addRentReminder() {
    if (!rental) return;
    try {
      const res = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Flat Rent",
          amount: Number(rental.monthly_rent),
          category: "Rent",
          frequency: "monthly",
          due_day: rental.rent_due_day,
          next_due_date: toLocalDateString(nextDueDate(rental.rent_due_day)),
          is_auto_pay: false,
          reminder_days_before: 3,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Rent reminder added to Bills");
      fetchData();
    } catch {
      toast.error("Failed to add reminder");
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const rentPaidThisMonth = rentExpenses
    .filter((e) => e.date.startsWith(monthPrefix))
    .reduce((s, e) => s + Number(e.amount), 0);
  const maintenancePaidThisMonth = monthExpenses.some(
    (e) => e.category === "Home & Maintenance" && /maintenance/i.test(e.description)
  );
  const isRentPaid = !!rental && Number(rental.monthly_rent) > 0 && rentPaidThisMonth >= Number(rental.monthly_rent);

  const monthlyHousing = rental ? Number(rental.monthly_rent) + Number(rental.maintenance_charges) : 0;
  const due = rental ? nextDueDate(rental.rent_due_day) : null;
  const daysToDue = due ? daysUntil(toLocalDateString(due)) : null;

  const totalOutOfPocket = monthExpenses.reduce((s, e) => s + outOfPocket(e), 0);
  const housingByCategory: Record<string, number> = {};
  for (const e of monthExpenses) {
    if (HOUSING_CATEGORIES.includes(e.category)) {
      housingByCategory[e.category] = (housingByCategory[e.category] || 0) + outOfPocket(e);
    }
  }
  const housingTotal = Object.values(housingByCategory).reduce((s, v) => s + v, 0);
  const housingShare = totalOutOfPocket > 0 ? (housingTotal / totalOutOfPocket) * 100 : 0;

  const fy = financialYear(now);
  const fyRent = rentExpenses.filter((e) => e.date >= fy.start && e.date <= fy.end);
  const fyRentTotal = fyRent.reduce((s, e) => s + Number(e.amount), 0);

  const leaseDays = rental?.lease_end ? daysUntil(rental.lease_end) : null;
  const leaseWarnWindow = (rental?.notice_period_days || 30) + 30;
  const rentAfterIncrement = rental
    ? Number(rental.monthly_rent) * (1 + Number(rental.annual_increment_pct) / 100)
    : 0;

  const hasRentBill = !!rentBill;

  // Last 12 months of rent, newest first, for the payment history strip.
  const history = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(year, month - 1 - i, 1);
    const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const paid = rentExpenses.filter((e) => e.date.startsWith(prefix)).reduce((s, e) => s + Number(e.amount), 0);
    return { prefix, label: d.toLocaleString("en-IN", { month: "short", year: "2-digit" }), paid };
  });

  const dialog = (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rental ? "Edit Flat Details" : "Set Up Your Flat"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="r-address">Flat / Address</Label>
            <Input id="r-address" name="address" defaultValue={rental?.address || ""} placeholder="e.g. 2BHK, Koramangala" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="r-rent">Monthly Rent</Label>
              <Input id="r-rent" name="monthly_rent" type="number" min="0" step="1" required defaultValue={rental?.monthly_rent || ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-maint">Maintenance / month</Label>
              <Input id="r-maint" name="maintenance_charges" type="number" min="0" step="1" defaultValue={rental?.maintenance_charges || 0} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="r-due">Rent Due Day</Label>
              <Input id="r-due" name="rent_due_day" type="number" min="1" max="31" defaultValue={rental?.rent_due_day || 5} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-deposit">Security Deposit</Label>
              <Input id="r-deposit" name="security_deposit" type="number" min="0" step="1" defaultValue={rental?.security_deposit || 0} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="r-start">Lease Start</Label>
              <Input id="r-start" name="lease_start" type="date" defaultValue={rental?.lease_start || ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-end">Lease End</Label>
              <Input id="r-end" name="lease_end" type="date" defaultValue={rental?.lease_end || ""} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="r-inc">Annual Increment (%)</Label>
              <Input id="r-inc" name="annual_increment_pct" type="number" min="0" max="100" step="0.5" defaultValue={rental?.annual_increment_pct || 5} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-notice">Notice Period (days)</Label>
              <Input id="r-notice" name="notice_period_days" type="number" min="0" defaultValue={rental?.notice_period_days || 30} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="r-landlord">Landlord Name</Label>
              <Input id="r-landlord" name="landlord_name" defaultValue={rental?.landlord_name || ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-contact">Landlord Phone / UPI</Label>
              <Input id="r-contact" name="landlord_contact" defaultValue={rental?.landlord_contact || ""} />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );

  if (!rental) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Rent & Home</h1>
          <p className="text-muted-foreground">Everything about your rented flat in one place</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <Home className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">
              Add your rent, maintenance, deposit and lease dates to get rent reminders,
              lease renewal alerts and a yearly rent total for your HRA claim.
            </p>
            <Button className="mt-4" onClick={() => setShowDialog(true)}>Set up your flat</Button>
          </CardContent>
        </Card>
        {dialog}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Rent & Home</h1>
          <p className="text-muted-foreground">{rental.address || "Your rented flat"}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowDialog(true)}>
            <Pencil className="mr-1 h-4 w-4" /> Edit
          </Button>
          <Button variant="ghost" className="text-destructive" onClick={handleRemove}>
            <Trash2 className="mr-1 h-4 w-4" /> Remove
          </Button>
        </div>
      </div>

      {/* Lease renewal warning */}
      {leaseDays !== null && leaseDays <= leaseWarnWindow && (
        <Card className={leaseDays < 0 ? "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20" : "border-yellow-200 bg-yellow-50/50 dark:border-yellow-900 dark:bg-yellow-950/20"}>
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${leaseDays < 0 ? "text-red-500" : "text-yellow-600"}`} />
            <div className="text-sm">
              <p className="font-medium">
                {leaseDays < 0
                  ? `Your lease ended ${Math.abs(leaseDays)} days ago`
                  : `Your lease ends in ${leaseDays} days (${formatDate(rental.lease_end!)})`}
              </p>
              <p className="text-muted-foreground">
                {leaseDays >= 0 && leaseDays <= rental.notice_period_days
                  ? "You're inside the notice period. Decide on renewal or moving out now. "
                  : `Notice period is ${rental.notice_period_days} days. `}
                {Number(rental.annual_increment_pct) > 0 &&
                  `On renewal, rent may go up ${rental.annual_increment_pct}% to about ${formatCurrency(rentAfterIncrement)}/month.`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Housing</CardTitle>
            <Home className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(monthlyHousing)}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(Number(rental.monthly_rent))} rent
              {Number(rental.maintenance_charges) > 0 && ` + ${formatCurrency(Number(rental.maintenance_charges))} maint.`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{monthLabel.split(" ")[0]} Rent</CardTitle>
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isRentPaid ? (
              <>
                <div className="flex items-center gap-2 text-2xl font-bold text-green-600">
                  <CheckCircle2 className="h-5 w-5" /> Paid
                </div>
                <p className="text-xs text-muted-foreground">{formatCurrency(rentPaidThisMonth)} logged</p>
              </>
            ) : (
              <>
                <div className={`text-2xl font-bold ${daysToDue !== null && now.getDate() > rental.rent_due_day ? "text-destructive" : ""}`}>
                  {now.getDate() > rental.rent_due_day ? "Overdue" : daysToDue === 0 ? "Due today" : `Due in ${daysToDue}d`}
                </div>
                <p className="text-xs text-muted-foreground">due on day {rental.rent_due_day} of each month</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Security Deposit</CardTitle>
            <KeyRound className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(Number(rental.security_deposit))}</div>
            <p className="text-xs text-muted-foreground">refundable, counted in net worth</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Rent Paid {fy.label}</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(fyRentTotal)}</div>
            <p className="text-xs text-muted-foreground">{fyRent.length} payments, for your HRA claim</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Quick actions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">This Month</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="shrink-0 text-muted-foreground">Pay from</span>
              <AccountSelect value={payAccountId} onChange={setPayAccount} placeholder="Not linked to an account" />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Rent: {formatCurrency(Number(rental.monthly_rent))}</p>
                <p className="text-xs text-muted-foreground">
                  {isRentPaid ? "Already logged for this month" : `Pay to ${rental.landlord_name || "landlord"}${rental.landlord_contact ? ` · ${rental.landlord_contact}` : ""}`}
                </p>
              </div>
              <Button size="sm" variant={isRentPaid ? "outline" : "default"} disabled={isRentPaid || logging !== null} onClick={() => logPayment("rent")}>
                {logging === "rent" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Receipt className="mr-1 h-3 w-3" />}
                {isRentPaid ? "Logged" : "Log as paid"}
              </Button>
            </div>
            {Number(rental.maintenance_charges) > 0 && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Maintenance: {formatCurrency(Number(rental.maintenance_charges))}</p>
                  <p className="text-xs text-muted-foreground">Society / building charges</p>
                </div>
                <Button size="sm" variant="outline" disabled={maintenancePaidThisMonth || logging !== null} onClick={() => logPayment("maintenance")}>
                  {logging === "maintenance" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Receipt className="mr-1 h-3 w-3" />}
                  {maintenancePaidThisMonth ? "Logged" : "Log as paid"}
                </Button>
              </div>
            )}
            {!hasRentBill && (
              <Button variant="ghost" size="sm" className="w-full" onClick={addRentReminder}>
                <BellPlus className="mr-1 h-4 w-4" /> Add monthly rent reminder to Bills
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Housing share */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cost of Living Here</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold">{formatCurrency(housingTotal)}</span>
              <span className="text-sm text-muted-foreground">
                {housingShare.toFixed(0)}% of {formatCurrency(totalOutOfPocket)} spent this month
              </span>
            </div>
            <Progress
              value={Math.min(housingShare, 100)}
              indicatorClassName={housingShare > 50 ? "bg-destructive" : housingShare > 40 ? "bg-yellow-500" : "bg-green-500"}
            />
            <div className="space-y-1.5">
              {HOUSING_CATEGORIES.map((cat) => (
                <div key={cat} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
                    <span>{cat}</span>
                  </div>
                  <span className="text-muted-foreground">{formatCurrency(housingByCategory[cat] || 0)}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Rent, maintenance, household help and utilities together. Keeping this under about 40% of your spending leaves room to save.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Rent history */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Rent History (last 12 months)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-12">
            {history.map((h) => (
              <div
                key={h.prefix}
                className={`rounded-lg border p-2 text-center ${h.paid > 0 ? "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20" : ""}`}
              >
                <p className="text-xs text-muted-foreground">{h.label}</p>
                <p className="text-sm font-medium">{h.paid > 0 ? formatCurrency(h.paid) : "—"}</p>
              </div>
            ))}
          </div>
          {rental.lease_start && (
            <p className="mt-3 text-xs text-muted-foreground">
              Lease started {formatDate(rental.lease_start)}
              {rental.lease_end && ` · ends ${formatDate(rental.lease_end)}`}
            </p>
          )}
        </CardContent>
      </Card>

      {fyRent.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" /> Rent Payments for HRA ({fy.label})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {fyRent.map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span>{formatDate(e.date)}</span>
                  <span className="text-muted-foreground truncate px-3">{e.description}</span>
                  <span className="font-medium">{formatCurrency(Number(e.amount))}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <Badge variant="secondary">Landlord: {rental.landlord_name || "not set"}</Badge>
              <span className="font-semibold">Total {formatCurrency(fyRentTotal)}</span>
            </div>
            {fyRentTotal > 100000 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Annual rent is over ₹1,00,000, so your employer will usually need your landlord&apos;s PAN for the HRA claim.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {dialog}
    </div>
  );
}
