"use client";

import { useState, useEffect, useCallback } from "react";
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
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Pencil, Trash2, Mic, ChevronLeft, ChevronRight, Briefcase } from "lucide-react";
import {
  type Expense,
  EXPENSE_CATEGORIES,
  CATEGORY_COLORS,
  REIMBURSEMENT_STATUS_LABELS,
} from "@/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";

const ITEMS_PER_PAGE = 20;

// Filter options: this month and the 11 before it ("YYYY-MM"), plus "all".
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
  return {
    value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    label: i === 0 ? "This Month" : d.toLocaleString("en-IN", { month: "short", year: "numeric" }),
  };
});
const MONTH_LABELS: Record<string, string> = Object.fromEntries([
  ...MONTH_OPTIONS.map((o) => [o.value, o.label]),
  ["all", "All Time"],
]);

interface ExpenseListProps {
  /** Bump to reload the list, e.g. after adding an expense. */
  refreshKey?: number;
  /** Opens the add-expense dialog from the empty state. */
  onAdd?: () => void;
  /** Opens the edit dialog for an expense. */
  onEdit?: (expense: Expense) => void;
}

export function ExpenseList({ refreshKey = 0, onAdd, onEdit }: ExpenseListProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterMonth, setFilterMonth] = useState(MONTH_OPTIONS[0].value);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("limit", String(ITEMS_PER_PAGE));
    params.set("offset", String(page * ITEMS_PER_PAGE));

    if (filterCategory !== "all") {
      params.set("category", filterCategory);
    }

    if (filterMonth !== "all") {
      const [y, m] = filterMonth.split("-");
      params.set("month", String(Number(m)));
      params.set("year", y);
    }

    try {
      const res = await fetch(`/api/expenses?${params}`);
      const json = await res.json();
      setExpenses(json.data || []);
      setCount(json.count || 0);
    } catch {
      toast.error("Failed to load expenses");
    } finally {
      setLoading(false);
    }
  }, [page, filterCategory, filterMonth]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses, refreshKey]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this expense?")) return;
    try {
      const res = await fetch(`/api/expenses/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Expense deleted");
      fetchExpenses();
    } catch {
      toast.error("Failed to delete");
    }
  }

  const totalPages = Math.ceil(count / ITEMS_PER_PAGE);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Expenses ({count})</CardTitle>
          <div className="flex gap-2">
            <Select value={filterMonth} onValueChange={(v) => { setFilterMonth(v ?? MONTH_OPTIONS[0].value); setPage(0); }}>
              <SelectTrigger className="w-[130px]">
                <SelectValue>{(v: string) => MONTH_LABELS[v] ?? v}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {MONTH_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v ?? "all"); setPage(0); }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : expenses.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <p>No expenses found.</p>
            {onAdd && (
              <Button className="mt-4" onClick={onAdd}>
                Add your first expense
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {expenses.map((expense) => (
                <div
                  key={expense.id}
                  className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <div
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{
                      backgroundColor:
                        CATEGORY_COLORS[expense.category] || "#94a3b8",
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">
                        {expense.description}
                      </p>
                      {expense.input_method === "voice" && (
                        <Mic className="h-3 w-3 shrink-0 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{formatDate(expense.date)}</span>
                      <Badge variant="secondary" className="text-xs">
                        {expense.category}
                      </Badge>
                      {expense.is_reimbursable && expense.reimbursement_status && (
                        <Badge
                          variant="outline"
                          className={`gap-1 text-xs ${
                            expense.reimbursement_status === "reimbursed"
                              ? "text-green-600"
                              : expense.reimbursement_status === "rejected"
                                ? "text-destructive"
                                : "text-blue-600"
                          }`}
                        >
                          <Briefcase className="h-3 w-3" />
                          {REIMBURSEMENT_STATUS_LABELS[expense.reimbursement_status]}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 font-semibold">
                    {formatCurrency(expense.amount)}
                  </span>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Edit expense"
                      onClick={() => onEdit?.(expense)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => handleDelete(expense.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" /> Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
