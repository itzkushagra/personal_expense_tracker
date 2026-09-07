"use client";

import { useEffect, useState, useCallback } from "react";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { CategoryDonut } from "@/components/charts/category-donut";
import { DailyBar } from "@/components/charts/daily-bar";
import { TrendLine } from "@/components/charts/trend-line";
import { MonthlySummaryCard } from "@/components/dashboard/monthly-summary";
import { TipsCard } from "@/components/dashboard/tips-card";
import { type Expense, type MonthlySummary, type DailySpending } from "@/types";
import { Loader2 } from "lucide-react";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [trendData, setTrendData] = useState<{ month: string; total: number }[]>([]);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [expensesRes, summaryRes] = await Promise.all([
        fetch(
          `/api/expenses?month=${currentMonth}&year=${currentYear}&limit=1000`
        ),
        fetch(`/api/summary?month=${currentMonth}&year=${currentYear}`),
      ]);

      const expensesJson = await expensesRes.json();
      const summaryJson = await summaryRes.json();

      setExpenses(expensesJson.data || []);
      setSummary(summaryJson.data || null);

      const trend: Record<string, number> = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date(currentYear, currentMonth - 1 - i, 1);
        const key = d.toLocaleString("en-IN", {
          month: "short",
          year: "2-digit",
        });
        trend[key] = 0;
      }

      const allExpRes = await fetch(`/api/expenses?limit=5000`);
      const allExpJson = await allExpRes.json();
      for (const exp of allExpJson.data || []) {
        const d = new Date(exp.date);
        const key = d.toLocaleString("en-IN", {
          month: "short",
          year: "2-digit",
        });
        if (key in trend) {
          trend[key] += Number(exp.amount);
        }
      }

      setTrendData(
        Object.entries(trend).map(([month, total]) => ({ month, total }))
      );
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [currentMonth, currentYear]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
    categoryBreakdown[e.category] =
      (categoryBreakdown[e.category] || 0) + Number(e.amount);
  }

  const dailyMap: Record<string, number> = {};
  for (const e of expenses) {
    dailyMap[e.date] = (dailyMap[e.date] || 0) + Number(e.amount);
  }
  const dailySpending: DailySpending[] = Object.entries(dailyMap)
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const prevMonthTotal = summary?.comparison?.prev_total ?? null;

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

      <div className="grid gap-6 lg:grid-cols-2">
        <CategoryDonut data={categoryBreakdown} />
        <DailyBar data={dailySpending} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <TrendLine data={trendData} />
        <MonthlySummaryCard
          summary={summary}
          month={currentMonth}
          year={currentYear}
        />
      </div>

      <TipsCard initialTips={summary?.tips || []} />
    </div>
  );
}
