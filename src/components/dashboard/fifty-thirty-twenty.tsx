"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { type Expense, NEEDS_CATEGORIES, isSavingsCategory, outOfPocket } from "@/types";
import { formatCurrency } from "@/lib/utils";

interface FiftyThirtyTwentyProps {
  income: number;
  expenses: Expense[];
  title?: string;
}

/**
 * Compares this month's out-of-pocket spending against the 50/30/20 guideline:
 * 50% of income on needs, 30% on wants, 20% saved.
 */
export function FiftyThirtyTwenty({ income, expenses, title = "50/30/20 Check" }: FiftyThirtyTwentyProps) {
  let needs = 0;
  let wants = 0;
  let putAside = 0;
  for (const e of expenses) {
    if (isSavingsCategory(e.category)) {
      putAside += Number(e.amount);
      continue;
    }
    const own = outOfPocket(e);
    if (NEEDS_CATEGORIES.includes(e.category)) needs += own;
    else wants += own;
  }
  const saved = income - needs - wants;

  const rows = [
    {
      label: "Needs",
      hint: "rent, utilities, groceries, transport, health",
      actual: needs,
      target: income * 0.5,
      good: needs <= income * 0.5,
      color: "bg-sky-500",
    },
    {
      label: "Wants",
      hint: "dining out, shopping, entertainment, travel",
      actual: wants,
      target: income * 0.3,
      good: wants <= income * 0.3,
      color: "bg-violet-500",
    },
    {
      label: "Savings",
      hint: putAside > 0
        ? `incl. ${formatCurrency(putAside)} logged as savings / investments`
        : "what's left after spending",
      actual: Math.max(0, saved),
      target: income * 0.2,
      good: saved >= income * 0.2,
      color: "bg-green-500",
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {income <= 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Add this month&apos;s income to see how your spending compares to the 50/30/20 rule.
          </p>
        ) : (
          <>
            {rows.map((r) => (
              <div key={r.label} className="space-y-1.5">
                <div className="flex items-baseline justify-between text-sm">
                  <span>
                    <span className="font-medium">{r.label}</span>{" "}
                    <span className="text-xs text-muted-foreground">({r.hint})</span>
                  </span>
                  <span className={r.good ? "text-green-600" : "text-destructive"}>
                    {formatCurrency(r.actual)}{" "}
                    <span className="text-xs text-muted-foreground">/ {formatCurrency(r.target)}</span>
                  </span>
                </div>
                <Progress
                  value={r.target > 0 ? Math.min(100, (r.actual / r.target) * 100) : 0}
                  className="h-2"
                  indicatorClassName={r.good ? r.color : "bg-destructive"}
                />
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              {saved < 0
                ? `You spent ${formatCurrency(-saved)} more than your income this month.`
                : `You've kept ${((saved / income) * 100).toFixed(0)}% of your income so far. The target is 20% or more.`}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
