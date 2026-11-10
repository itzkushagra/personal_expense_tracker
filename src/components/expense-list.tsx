"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import {
  Pencil,
  Trash2,
  Mic,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  Copy,
  Download,
  Search,
  X,
  Tag,
  Landmark,
} from "lucide-react";
import {
  type Expense,
  EXPENSE_CATEGORIES,
  CATEGORY_COLORS,
  REIMBURSEMENT_STATUS_LABELS,
  outOfPocket,
} from "@/types";
import { cn, formatCurrency, toLocalDateString } from "@/lib/utils";
import { AccountSelect, refreshAccounts, useAccounts } from "@/components/account-select";
import { toast } from "sonner";

const ITEMS_PER_PAGE = 25;

// Filter options: this month and the 23 before it ("YYYY-MM"), plus "all".
const MONTH_OPTIONS = Array.from({ length: 24 }, (_, i) => {
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

function csvCell(v: unknown) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

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
  const [filterAccount, setFilterAccount] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAccount, setBulkAccount] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { accounts } = useAccounts();
  const accountNames: Record<string, string> = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
  const accountFilterLabels: Record<string, string> = { all: "All Accounts", none: "Not linked", ...accountNames };

  // Debounce the search box so we don't query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (filterCategory !== "all") params.set("category", filterCategory);
    if (filterMonth !== "all") {
      const [y, m] = filterMonth.split("-");
      params.set("month", String(Number(m)));
      params.set("year", y);
    }
    if (filterAccount !== "all") params.set("account_id", filterAccount);
    if (search) params.set("q", search);
    return params;
  }, [filterCategory, filterMonth, filterAccount, search]);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    const params = buildParams();
    params.set("limit", String(ITEMS_PER_PAGE));
    params.set("offset", String(page * ITEMS_PER_PAGE));
    try {
      const res = await fetch(`/api/expenses?${params}`);
      const json = await res.json();
      setExpenses(json.data || []);
      setCount(json.count || 0);
      setSelected(new Set());
    } catch {
      toast.error("Failed to load expenses");
    } finally {
      setLoading(false);
    }
  }, [buildParams, page]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses, refreshKey]);

  function afterChange() {
    fetchExpenses();
    refreshAccounts();
  }

  async function handleDelete(e: Expense) {
    if (!confirm(`Delete "${e.description}" (${formatCurrency(Number(e.amount))})?`)) return;
    try {
      const res = await fetch(`/api/expenses/${e.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Expense deleted");
      afterChange();
    } catch {
      toast.error("Failed to delete");
    }
  }

  async function handleDuplicate(e: Expense) {
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: e.amount,
          description: e.description,
          category: e.category,
          date: toLocalDateString(),
          input_method: "manual",
          ai_categorized: false,
          is_reimbursable: e.is_reimbursable,
          claim_reference: "",
          account_id: e.account_id,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Added "${e.description}" again for today`);
      afterChange();
    } catch {
      toast.error("Failed to duplicate");
    }
  }

  async function bulk(method: "PATCH" | "DELETE", body: Record<string, unknown>, message: string) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/expenses/bulk", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, ...body }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      toast.success(message.replace("{n}", String(ids.length)));
      afterChange();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Bulk update failed");
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    const params = buildParams();
    params.set("limit", "20000");
    try {
      const res = await fetch(`/api/expenses?${params}`);
      const json = await res.json();
      const rows: Expense[] = json.data || [];
      const header = ["Date", "Description", "Category", "Amount", "Your share", "Account", "Reimbursement", "Tags"];
      const lines = rows.map((e) =>
        [
          e.date,
          e.description,
          e.category,
          Number(e.amount),
          outOfPocket(e),
          e.account_id ? accountNames[e.account_id] ?? "" : "",
          e.is_reimbursable ? REIMBURSEMENT_STATUS_LABELS[e.reimbursement_status ?? "pending"] : "",
          (e.tags || []).join("; "),
        ].map(csvCell).join(",")
      );
      const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `expenses-${filterMonth}${filterCategory !== "all" ? `-${filterCategory}` : ""}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(`Exported ${rows.length} expenses`);
    } catch {
      toast.error("Export failed");
    }
  }

  const totalPages = Math.ceil(count / ITEMS_PER_PAGE);
  const pageTotal = expenses.reduce((s, e) => s + outOfPocket(e), 0);
  const allSelected = expenses.length > 0 && expenses.every((e) => selected.has(e.id));
  const hasFilters = filterCategory !== "all" || filterAccount !== "all" || search !== "";

  // Group rows under a date heading.
  const groups: { date: string; items: Expense[] }[] = [];
  for (const e of expenses) {
    const last = groups[groups.length - 1];
    if (last && last.date === e.date) last.items.push(e);
    else groups.push({ date: e.date, items: [e] });
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>
            Expenses <span className="text-sm font-normal text-muted-foreground">({count})</span>
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={count === 0}>
              <Download className="mr-1 h-4 w-4" /> Export CSV
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search descriptions"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-8"
            />
          </div>
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
              <SelectValue>{(v: string) => (v === "all" ? "All Categories" : v)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {EXPENSE_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterAccount} onValueChange={(v) => { setFilterAccount(v ?? "all"); setPage(0); }}>
            <SelectTrigger className="w-[150px]">
              <SelectValue>{(v: string) => accountFilterLabels[v] ?? "Account"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Accounts</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
              <SelectItem value="none">Not linked</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setFilterCategory("all"); setFilterAccount("all"); setSearchInput(""); setPage(0); }}
            >
              <X className="mr-1 h-4 w-4" /> Clear
            </Button>
          )}
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 p-2">
            <span className="px-1 text-sm font-medium">{selected.size} selected</span>
            <Select value="" onValueChange={(v) => v && bulk("PATCH", { category: v }, `Moved {n} expenses to ${v}`)}>
              <SelectTrigger className="h-8 w-[170px]" disabled={busy}>
                <Tag className="h-3.5 w-3.5" />
                <SelectValue>{() => "Change category"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Landmark className="h-3.5 w-3.5 text-muted-foreground" />
              <AccountSelect value={bulkAccount} onChange={setBulkAccount} placeholder="Choose account" className="h-8 w-[170px]" />
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={busy}
                onClick={() =>
                  bulk("PATCH", { account_id: bulkAccount }, bulkAccount ? `Linked {n} expenses to ${accountNames[bulkAccount]}` : "Unlinked {n} expenses")
                }
              >
                Set account
              </Button>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-8 text-destructive"
              disabled={busy}
              onClick={() => confirm(`Delete ${selected.size} expenses? This can't be undone.`) && bulk("DELETE", {}, "Deleted {n} expenses")}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        )}
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
            <p>{hasFilters ? "No expenses match these filters." : "No expenses found."}</p>
            {!hasFilters && onAdd && (
              <Button className="mt-4" onClick={onAdd}>
                Add your first expense
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between px-1 text-xs text-muted-foreground">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(expenses.map((e) => e.id)))}
                />
                Select page
              </label>
              <span>{formatCurrency(pageTotal)} on this page</span>
            </div>
            <div className="space-y-4">
              {groups.map((g) => (
                <div key={g.date} className="space-y-1.5">
                  <div className="flex items-center justify-between px-1 text-xs font-medium text-muted-foreground">
                    <span>{new Date(`${g.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
                    <span>{formatCurrency(g.items.reduce((s, e) => s + outOfPocket(e), 0))}</span>
                  </div>
                  {g.items.map((expense) => (
                    <div
                      key={expense.id}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50",
                        selected.has(expense.id) && "border-primary/50 bg-primary/5"
                      )}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 accent-primary"
                        checked={selected.has(expense.id)}
                        onChange={() =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(expense.id)) next.delete(expense.id);
                            else next.add(expense.id);
                            return next;
                          })
                        }
                        aria-label={`Select ${expense.description}`}
                      />
                      <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[expense.category] || "#94a3b8" }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium">{expense.description}</p>
                          {expense.input_method === "voice" && <Mic className="h-3 w-3 shrink-0 text-muted-foreground" />}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                          <Badge variant="secondary" className="text-xs">{expense.category}</Badge>
                          {expense.account_id && accountNames[expense.account_id] && (
                            <span className="text-xs">{accountNames[expense.account_id]}</span>
                          )}
                          {expense.is_reimbursable && expense.reimbursement_status && (
                            <Badge
                              variant="outline"
                              className={cn(
                                "gap-1 text-xs",
                                expense.reimbursement_status === "reimbursed"
                                  ? "text-green-600"
                                  : expense.reimbursement_status === "rejected"
                                    ? "text-destructive"
                                    : "text-blue-600"
                              )}
                            >
                              <Briefcase className="h-3 w-3" />
                              {REIMBURSEMENT_STATUS_LABELS[expense.reimbursement_status]}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <span className="shrink-0 font-semibold">{formatCurrency(Number(expense.amount))}</span>
                      <div className="flex shrink-0 gap-0.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDuplicate(expense)} aria-label="Add again for today" title="Add again for today">
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Edit expense" onClick={() => onEdit?.(expense)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(expense)} aria-label="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="mr-1 h-4 w-4" /> Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page + 1} of {totalPages}
                </span>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
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
