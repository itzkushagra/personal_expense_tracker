"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Loader2,
  Plus,
  Trash2,
  Pencil,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import {
  type BudgetWithSpent,
  EXPENSE_CATEGORIES,
  CATEGORY_COLORS,
} from "@/types";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<BudgetWithSpent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<BudgetWithSpent | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchBudgets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/budgets");
      const json = await res.json();
      setBudgets(json.data || []);
    } catch {
      toast.error("Failed to load budgets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBudgets(); }, [fetchBudgets]);

  const totalBudget = budgets.reduce((s, b) => s + Number(b.amount), 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const overBudgetCount = budgets.filter((b) => b.percentage > 100).length;
  const nearLimitCount = budgets.filter((b) => b.percentage >= b.alert_threshold && b.percentage <= 100).length;

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      category: fd.get("category"),
      amount: parseFloat(fd.get("amount") as string),
      period: fd.get("period") || "monthly",
      alert_threshold: parseFloat(fd.get("alert_threshold") as string) || 80,
    };

    try {
      const url = editing ? `/api/budgets/${editing.id}` : "/api/budgets";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      toast.success(editing ? "Budget updated" : "Budget created");
      setShowDialog(false);
      setEditing(null);
      fetchBudgets();
    } catch {
      toast.error("Failed to save budget");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this budget?")) return;
    try {
      await fetch(`/api/budgets/${id}`, { method: "DELETE" });
      toast.success("Budget deleted");
      fetchBudgets();
    } catch {
      toast.error("Failed to delete");
    }
  }

  function getStatusColor(pct: number, threshold: number) {
    if (pct > 100) return "bg-destructive";
    if (pct >= threshold) return "bg-yellow-500";
    return "bg-green-500";
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Budgets</h1>
        <p className="text-muted-foreground">Set spending limits by category</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Budget</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalBudget)}</div>
            <p className="text-xs text-muted-foreground">across {budgets.length} categories</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Spent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalSpent > totalBudget ? "text-destructive" : ""}`}>
              {formatCurrency(totalSpent)}
            </div>
            <p className="text-xs text-muted-foreground">
              {totalBudget > 0 ? `${((totalSpent / totalBudget) * 100).toFixed(0)}% of budget` : "no budget set"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              {overBudgetCount > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {overBudgetCount} over budget
                </Badge>
              )}
              {nearLimitCount > 0 && (
                <Badge variant="secondary" className="gap-1 bg-yellow-500/20 text-yellow-700">
                  {nearLimitCount} near limit
                </Badge>
              )}
              {overBudgetCount === 0 && nearLimitCount === 0 && (
                <Badge variant="secondary" className="gap-1 text-green-600">
                  <CheckCircle2 className="h-3 w-3" />
                  All on track
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Budget List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Category Budgets</CardTitle>
          <Dialog open={showDialog} onOpenChange={(o) => { setShowDialog(o); if (!o) setEditing(null); }}>
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="mr-1 h-4 w-4" /> Add Budget
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Budget" : "Create Budget"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select name="category" defaultValue={editing?.category || ""}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bud-amount">Budget Amount</Label>
                    <Input id="bud-amount" name="amount" type="number" step="1" min="1" required defaultValue={editing?.amount || ""} />
                  </div>
                  <div className="space-y-2">
                    <Label>Period</Label>
                    <Select name="period" defaultValue={editing?.period || "monthly"}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bud-alert">Alert Threshold (%)</Label>
                  <Input id="bud-alert" name="alert_threshold" type="number" min="50" max="100" defaultValue={editing?.alert_threshold || 80} />
                  <p className="text-xs text-muted-foreground">Get warned when spending exceeds this percentage</p>
                </div>
                <Button type="submit" className="w-full" disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {editing ? "Update Budget" : "Create Budget"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {budgets.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No budgets set yet. Create one to start tracking.</p>
          ) : (
            <div className="space-y-4">
              {budgets.map((budget) => (
                <div key={budget.id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[budget.category] || "#94a3b8" }} />
                      <div>
                        <p className="font-medium">{budget.category}</p>
                        <p className="text-xs text-muted-foreground capitalize">{budget.period}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">
                        {formatCurrency(budget.spent)} <span className="text-sm font-normal text-muted-foreground">/ {formatCurrency(Number(budget.amount))}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{formatCurrency(budget.remaining)} remaining</p>
                    </div>
                  </div>
                  <Progress
                    value={Math.min(budget.percentage, 100)}
                    indicatorClassName={getStatusColor(budget.percentage, budget.alert_threshold)}
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {budget.percentage > 100 && (
                        <Badge variant="destructive" className="gap-1 text-xs">
                          <AlertTriangle className="h-3 w-3" />
                          Over by {formatCurrency(budget.spent - Number(budget.amount))}
                        </Badge>
                      )}
                      {budget.percentage >= budget.alert_threshold && budget.percentage <= 100 && (
                        <Badge variant="secondary" className="text-xs bg-yellow-500/20 text-yellow-700">
                          Nearing limit ({budget.percentage.toFixed(0)}%)
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(budget); setShowDialog(true); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(budget.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
