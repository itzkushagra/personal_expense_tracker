"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  DollarSign,
} from "lucide-react";
import { type Expense, type Income, CATEGORY_COLORS, outOfPocket } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

type TimeRange = "3m" | "6m" | "1y" | "all";

export default function ReportsPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>("6m");

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const [res, incRes] = await Promise.all([fetch("/api/expenses?limit=5000"), fetch("/api/incomes")]);
      const [json, incJson] = await Promise.all([res.json(), incRes.json()]);
      setExpenses(json.data || []);
      setIncomes(incJson.data || []);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const now = new Date();
  const rangeMonths = timeRange === "3m" ? 3 : timeRange === "6m" ? 6 : timeRange === "1y" ? 12 : 120;
  const cutoffDate = new Date(now.getFullYear(), now.getMonth() - rangeMonths, 1);
  const filtered = expenses.filter((e) => new Date(e.date) >= cutoffDate);

  // Monthly spending trends
  const monthlyMap: Record<string, { total: number; income: number; count: number }> = {};
  for (const exp of filtered) {
    const d = new Date(exp.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthlyMap[key]) monthlyMap[key] = { total: 0, income: 0, count: 0 };
    monthlyMap[key].total += outOfPocket(exp);
    monthlyMap[key].count++;
  }
  for (const inc of incomes) {
    const d = new Date(inc.date);
    if (d < cutoffDate) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthlyMap[key]) monthlyMap[key] = { total: 0, income: 0, count: 0 };
    monthlyMap[key].income += Number(inc.amount);
  }
  const monthlyTrends = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month: new Date(month + "-01").toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
      spending: Math.round(data.total),
      income: data.income > 0 ? Math.round(data.income) : null,
      transactions: data.count,
    }));

  // Category breakdown
  const categoryMap: Record<string, number> = {};
  for (const exp of filtered) {
    categoryMap[exp.category] = (categoryMap[exp.category] || 0) + outOfPocket(exp);
  }
  const categoryData = Object.entries(categoryMap)
    .map(([name, value]) => ({ name, value: Math.round(value), color: CATEGORY_COLORS[name] || "#94a3b8" }))
    .sort((a, b) => b.value - a.value);
  const totalSpent = categoryData.reduce((s, c) => s + c.value, 0);

  // Monthly averages
  const monthCount = Math.max(1, monthlyTrends.length);
  const avgMonthly = totalSpent / monthCount;

  // Anomaly detection: flag months >50% above average
  const anomalies = monthlyTrends.filter((m) => m.spending > avgMonthly * 1.5);

  // Current vs previous month comparison
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;
  const currentMonthSpent = monthlyMap[currentMonthKey]?.total || 0;
  const prevMonthSpent = monthlyMap[prevMonthKey]?.total || 0;
  const monthChange = prevMonthSpent > 0 ? ((currentMonthSpent - prevMonthSpent) / prevMonthSpent) * 100 : 0;

  // Cash flow forecast (simple: average of last 3 months as projection)
  const last3 = monthlyTrends.slice(-3);
  const avgLast3 = last3.length > 0 ? last3.reduce((s, m) => s + m.spending, 0) / last3.length : 0;
  const forecastMonths = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    forecastMonths.push({
      month: d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
      spending: null as number | null,
      income: null as number | null,
      forecast: Math.round(avgLast3),
    });
  }
  const trendWithForecast = [
    ...monthlyTrends.map((m) => ({ ...m, forecast: null as number | null })),
    ...forecastMonths,
  ];

  // Top merchants/descriptions
  const descMap: Record<string, { count: number; total: number }> = {};
  for (const exp of filtered) {
    const desc = exp.description.toLowerCase().trim();
    if (!descMap[desc]) descMap[desc] = { count: 0, total: 0 };
    descMap[desc].count++;
    descMap[desc].total += outOfPocket(exp);
  }
  const topMerchants = Object.entries(descMap)
    .sort(([, a], [, b]) => b.total - a.total)
    .slice(0, 10)
    .map(([name, data]) => ({ name, ...data }));

  // Category month-over-month comparison
  const currentCatMap: Record<string, number> = {};
  const prevCatMap: Record<string, number> = {};
  for (const exp of expenses) {
    const d = new Date(exp.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (key === currentMonthKey) {
      currentCatMap[exp.category] = (currentCatMap[exp.category] || 0) + outOfPocket(exp);
    } else if (key === prevMonthKey) {
      prevCatMap[exp.category] = (prevCatMap[exp.category] || 0) + outOfPocket(exp);
    }
  }
  const catComparison = Object.keys({ ...currentCatMap, ...prevCatMap }).map((cat) => ({
    name: cat,
    current: Math.round(currentCatMap[cat] || 0),
    previous: Math.round(prevCatMap[cat] || 0),
  })).sort((a, b) => b.current - a.current);

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
          <h1 className="text-2xl font-bold">Reports & Insights</h1>
          <p className="text-muted-foreground">Understand your spending patterns</p>
        </div>
        <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="3m">Last 3 months</SelectItem>
            <SelectItem value="6m">Last 6 months</SelectItem>
            <SelectItem value="1y">Last year</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <DollarSign className="h-4 w-4" /> This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(currentMonthSpent)}</div>
            <div className={`flex items-center gap-1 text-xs ${monthChange > 0 ? "text-destructive" : "text-green-600"}`}>
              {monthChange > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(monthChange).toFixed(1)}% vs last month
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Average</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(avgMonthly)}</div>
            <p className="text-xs text-muted-foreground">over {monthCount} months</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total ({timeRange})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalSpent)}</div>
            <p className="text-xs text-muted-foreground">{filtered.length} transactions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <BarChart3 className="h-4 w-4" /> Forecast
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(avgLast3)}</div>
            <p className="text-xs text-muted-foreground">projected next month</p>
          </CardContent>
        </Card>
      </div>

      {/* Anomalies */}
      {anomalies.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50/50 dark:border-yellow-900 dark:bg-yellow-950/20">
          <CardContent className="flex items-start gap-3 pt-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-600" />
            <div>
              <p className="font-medium">Unusual spending detected</p>
              <p className="text-sm text-muted-foreground">
                {anomalies.map((a) => a.month).join(", ")} had spending 50%+ above your average of {formatCurrency(avgMonthly)}/month.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Spending Trends with Forecast */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Income vs Spending & Forecast</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendWithForecast}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => v !== null ? formatCurrency(Number(v)) : "—"} contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--card-foreground))" }} />
              <Legend />
              <Line type="monotone" dataKey="income" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} name="Income" />
              <Line type="monotone" dataKey="spending" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} name="Spending" />
              <Line type="monotone" dataKey="forecast" stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} connectNulls={false} name="Forecast" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Category Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Spending by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryData.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
                    {categoryData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--card-foreground))" }} />
                  <Legend formatter={(v) => <span className="text-xs">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Month-over-Month Category Comparison */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Category: This vs Last Month</CardTitle>
          </CardHeader>
          <CardContent>
            {catComparison.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={catComparison.slice(0, 6)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${v}`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--card-foreground))" }} />
                  <Legend />
                  <Bar dataKey="current" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="This Month" />
                  <Bar dataKey="previous" fill="hsl(var(--muted-foreground))" radius={[0, 4, 4, 0]} name="Last Month" opacity={0.5} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Merchants */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Spending Descriptions</CardTitle>
        </CardHeader>
        <CardContent>
          {topMerchants.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No data</p>
          ) : (
            <div className="space-y-2">
              {topMerchants.map((m, i) => (
                <div key={m.name} className="flex items-center gap-3 rounded-lg border p-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium capitalize">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.count} transactions</p>
                  </div>
                  <span className="shrink-0 font-semibold">{formatCurrency(m.total)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Annual Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{now.getFullYear()} Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {(() => {
              const yearExpenses = expenses.filter((e) => new Date(e.date).getFullYear() === now.getFullYear());
              const yearTotal = yearExpenses.reduce((s, e) => s + outOfPocket(e), 0);
              const yearMonths = new Set(yearExpenses.map((e) => new Date(e.date).getMonth())).size;
              const yearAvg = yearMonths > 0 ? yearTotal / yearMonths : 0;
              const topCat = Object.entries(
                yearExpenses.reduce<Record<string, number>>((acc, e) => {
                  acc[e.category] = (acc[e.category] || 0) + outOfPocket(e);
                  return acc;
                }, {})
              ).sort(([, a], [, b]) => b - a)[0];

              return (
                <>
                  <div>
                    <p className="text-sm text-muted-foreground">Year Total</p>
                    <p className="text-2xl font-bold">{formatCurrency(yearTotal)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Monthly Average</p>
                    <p className="text-2xl font-bold">{formatCurrency(yearAvg)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Top Category</p>
                    <p className="text-2xl font-bold">{topCat ? topCat[0] : "—"}</p>
                    {topCat && <p className="text-xs text-muted-foreground">{formatCurrency(topCat[1])}</p>}
                  </div>
                </>
              );
            })()}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
