"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Wallet,
  IndianRupee,
  TrendingUp,
  PiggyBank,
  Percent,
  CalendarDays,
  Trophy,
  Flame,
  Leaf,
  Repeat,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import {
  type Expense,
  type Income,
  CATEGORY_COLORS,
  SAVINGS_CATEGORIES,
  outOfPocket,
} from "@/types";
import { cn, formatCurrency, formatDate, toLocalDateString } from "@/lib/utils";
import { toast } from "sonner";

type Mode = "calendar" | "fy";

/** Period covered by a "year": Jan–Dec, or Indian financial year Apr–Mar starting in `year`. */
function period(year: number, mode: Mode) {
  const startMonth = mode === "fy" ? 3 : 0; // 0-based
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(year, startMonth + i, 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString("en-IN", { month: "short", ...(mode === "fy" ? { year: "2-digit" as const } : {}) }),
    };
  });
  return {
    label: mode === "fy" ? `FY ${year}-${String(year + 1).slice(2)}` : String(year),
    from: `${months[0].key}-01`,
    to: toLocalDateString(new Date(year, startMonth + 12, 0)),
    months,
  };
}

function pctChange(now: number, before: number) {
  return before > 0 ? ((now - before) / before) * 100 : null;
}

function Change({ value, goodWhenUp }: { value: number | null; goodWhenUp: boolean }) {
  if (value === null || !isFinite(value)) return <span className="text-xs text-muted-foreground">no data for last year</span>;
  const up = value >= 0;
  const good = up === goodWhenUp;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs", good ? "text-green-600" : "text-destructive")}>
      <Icon className="h-3 w-3" />
      {Math.abs(value).toFixed(0)}% vs last year
    </span>
  );
}

export default function YearlyPage() {
  const now = new Date();
  const [mode, setMode] = useState<Mode>("calendar");
  const currentFyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const [year, setYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [prevExpenses, setPrevExpenses] = useState<Expense[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [prevIncomes, setPrevIncomes] = useState<Income[]>([]);

  const cur = period(year, mode);
  const prev = period(year - 1, mode);
  const latestYear = mode === "fy" ? currentFyStart : now.getFullYear();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [e1, e0, i1, i0] = await Promise.all([
        fetch(`/api/expenses?from=${cur.from}&to=${cur.to}&limit=10000`),
        fetch(`/api/expenses?from=${prev.from}&to=${prev.to}&limit=10000`),
        fetch(`/api/incomes?from=${cur.from}&to=${cur.to}`),
        fetch(`/api/incomes?from=${prev.from}&to=${prev.to}`),
      ]);
      const [j1, j0, k1, k0] = await Promise.all([e1.json(), e0.json(), i1.json(), i0.json()]);
      setExpenses(j1.data || []);
      setPrevExpenses(j0.data || []);
      setIncomes(k1.data || []);
      setPrevIncomes(k0.data || []);
    } catch {
      toast.error("Failed to load yearly data");
    } finally {
      setLoading(false);
    }
  }, [cur.from, cur.to, prev.from, prev.to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function switchMode(m: Mode) {
    setMode(m);
    setYear(m === "fy" ? currentFyStart : now.getFullYear());
  }

  // ---- Aggregates ----
  const sumSpent = (list: Expense[]) => list.reduce((s, e) => s + outOfPocket(e), 0);
  const sumInvested = (list: Expense[]) =>
    list.filter((e) => SAVINGS_CATEGORIES.includes(e.category)).reduce((s, e) => s + Number(e.amount), 0);
  const sumIncome = (list: Income[]) => list.reduce((s, i) => s + Number(i.amount), 0);

  const earned = sumIncome(incomes);
  const spent = sumSpent(expenses);
  const invested = sumInvested(expenses);
  const saved = earned - spent;
  const savingsRate = earned > 0 ? (saved / earned) * 100 : 0;
  const prevEarned = sumIncome(prevIncomes);
  const prevSpent = sumSpent(prevExpenses);
  const prevSaved = prevEarned - prevSpent;
  const pendingIncome = incomes.filter((i) => !i.is_received).reduce((s, i) => s + Number(i.amount), 0);

  const monthRows = cur.months.map((m) => {
    const e = expenses.filter((x) => x.date.startsWith(m.key));
    const inc = incomes.filter((x) => x.for_month.startsWith(m.key));
    const mEarned = sumIncome(inc);
    const mSpent = sumSpent(e);
    return {
      ...m,
      earned: Math.round(mEarned),
      spent: Math.round(mSpent),
      invested: Math.round(sumInvested(e)),
      saved: Math.round(mEarned - mSpent),
      rate: mEarned > 0 ? ((mEarned - mSpent) / mEarned) * 100 : null,
      count: e.length,
    };
  });
  const spendMonths = monthRows.filter((m) => m.spent > 0);
  const avgMonthlySpend = spendMonths.length ? spent / spendMonths.length : 0;

  // Category comparison
  const byCat = (list: Expense[]) => {
    const map: Record<string, number> = {};
    for (const e of list) {
      const own = outOfPocket(e);
      if (own > 0) map[e.category] = (map[e.category] || 0) + own;
    }
    return map;
  };
  const catNow = byCat(expenses);
  const catPrev = byCat(prevExpenses);
  const categories = Object.entries(catNow)
    .map(([name, value]) => ({ name, value, prev: catPrev[name] || 0, share: spent > 0 ? (value / spent) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);

  // Highlights
  const priciest = spendMonths.length ? spendMonths.reduce((a, b) => (b.spent > a.spent ? b : a)) : null;
  const cheapest = spendMonths.length ? spendMonths.reduce((a, b) => (b.spent < a.spent ? b : a)) : null;
  const topExpenses = [...expenses]
    .filter((e) => outOfPocket(e) > 0)
    .sort((a, b) => outOfPocket(b) - outOfPocket(a))
    .slice(0, 10);
  const frequent = Object.entries(
    expenses.reduce<Record<string, { count: number; total: number; label: string }>>((acc, e) => {
      const k = e.description.trim().toLowerCase();
      acc[k] = acc[k] || { count: 0, total: 0, label: e.description.trim() };
      acc[k].count++;
      acc[k].total += outOfPocket(e);
      return acc;
    }, {})
  )
    .map(([, v]) => v)
    .filter((v) => v.count >= 3)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Daily heatmap (spending, excl. rent lump sums which would flatten the scale)
  const daily: Record<string, number> = {};
  for (const e of expenses) {
    if (e.category === "Rent") continue;
    const own = outOfPocket(e);
    if (own > 0) daily[e.date] = (daily[e.date] || 0) + own;
  }
  const todayStr = toLocalDateString();
  const lastDay = cur.to < todayStr ? cur.to : todayStr;
  const [fy, fm, fd] = cur.from.split("-").map(Number);
  const start = new Date(fy, fm - 1, fd);
  const gridStart = new Date(start);
  gridStart.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // back to Monday
  const weeks: { date: string; amount: number; inRange: boolean }[][] = [];
  for (let d = new Date(gridStart); toLocalDateString(d) <= cur.to; ) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const ds = toLocalDateString(d);
      week.push({ date: ds, amount: daily[ds] || 0, inRange: ds >= cur.from && ds <= cur.to });
      d.setDate(d.getDate() + 1);
    }
    weeks.push(week);
  }
  const dayValues = Object.values(daily).sort((a, b) => a - b);
  const q = (p: number) => dayValues[Math.floor((dayValues.length - 1) * p)] || 0;
  const thresholds = [q(0.25), q(0.5), q(0.75), q(0.9)];
  const level = (v: number) => (v <= 0 ? 0 : 1 + thresholds.filter((t) => v > t).length);
  const pastDays = Object.keys(daily).length;
  const elapsedDays =
    cur.from > todayStr ? 0 : Math.round((new Date(lastDay).getTime() - new Date(cur.from).getTime()) / 86_400_000) + 1;
  const noSpendDays = Math.max(0, elapsedDays - pastDays);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Yearly Overview</h1>
          <p className="text-muted-foreground">How {cur.label} went, month by month</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border p-0.5">
            {(["calendar", "fy"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                  mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {m === "calendar" ? "Calendar year" : "Financial year"}
              </button>
            ))}
          </div>
          <Button variant="outline" size="icon" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="w-24 text-center text-sm font-semibold">{cur.label}</span>
          <Button variant="outline" size="icon" onClick={() => setYear((y) => y + 1)} disabled={year >= latestYear} aria-label="Next year">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {[
              { title: "Earned", value: formatCurrency(earned), icon: Wallet, tone: "text-green-600",
                sub: pendingIncome > 0 ? <span className="text-xs text-yellow-600">{formatCurrency(pendingIncome)} not received yet</span> : <Change value={pctChange(earned, prevEarned)} goodWhenUp /> },
              { title: "Spent", value: formatCurrency(spent), icon: IndianRupee, tone: "",
                sub: <Change value={pctChange(spent, prevSpent)} goodWhenUp={false} /> },
              { title: "Invested", value: formatCurrency(invested), icon: TrendingUp, tone: "text-emerald-600",
                sub: <span className="text-xs text-muted-foreground">SIPs, stocks & deposits</span> },
              { title: "Saved", value: formatCurrency(saved), icon: PiggyBank, tone: saved >= 0 ? "text-green-600" : "text-destructive",
                sub: <Change value={prevSaved > 0 ? pctChange(saved, prevSaved) : null} goodWhenUp /> },
              { title: "Savings Rate", value: earned > 0 ? `${savingsRate.toFixed(0)}%` : "—", icon: Percent,
                tone: savingsRate >= 20 ? "text-green-600" : savingsRate >= 0 ? "text-yellow-600" : "text-destructive",
                sub: <span className="text-xs text-muted-foreground">aim for 20%+</span> },
              { title: "Avg / Month", value: formatCurrency(avgMonthlySpend), icon: CalendarDays, tone: "",
                sub: <span className="text-xs text-muted-foreground">spending, {spendMonths.length} months</span> },
            ].map((k) => (
              <Card key={k.title}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{k.title}</CardTitle>
                  <k.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className={cn("text-xl font-bold", k.tone)}>{k.value}</div>
                  {k.sub}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Monthly chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Income vs Spending</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={monthRows}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(v) => formatCurrency(Number(v))}
                    contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--card-foreground))" }}
                  />
                  <Legend />
                  <Bar dataKey="earned" name="Earned" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="spent" name="Spent" fill="#f97316" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="saved" name="Saved" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Month table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Month by Month</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 font-medium">Month</th>
                    <th className="py-2 text-right font-medium">Earned</th>
                    <th className="py-2 text-right font-medium">Spent</th>
                    <th className="py-2 text-right font-medium">Invested</th>
                    <th className="py-2 text-right font-medium">Saved</th>
                    <th className="py-2 text-right font-medium">Rate</th>
                    <th className="py-2 text-right font-medium">Txns</th>
                  </tr>
                </thead>
                <tbody>
                  {monthRows.map((m) => (
                    <tr key={m.key} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-2 font-medium">
                        {new Date(`${m.key}-01T00:00:00`).toLocaleString("en-IN", { month: "long", year: "numeric" })}
                      </td>
                      <td className="py-2 text-right text-green-600">{m.earned ? formatCurrency(m.earned) : "—"}</td>
                      <td className="py-2 text-right">{m.spent ? formatCurrency(m.spent) : "—"}</td>
                      <td className="py-2 text-right text-emerald-600">{m.invested ? formatCurrency(m.invested) : "—"}</td>
                      <td className={cn("py-2 text-right font-medium", m.saved < 0 ? "text-destructive" : m.saved > 0 ? "text-green-600" : "")}>
                        {m.earned || m.spent ? formatCurrency(m.saved) : "—"}
                      </td>
                      <td className="py-2 text-right text-muted-foreground">{m.rate === null ? "—" : `${m.rate.toFixed(0)}%`}</td>
                      <td className="py-2 text-right text-muted-foreground">{m.count || "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <td className="py-2">Total</td>
                    <td className="py-2 text-right text-green-600">{formatCurrency(earned)}</td>
                    <td className="py-2 text-right">{formatCurrency(spent)}</td>
                    <td className="py-2 text-right text-emerald-600">{formatCurrency(invested)}</td>
                    <td className={cn("py-2 text-right", saved < 0 ? "text-destructive" : "text-green-600")}>{formatCurrency(saved)}</td>
                    <td className="py-2 text-right">{earned > 0 ? `${savingsRate.toFixed(0)}%` : "—"}</td>
                    <td className="py-2 text-right">{expenses.length}</td>
                  </tr>
                </tfoot>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">
                Income counts in the month it was earned for. Spent excludes investments and company-reimbursable expenses.
              </p>
            </CardContent>
          </Card>

          {/* Heatmap */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Daily Spending</CardTitle>
              <span className="text-xs text-muted-foreground">
                {noSpendDays} no-spend days · rent not included
              </span>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <div className="flex gap-[3px]">
                {weeks.map((w, i) => (
                  <div key={i} className="flex flex-col gap-[3px]">
                    {w.map((d) => (
                      <div
                        key={d.date}
                        title={d.inRange ? `${formatDate(d.date)}: ${d.amount ? formatCurrency(d.amount) : "no spending"}` : undefined}
                        className={cn(
                          "h-3 w-3 rounded-[3px]",
                          !d.inRange || d.date > todayStr
                            ? "bg-transparent"
                            : ["bg-muted", "bg-orange-200 dark:bg-orange-950", "bg-orange-300 dark:bg-orange-800", "bg-orange-500 dark:bg-orange-600", "bg-orange-700 dark:bg-orange-400"][Math.min(level(d.amount), 4)]
                        )}
                      />
                    ))}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                Less
                {["bg-muted", "bg-orange-200 dark:bg-orange-950", "bg-orange-300 dark:bg-orange-800", "bg-orange-500 dark:bg-orange-600", "bg-orange-700 dark:bg-orange-400"].map((c) => (
                  <span key={c} className={cn("h-3 w-3 rounded-[3px]", c)} />
                ))}
                More
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Categories */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Where It Went</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {categories.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No spending in {cur.label}.</p>}
                {categories.map((c) => {
                  const change = pctChange(c.value, c.prev);
                  return (
                    <div key={c.name} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[c.name] || "#94a3b8" }} />
                          {c.name}
                        </span>
                        <span className="flex items-center gap-2">
                          {change !== null && (
                            <span className={cn("text-xs", change > 0 ? "text-destructive" : "text-green-600")}>
                              {change > 0 ? "+" : ""}{change.toFixed(0)}%
                            </span>
                          )}
                          <span className="font-medium">{formatCurrency(c.value)}</span>
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width: `${c.share}%`, backgroundColor: CATEGORY_COLORS[c.name] || "#94a3b8" }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Highlights */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Highlights</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {priciest && (
                  <div className="flex items-start gap-3 rounded-lg border p-3">
                    <Flame className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                    <p>Costliest month: <span className="font-medium">{priciest.label}</span> at {formatCurrency(priciest.spent)}</p>
                  </div>
                )}
                {cheapest && cheapest !== priciest && (
                  <div className="flex items-start gap-3 rounded-lg border p-3">
                    <Leaf className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                    <p>Leanest month: <span className="font-medium">{cheapest.label}</span> at {formatCurrency(cheapest.spent)}</p>
                  </div>
                )}
                {frequent.length > 0 && (
                  <div className="flex items-start gap-3 rounded-lg border p-3">
                    <Repeat className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                    <div className="space-y-1">
                      <p>Most frequent spends</p>
                      <div className="flex flex-wrap gap-1.5">
                        {frequent.map((f) => (
                          <Badge key={f.label} variant="secondary" className="text-xs">
                            {f.label} ×{f.count} · {formatCurrency(f.total)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-3 rounded-lg border p-3">
                  <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p>Biggest expenses</p>
                    {topExpenses.map((e) => (
                      <Link key={e.id} href={`/expenses?edit=${e.id}`} className="flex items-center justify-between gap-2 rounded px-1 text-xs hover:bg-muted">
                        <span className="truncate">{formatDate(e.date)} · {e.description}</span>
                        <span className="shrink-0 font-medium">{formatCurrency(outOfPocket(e))}</span>
                      </Link>
                    ))}
                    {topExpenses.length === 0 && <p className="text-xs text-muted-foreground">None yet.</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
