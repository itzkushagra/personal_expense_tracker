"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, TrendingUp, TrendingDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { type MonthlySummary } from "@/types";
import { toast } from "sonner";

interface MonthlySummaryCardProps {
  summary: MonthlySummary | null;
  month: number;
  year: number;
}

export function MonthlySummaryCard({
  summary: initialSummary,
  month,
  year,
}: MonthlySummaryCardProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [loading, setLoading] = useState(false);

  async function generateSummary() {
    setLoading(true);
    try {
      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, year }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        setSummary(json.data);
        toast.success("Summary generated!");
      }
    } catch {
      toast.error("Failed to generate summary");
    } finally {
      setLoading(false);
    }
  }

  const monthName = new Date(year, month - 1).toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
  });

  if (!summary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            Monthly Summary — {monthName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            No summary generated yet for this month.
          </p>
          <Button onClick={generateSummary} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              "Generate Summary"
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const topCategories = Object.entries(summary.category_breakdown)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" />
          Monthly Summary — {monthName}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold">
            {formatCurrency(summary.total_spent)}
          </span>
          {summary.comparison && (
            <Badge
              variant={
                summary.comparison.change_pct > 0 ? "destructive" : "secondary"
              }
              className="flex items-center gap-1"
            >
              {summary.comparison.change_pct > 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {summary.comparison.change_pct > 0 ? "+" : ""}
              {summary.comparison.change_pct.toFixed(1)}%
            </Badge>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Top Categories</p>
          <div className="space-y-2">
            {topCategories.map(([cat, amount]) => (
              <div key={cat} className="flex items-center justify-between">
                <span className="text-sm">{cat}</span>
                <span className="text-sm font-medium">
                  {formatCurrency(amount)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={generateSummary}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          Refresh Summary
        </Button>
      </CardContent>
    </Card>
  );
}
