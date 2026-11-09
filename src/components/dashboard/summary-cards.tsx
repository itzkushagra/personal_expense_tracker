"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  IndianRupee,
  TrendingUp,
  TrendingDown,
  Receipt,
  CalendarDays,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface SummaryCardsProps {
  totalSpent: number;
  transactionCount: number;
  dailyAverage: number;
  prevMonthTotal: number | null;
  /** Company-reimbursable spend left out of totalSpent. */
  reimbursableAmount?: number;
}

export function SummaryCards({
  totalSpent,
  transactionCount,
  dailyAverage,
  prevMonthTotal,
  reimbursableAmount = 0,
}: SummaryCardsProps) {
  const changePct =
    prevMonthTotal !== null && prevMonthTotal > 0
      ? ((totalSpent - prevMonthTotal) / prevMonthTotal) * 100
      : null;

  const cards = [
    {
      title: "Total Spent",
      value: formatCurrency(totalSpent),
      icon: IndianRupee,
      change: changePct,
      subtitle:
        reimbursableAmount > 0
          ? `excl. ${formatCurrency(reimbursableAmount)} company-reimbursable`
          : undefined,
    },
    {
      title: "Transactions",
      value: transactionCount.toString(),
      icon: Receipt,
      subtitle: "this month",
    },
    {
      title: "Daily Average",
      value: formatCurrency(dailyAverage),
      icon: CalendarDays,
      subtitle: "per day",
    },
    {
      title: "vs Last Month",
      value:
        prevMonthTotal !== null
          ? formatCurrency(prevMonthTotal)
          : "No data",
      icon: changePct !== null && changePct > 0 ? TrendingUp : TrendingDown,
      change: changePct,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <card.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
            {card.change !== null && card.change !== undefined && (
              <p
                className={`mt-1 text-xs ${
                  card.change > 0 ? "text-destructive" : "text-green-600"
                }`}
              >
                {card.change > 0 ? "+" : ""}
                {card.change.toFixed(1)}% from last month
              </p>
            )}
            {card.subtitle && (
              <p className="mt-1 text-xs text-muted-foreground">
                {card.subtitle}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
