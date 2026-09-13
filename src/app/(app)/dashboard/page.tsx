"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { CategoryDonut } from "@/components/charts/category-donut";
import { DailyBar } from "@/components/charts/daily-bar";
import { TrendLine } from "@/components/charts/trend-line";
import { MonthlySummaryCard } from "@/components/dashboard/monthly-summary";
import { TipsCard } from "@/components/dashboard/tips-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  type Expense,
  type MonthlySummary,
  type DailySpending,
  type BudgetWithSpent,
  type Goal,
  type Bill,
  type Account,
  ACCOUNT_TYPE_COLORS,
  CATEGORY_COLORS,
} from "@/types";
import {
  Loader2,
  Landmark,
  PieChart,
  Target,
  CalendarClock,
  AlertTriangle,
  ArrowRight,
  Bell,
  Shield,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [trendData, setTrendData] = useState<{ month: string; total: number }[]>([]);
  const [budgets, setBudgets] = useState<BudgetWithSpent[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [expensesRes, summaryRes, budgetsRes, goalsRes, billsRes, accountsRes] = await Promise.all([
        fetch(`/api/expenses?month=${currentMonth}&year=${currentYear}&limit=1000`),
        fetch(`/api/summary?month=${currentMonth}&year=${currentYear}`),
        fetch("/api/budgets"),
        fetch("/api/goals"),
        fetch("/api/bills"),
        fetch("/api/accounts"),
      ]);

      const [expensesJson, summaryJson, budgetsJson, goalsJson, billsJson, accountsJson] = await Promise.all([
        expensesRes.json(),
        summaryRes.json(),
        budgetsRes.json(),
        goalsRes.json(),
        billsRes.json(),
        accountsRes.json(),
      ]);

      setExpenses(expensesJson.data || []);
      setSummary(summaryJson.data || null);
      setBudgets(budgetsJson.data || []);
      setGoals(goalsJson.data || []);
      setBills(billsJson.data || []);
      setAccounts(accountsJson.data || []);

      const trend: Record<string, number> = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date(currentYear, currentMonth - 1 - i, 1);
        const key = d.toLocaleString("en-IN", { month: "short", year: "2-digit" });
        trend[key] = 0;
      }

      const allExpRes = await fetch("/api/expenses?limit=5000");
      const allExpJson = await allExpRes.json();
      for (const exp of allExpJson.data || []) {
        const d = new Date(exp.date);
        const key = d.toLocaleString("en-IN", { month: "short", year: "2-digit" });
        if (key in trend) trend[key] += Number(exp.amount);
      }

      setTrendData(Object.entries(trend).map(([month, total]) => ({ month, total })));
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [currentMonth, currentYear]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalSpent = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const currentDay = Math.min(now.getDate(), daysInMonth);
  const dailyAverage = currentDay > 0 ? totalSpent / currentDay : 0;

  const categoryBreakdown: Record<string, number> = {};
  for (const e of expenses) {
    categoryBreakdown[e.category] = (categoryBreakdown[e.category] || 0) + Number(e.amount);
  }

  const dailyMap: Record<string, number> = {};
  for (const e of expenses) {
    dailyMap[e.date] = (dailyMap[e.date] || 0) + Number(e.amount);
  }
  const dailySpending: DailySpending[] = Object.entries(dailyMap)
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const prevMonthTotal = summary?.comparison?.prev_total ?? null;

  // Net worth
  const totalAssets = accounts.filter((a) => a.type !== "credit_card" && a.type !== "loan").reduce((s, a) => s + Number(a.balance), 0);
  const totalLiabilities = accounts.filter((a) => a.type === "credit_card" || a.type === "loan").reduce((s, a) => s + Math.abs(Number(a.balance)), 0);
  const netWorth = totalAssets - totalLiabilities;

  // Budget alerts
  const overBudget = budgets.filter((b) => b.percentage > 100);
  const nearLimit = budgets.filter((b) => b.percentage >= b.alert_threshold && b.percentage <= 100);
  const totalBudget = budgets.reduce((s, b) => s + Number(b.amount), 0);
  const totalBudgetSpent = budgets.reduce((s, b) => s + b.spent, 0);

  // Upcoming bills
  const todayStr = now.toISOString().split("T")[0];
  const upcomingBills = bills
    .filter((b) => {
      const diff = Math.ceil((new Date(b.next_due_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return diff >= 0 && diff <= 7;
    })
    .slice(0, 5);
  const overdueBills = bills.filter((b) => b.next_due_date < todayStr);

  // Goals
  const activeGoals = goals.filter((g) => !g.is_completed).slice(0, 4);
  const emergencyFund = goals.find((g) => g.priority === "emergency" && !g.is_completed);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          {now.toLocaleString("en-IN", { month: "long", year: "numeric" })} overview
        </p>
      </div>

      <SummaryCards
        totalSpent={totalSpent}
        transactionCount={expenses.length}
        dailyAverage={dailyAverage}
        prevMonthTotal={prevMonthTotal}
      />

      {/* Quick Overview Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Net Worth */}
        <Link href="/accounts">
          <Card className="cursor-pointer transition-colors hover:bg-muted/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Net Worth</CardTitle>
              <Landmark className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-xl font-bold ${netWorth >= 0 ? "text-green-600" : "text-destructive"}`}>
                {accounts.length > 0 ? formatCurrency(netWorth) : "—"}
              </div>
              <p className="text-xs text-muted-foreground">{accounts.length} accounts</p>
            </CardContent>
          </Card>
        </Link>

        {/* Budget Status */}
        <Link href="/budgets">
          <Card className="cursor-pointer transition-colors hover:bg-muted/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Budget Status</CardTitle>
              <PieChart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {budgets.length > 0 ? (
                <>
                  <div className="text-xl font-bold">
                    {formatCurrency(totalBudgetSpent)} <span className="text-sm font-normal text-muted-foreground">/ {formatCurrency(totalBudget)}</span>
                  </div>
                  {overBudget.length > 0 && (
                    <p className="text-xs text-destructive">{overBudget.length} over budget</p>
                  )}
                  {overBudget.length === 0 && nearLimit.length > 0 && (
                    <p className="text-xs text-yellow-600">{nearLimit.length} near limit</p>
                  )}
                  {overBudget.length === 0 && nearLimit.length === 0 && (
                    <p className="text-xs text-green-600">On track</p>
                  )}
                </>
              ) : (
                <>
                  <div className="text-xl font-bold">—</div>
                  <p className="text-xs text-muted-foreground">No budgets set</p>
                </>
              )}
            </CardContent>
          </Card>
        </Link>

        {/* Upcoming Bills */}
        <Link href="/bills">
          <Card className="cursor-pointer transition-colors hover:bg-muted/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Upcoming Bills</CardTitle>
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">{upcomingBills.length + overdueBills.length}</div>
              {overdueBills.length > 0 ? (
                <p className="text-xs text-destructive">{overdueBills.length} overdue</p>
              ) : (
                <p className="text-xs text-muted-foreground">due this week</p>
              )}
            </CardContent>
          </Card>
        </Link>

        {/* Goals Progress */}
        <Link href="/goals">
          <Card className="cursor-pointer transition-colors hover:bg-muted/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Goals Progress</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {activeGoals.length > 0 ? (
                <>
                  <div className="text-xl font-bold">{activeGoals.length} active</div>
                  <p className="text-xs text-muted-foreground">{goals.filter((g) => g.is_completed).length} completed</p>
                </>
              ) : (
                <>
                  <div className="text-xl font-bold">—</div>
                  <p className="text-xs text-muted-foreground">No goals set</p>
                </>
              )}
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Emergency Fund + Upcoming Bills Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Emergency Fund or Budget Alerts */}
        {emergencyFund ? (
          <Card className="border-red-200 bg-red-50/30 dark:border-red-900 dark:bg-red-950/10">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-4 w-4 text-red-500" />
                Emergency Fund
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold">{formatCurrency(Number(emergencyFund.current_amount))}</span>
                <span className="text-sm text-muted-foreground">/ {formatCurrency(Number(emergencyFund.target_amount))}</span>
              </div>
              <Progress
                value={(Number(emergencyFund.current_amount) / Number(emergencyFund.target_amount)) * 100}
                className="h-2"
                indicatorClassName="bg-red-500"
              />
            </CardContent>
          </Card>
        ) : overBudget.length > 0 ? (
          <Card className="border-yellow-200 bg-yellow-50/30 dark:border-yellow-900 dark:bg-yellow-950/10">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                Budget Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {overBudget.slice(0, 3).map((b) => (
                  <div key={b.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[b.category] }} />
                      <span>{b.category}</span>
                    </div>
                    <Badge variant="destructive" className="text-xs">
                      {formatCurrency(b.spent - Number(b.amount))} over
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <CategoryDonut data={categoryBreakdown} />
        )}

        {/* Upcoming Bills */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4" />
              Upcoming Bills
            </CardTitle>
            <Link href="/bills">
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                View all <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {[...overdueBills, ...upcomingBills].length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No upcoming bills this week</p>
            ) : (
              <div className="space-y-2">
                {overdueBills.slice(0, 2).map((bill) => (
                  <div key={bill.id} className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50/50 p-2.5 dark:border-red-900 dark:bg-red-950/20">
                    <div>
                      <p className="text-sm font-medium">{bill.name}</p>
                      <p className="text-xs text-destructive">Overdue</p>
                    </div>
                    <span className="font-semibold">{formatCurrency(Number(bill.amount))}</span>
                  </div>
                ))}
                {upcomingBills.map((bill) => {
                  const days = Math.ceil((new Date(bill.next_due_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                  return (
                    <div key={bill.id} className="flex items-center justify-between rounded-lg border p-2.5">
                      <div>
                        <p className="text-sm font-medium">{bill.name}</p>
                        <p className="text-xs text-muted-foreground">{days === 0 ? "Due today" : `In ${days} days`}</p>
                      </div>
                      <span className="font-semibold">{formatCurrency(Number(bill.amount))}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Goals Progress */}
      {activeGoals.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Goal Progress</CardTitle>
            <Link href="/goals">
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                View all <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {activeGoals.map((goal) => {
                const pct = Number(goal.target_amount) > 0
                  ? (Number(goal.current_amount) / Number(goal.target_amount)) * 100
                  : 0;
                return (
                  <div key={goal.id} className="space-y-1.5 rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{goal.name}</p>
                      <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                    </div>
                    <Progress value={pct} className="h-1.5" indicatorClassName={goal.priority === "emergency" ? "bg-red-500" : undefined} />
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(Number(goal.current_amount))} / {formatCurrency(Number(goal.target_amount))}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <CategoryDonut data={categoryBreakdown} />
        <DailyBar data={dailySpending} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <TrendLine data={trendData} />
        <MonthlySummaryCard summary={summary} month={currentMonth} year={currentYear} />
      </div>

      <TipsCard initialTips={summary?.tips || []} />
    </div>
  );
}
