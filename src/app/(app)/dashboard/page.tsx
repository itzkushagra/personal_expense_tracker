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
  type Rental,
  type PersonLoanWithBalance,
  type Account,
  type Income,
  CATEGORY_COLORS,
  HOUSING_CATEGORIES,
  outOfPocket,
  reimbursementDue,
  earnedIncome,
  netOfRefunds,
  refundsReceived,
} from "@/types";
import type { NetWorthBreakdown } from "@/lib/net-worth";
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
  Home,
  HandCoins,
  Briefcase,
  Wallet,
  Hourglass,
  CalendarRange,
} from "lucide-react";
import { QUICK_ACTIONS } from "@/components/layout/quick-add";
import { formatCurrency, daysUntil, toLocalDateString } from "@/lib/utils";
import { startLoad } from "@/lib/load";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [trendData, setTrendData] = useState<{ month: string; total: number }[]>([]);
  const [budgets, setBudgets] = useState<BudgetWithSpent[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [netWorth, setNetWorth] = useState<NetWorthBreakdown | null>(null);
  const [rental, setRental] = useState<Rental | null>(null);
  const [loans, setLoans] = useState<PersonLoanWithBalance[]>([]);
  const [incomeTotal, setIncomeTotal] = useState(0);
  const [monthRefunds, setMonthRefunds] = useState(0);
  const [accountList, setAccountList] = useState<Account[]>([]);
  const [pendingIncome, setPendingIncome] = useState<Income[]>([]);
  const [claims, setClaims] = useState<Expense[]>([]);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const fetchData = useCallback(async () => {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    try {
      const [expensesRes, summaryRes, budgetsRes, goalsRes, billsRes, netWorthRes, rentalRes, loansRes, claimsRes, incomesRes, accountsRes, pendingRes] = await Promise.all([
        fetch(`/api/expenses?month=${currentMonth}&year=${currentYear}&limit=1000`),
        fetch(`/api/summary?month=${currentMonth}&year=${currentYear}`),
        fetch("/api/budgets"),
        fetch("/api/goals"),
        fetch("/api/bills"),
        fetch("/api/net-worth?current=1"),
        fetch("/api/rental"),
        fetch("/api/people-loans"),
        fetch("/api/reimbursements"),
        fetch(`/api/incomes?month=${currentMonth}&year=${currentYear}`),
        fetch("/api/accounts"),
        fetch("/api/incomes?pending=1"),
      ]);

      const [expensesJson, summaryJson, budgetsJson, goalsJson, billsJson, netWorthJson, rentalJson, loansJson, claimsJson, incomesJson, accountsJson, pendingJson] = await Promise.all([
        expensesRes.json(),
        summaryRes.json(),
        budgetsRes.json(),
        goalsRes.json(),
        billsRes.json(),
        netWorthRes.json(),
        rentalRes.json(),
        loansRes.json(),
        claimsRes.json(),
        incomesRes.json(),
        accountsRes.json(),
        pendingRes.json(),
      ]);

      setExpenses(expensesJson.data || []);
      setSummary(summaryJson.data || null);
      setBudgets(budgetsJson.data || []);
      setGoals(goalsJson.data || []);
      setBills(billsJson.data || []);
      setNetWorth(netWorthJson.data || null);
      setRental(rentalJson.data || null);
      setLoans(loansJson.data || []);
      // Refunds / cashback reduce spending rather than counting as income.
      setIncomeTotal(earnedIncome(incomesJson.data || []));
      setMonthRefunds(refundsReceived(incomesJson.data || []));
      setClaims(claimsJson.data || []);
      setAccountList(accountsJson.data || []);
      setPendingIncome(pendingJson.data || []);

      const trend: Record<string, number> = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date(currentYear, currentMonth - 1 - i, 1);
        const key = d.toLocaleString("en-IN", { month: "short", year: "2-digit" });
        trend[key] = 0;
      }

      const trendFrom = toLocalDateString(new Date(currentYear, currentMonth - 6, 1));
      const allExpRes = await fetch(`/api/expenses?from=${trendFrom}&limit=10000`);
      const allExpJson = await allExpRes.json();
      for (const exp of allExpJson.data || []) {
        const d = new Date(exp.date);
        const key = d.toLocaleString("en-IN", { month: "short", year: "2-digit" });
        if (key in trend) trend[key] += outOfPocket(exp);
      }

      setTrendData(Object.entries(trend).map(([month, total]) => ({ month, total })));
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { startLoad(fetchData); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // All spending figures are out-of-pocket: company-reimbursable expenses are left out.
  const totalSpent = netOfRefunds(expenses.reduce((s, e) => s + outOfPocket(e), 0), monthRefunds);
  const reimbursableThisMonth = expenses.reduce((s, e) => s + Number(e.amount) - outOfPocket(e), 0);
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const currentDay = Math.min(now.getDate(), daysInMonth);
  const dailyAverage = currentDay > 0 ? totalSpent / currentDay : 0;

  const categoryBreakdown: Record<string, number> = {};
  for (const e of expenses) {
    const own = outOfPocket(e);
    if (own > 0) categoryBreakdown[e.category] = (categoryBreakdown[e.category] || 0) + own;
  }

  // Rent is a once-a-month lump sum, so leave it out of the daily chart.
  const dailyMap: Record<string, number> = {};
  for (const e of expenses) {
    if (e.category === "Rent") continue;
    const own = outOfPocket(e);
    if (own > 0) dailyMap[e.date] = (dailyMap[e.date] || 0) + own;
  }
  const dailySpending: DailySpending[] = Object.entries(dailyMap)
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const prevMonthTotal = summary?.comparison?.prev_total ?? null;

  // Rent, held money, reimbursements
  const rentPaid = expenses.filter((e) => e.category === "Rent").reduce((s, e) => s + Number(e.amount), 0);
  const isRentPaid = !!rental && Number(rental.monthly_rent) > 0 && rentPaid >= Number(rental.monthly_rent);
  const rentOverdue = !!rental && !isRentPaid && now.getDate() > rental.rent_due_day;
  const housingSpent = expenses
    .filter((e) => HOUSING_CATEGORIES.includes(e.category))
    .reduce((s, e) => s + outOfPocket(e), 0);
  const activeLoans = loans.filter((l) => l.balance > 0);
  const youOwe = activeLoans.filter((l) => l.direction !== "lent").reduce((s, l) => s + l.balance, 0);
  const owedToYou = activeLoans.filter((l) => l.direction === "lent").reduce((s, l) => s + l.balance, 0);
  const youOweOverdue = activeLoans.filter(
    (l) => l.direction !== "lent" && l.expected_return_date && daysUntil(l.expected_return_date) < 0
  );
  const leftOver = incomeTotal - totalSpent;

  // Money snapshot: cash on hand, how long it lasts, and the next 30 days.
  const liquid = accountList
    .filter((a) => ["checking", "savings", "cash", "wallet"].includes(a.type))
    .reduce((s, a) => s + Number(a.balance), 0);
  const recentMonths = trendData.slice(-4, -1).filter((m) => m.total > 0); // last 3 full months
  const avgMonthly = recentMonths.length ? recentMonths.reduce((s, m) => s + m.total, 0) / recentMonths.length : 0;
  const runway = avgMonthly > 0 ? liquid / avgMonthly : null;
  const in30 = toLocalDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30));
  const incomingSoon = pendingIncome.filter((i) => i.date <= in30).reduce((s, i) => s + Number(i.amount), 0);
  const billsSoon = bills.filter((b) => b.is_active && b.next_due_date <= in30).reduce((s, b) => s + Number(b.amount), 0);
  const claimsDue = claims.reduce((s, c) => s + reimbursementDue(c), 0);
  const claimsToSubmit = claims.filter((c) => c.reimbursement_status === "pending");

  // Budget alerts
  const overBudget = budgets.filter((b) => b.percentage > 100);
  const nearLimit = budgets.filter((b) => b.percentage >= b.alert_threshold && b.percentage <= 100);
  const totalBudget = budgets.reduce((s, b) => s + Number(b.amount), 0);
  const totalBudgetSpent = budgets.reduce((s, b) => s + b.spent, 0);

  // Upcoming bills
  const todayStr = toLocalDateString(now);
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            {now.toLocaleString("en-IN", { month: "long", year: "numeric" })} overview
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.slice(0, 4).map((a) => (
            <Link key={a.href} href={a.href}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <a.icon className="h-4 w-4" /> {a.label}
              </Button>
            </Link>
          ))}
          <Link href="/yearly">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <CalendarRange className="h-4 w-4" /> Yearly view
            </Button>
          </Link>
        </div>
      </div>

      {/* Money snapshot */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/accounts">
          <Card className="h-full cursor-pointer bg-gradient-to-br from-primary/10 to-transparent transition-colors hover:bg-muted/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Cash & Bank</CardTitle>
              <Landmark className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{accountList.length ? formatCurrency(liquid) : "—"}</div>
              <p className="text-xs text-muted-foreground">
                {accountList.length ? `across ${accountList.filter((a) => ["checking", "savings", "cash", "wallet"].includes(a.type)).length} accounts` : "Add your accounts to see this"}
              </p>
            </CardContent>
          </Card>
        </Link>
        <Card className="h-full">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Runway</CardTitle>
            <Hourglass className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${runway !== null && runway < 3 ? "text-destructive" : runway !== null && runway < 6 ? "text-yellow-600" : "text-green-600"}`}>
              {runway === null || !accountList.length ? "—" : `${runway.toFixed(1)} months`}
            </div>
            <p className="text-xs text-muted-foreground">
              {avgMonthly > 0 ? `at ${formatCurrency(avgMonthly)}/month recent spending · aim for 6` : "needs a few months of spending data"}
            </p>
          </CardContent>
        </Card>
        <Link href="/bills">
          <Card className="h-full cursor-pointer transition-colors hover:bg-muted/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Next 30 Days</CardTitle>
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${incomingSoon - billsSoon >= 0 ? "text-green-600" : "text-destructive"}`}>
                {incomingSoon - billsSoon >= 0 ? "+" : "−"}{formatCurrency(Math.abs(incomingSoon - billsSoon))}
              </div>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(incomingSoon)} expected in · {formatCurrency(billsSoon)} bills due
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <SummaryCards
        totalSpent={totalSpent}
        transactionCount={expenses.length}
        dailyAverage={dailyAverage}
        prevMonthTotal={prevMonthTotal}
        reimbursableAmount={reimbursableThisMonth}
      />

      {/* Income, rent, people & loans, reimbursements */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/income">
          <Card className="cursor-pointer transition-colors hover:bg-muted/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Income & Savings</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {incomeTotal > 0 ? (
                <>
                  <div className={`text-xl font-bold ${leftOver >= 0 ? "text-green-600" : "text-destructive"}`}>
                    {formatCurrency(leftOver)} left
                  </div>
                  <p className="text-xs text-muted-foreground">
                    of {formatCurrency(incomeTotal)} · {((leftOver / incomeTotal) * 100).toFixed(0)}% saved
                  </p>
                </>
              ) : (
                <>
                  <div className="text-xl font-bold">—</div>
                  <p className="text-xs text-muted-foreground">Add this month&apos;s income</p>
                </>
              )}
            </CardContent>
          </Card>
        </Link>

        <Link href="/rent">
          <Card className={`cursor-pointer transition-colors hover:bg-muted/50 ${rentOverdue ? "border-red-200 dark:border-red-900" : ""}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Rent & Home</CardTitle>
              <Home className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {rental ? (
                <>
                  <div className={`text-xl font-bold ${isRentPaid ? "text-green-600" : rentOverdue ? "text-destructive" : ""}`}>
                    {isRentPaid ? "Rent paid" : rentOverdue ? "Rent overdue" : `Due on ${rental.rent_due_day}`}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    housing {formatCurrency(housingSpent)}
                    {totalSpent > 0 && ` · ${((housingSpent / totalSpent) * 100).toFixed(0)}% of spending`}
                  </p>
                </>
              ) : (
                <>
                  <div className="text-xl font-bold">—</div>
                  <p className="text-xs text-muted-foreground">Set up your flat</p>
                </>
              )}
            </CardContent>
          </Card>
        </Link>

        <Link href="/people">
          <Card className={`cursor-pointer transition-colors hover:bg-muted/50 ${youOweOverdue.length > 0 ? "border-red-200 dark:border-red-900" : ""}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">People & Loans</CardTitle>
              <HandCoins className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {activeLoans.length > 0 ? (
                <>
                  <div className="text-xl font-bold">
                    {youOwe > 0 ? `You owe ${formatCurrency(youOwe)}` : "You owe nothing"}
                  </div>
                  <p className={`text-xs ${youOweOverdue.length > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    {youOweOverdue.length > 0
                      ? `${youOweOverdue.length} overdue to return`
                      : owedToYou > 0
                        ? `${formatCurrency(owedToYou)} owed to you`
                        : "all on time"}
                  </p>
                </>
              ) : (
                <>
                  <div className="text-xl font-bold">—</div>
                  <p className="text-xs text-muted-foreground">No open loans</p>
                </>
              )}
            </CardContent>
          </Card>
        </Link>

        <Link href="/reimbursements">
          <Card className="cursor-pointer transition-colors hover:bg-muted/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Company Owes You</CardTitle>
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-blue-600">{claimsDue > 0 ? formatCurrency(claimsDue) : "—"}</div>
              <p className={`text-xs ${claimsToSubmit.length > 0 ? "text-yellow-600" : "text-muted-foreground"}`}>
                {claimsToSubmit.length > 0 ? `${claimsToSubmit.length} not submitted yet` : "pending reimbursements"}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

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
              <div className={`text-xl font-bold ${(netWorth?.net_worth ?? 0) >= 0 ? "text-green-600" : "text-destructive"}`}>
                {netWorth && netWorth.account_count > 0 ? formatCurrency(netWorth.net_worth) : "—"}
              </div>
              <p className="text-xs text-muted-foreground">{netWorth?.account_count ?? 0} accounts</p>
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
