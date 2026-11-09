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
  Target,
  Shield,
  PartyPopper,
  PiggyBank,
} from "lucide-react";
import { type Goal } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [saving, setSaving] = useState(false);
  const [showContribute, setShowContribute] = useState<string | null>(null);
  const [contributeAmount, setContributeAmount] = useState("");

  const fetchGoals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/goals");
      const json = await res.json();
      setGoals(json.data || []);
    } catch {
      toast.error("Failed to load goals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchGoals(); }, [fetchGoals]);

  const emergencyFund = goals.find((g) => g.priority === "emergency");
  const activeGoals = goals.filter((g) => !g.is_completed);
  const completedGoals = goals.filter((g) => g.is_completed);
  const totalSaved = goals.reduce((s, g) => s + Number(g.current_amount), 0);
  const totalTarget = goals.reduce((s, g) => s + Number(g.target_amount), 0);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      name: fd.get("name"),
      target_amount: parseFloat(fd.get("target_amount") as string),
      current_amount: parseFloat(fd.get("current_amount") as string) || 0,
      priority: fd.get("priority") || "normal",
      deadline: fd.get("deadline") || null,
      color: fd.get("priority") === "emergency" ? "#ef4444" : fd.get("priority") === "high" ? "#f59e0b" : "#22c55e",
    };

    try {
      const url = editing ? `/api/goals/${editing.id}` : "/api/goals";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      toast.success(editing ? "Goal updated" : "Goal created");
      setShowDialog(false);
      setEditing(null);
      fetchGoals();
    } catch {
      toast.error("Failed to save goal");
    } finally {
      setSaving(false);
    }
  }

  async function handleContribute(goalId: string) {
    const amount = parseFloat(contributeAmount);
    if (!amount || amount <= 0) return;
    const goal = goals.find((g) => g.id === goalId);
    if (!goal) return;

    try {
      const res = await fetch(`/api/goals/${goalId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_amount: Number(goal.current_amount) + amount,
          target_amount: goal.target_amount,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Added ${formatCurrency(amount)} to ${goal.name}`);
      setShowContribute(null);
      setContributeAmount("");
      fetchGoals();
    } catch {
      toast.error("Failed to contribute");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this goal?")) return;
    try {
      const res = await fetch(`/api/goals/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Goal deleted");
      fetchGoals();
    } catch {
      toast.error("Failed to delete");
    }
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Goals & Savings</h1>
          <p className="text-muted-foreground">Track progress towards your financial goals</p>
        </div>
        <Dialog open={showDialog} onOpenChange={(o) => { setShowDialog(o); if (!o) setEditing(null); }}>
          <DialogTrigger render={<Button />}>
            <Plus className="mr-1 h-4 w-4" /> New Goal
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Goal" : "Create Goal"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="goal-name">Goal Name</Label>
                <Input id="goal-name" name="name" required defaultValue={editing?.name || ""} placeholder="e.g. Emergency Fund, Vacation" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="goal-target">Target Amount</Label>
                  <Input id="goal-target" name="target_amount" type="number" step="1" min="1" required defaultValue={editing?.target_amount || ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goal-current">Already Saved</Label>
                  <Input id="goal-current" name="current_amount" type="number" step="1" min="0" defaultValue={editing?.current_amount || 0} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select name="priority" defaultValue={editing?.priority || "normal"}>
                    <SelectTrigger><SelectValue>{(v: string) => ({ emergency: "Emergency Fund", high: "High Priority", normal: "Normal" } as Record<string, string>)[v] ?? v}</SelectValue></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="emergency">Emergency Fund</SelectItem>
                      <SelectItem value="high">High Priority</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goal-deadline">Deadline (optional)</Label>
                  <Input id="goal-deadline" name="deadline" type="date" defaultValue={editing?.deadline || ""} />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {editing ? "Update Goal" : "Create Goal"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <PiggyBank className="h-4 w-4" /> Total Saved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalSaved)}</div>
            <p className="text-xs text-muted-foreground">across {goals.length} goals</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Target className="h-4 w-4" /> Total Target
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalTarget)}</div>
            <p className="text-xs text-muted-foreground">
              {totalTarget > 0 ? `${((totalSaved / totalTarget) * 100).toFixed(0)}% achieved` : "no targets set"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <PartyPopper className="h-4 w-4" /> Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedGoals.length}</div>
            <p className="text-xs text-muted-foreground">of {goals.length} goals</p>
          </CardContent>
        </Card>
      </div>

      {/* Emergency Fund Highlight */}
      {emergencyFund && !emergencyFund.is_completed && (
        <Card className="border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-5 w-5 text-red-500" />
              Emergency Fund
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold">{formatCurrency(Number(emergencyFund.current_amount))}</span>
              <span className="text-sm text-muted-foreground">of {formatCurrency(Number(emergencyFund.target_amount))}</span>
            </div>
            <Progress
              value={(Number(emergencyFund.current_amount) / Number(emergencyFund.target_amount)) * 100}
              className="h-3"
              indicatorClassName="bg-red-500"
            />
            <p className="text-sm text-muted-foreground">
              {formatCurrency(Number(emergencyFund.target_amount) - Number(emergencyFund.current_amount))} more to reach your target
            </p>
          </CardContent>
        </Card>
      )}

      {/* Active Goals */}
      {activeGoals.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Active Goals</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {activeGoals.map((goal) => {
              const pct = Number(goal.target_amount) > 0
                ? (Number(goal.current_amount) / Number(goal.target_amount)) * 100
                : 0;
              return (
                <Card key={goal.id}>
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: goal.color }} />
                        <p className="font-medium">{goal.name}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {goal.priority === "high" && (
                          <Badge variant="secondary" className="text-xs bg-yellow-500/20 text-yellow-700">High</Badge>
                        )}
                        {goal.priority === "emergency" && (
                          <Badge variant="destructive" className="text-xs">Emergency</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xl font-bold">{formatCurrency(Number(goal.current_amount))}</span>
                      <span className="text-sm text-muted-foreground">/ {formatCurrency(Number(goal.target_amount))}</span>
                    </div>
                    <Progress value={pct} indicatorClassName={goal.priority === "emergency" ? "bg-red-500" : undefined} />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{pct.toFixed(0)}% complete</span>
                      {goal.deadline && <span>Deadline: {new Date(goal.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>}
                    </div>
                    <div className="flex gap-2">
                      {showContribute === goal.id ? (
                        <div className="flex flex-1 gap-2">
                          <Input
                            type="number"
                            placeholder="Amount"
                            value={contributeAmount}
                            onChange={(e) => setContributeAmount(e.target.value)}
                            className="h-8"
                          />
                          <Button size="sm" className="h-8" onClick={() => handleContribute(goal.id)}>Add</Button>
                          <Button size="sm" variant="ghost" className="h-8" onClick={() => { setShowContribute(null); setContributeAmount(""); }}>Cancel</Button>
                        </div>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" className="h-8 flex-1" onClick={() => setShowContribute(goal.id)}>
                            <Plus className="mr-1 h-3 w-3" /> Contribute
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(goal); setShowDialog(true); }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(goal.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Completed Goals */}
      {completedGoals.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Completed Goals</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {completedGoals.map((goal) => (
              <Card key={goal.id} className="opacity-75">
                <CardContent className="pt-6 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <PartyPopper className="h-4 w-4 text-green-500" />
                      <p className="font-medium">{goal.name}</p>
                    </div>
                    <Badge variant="secondary" className="text-xs text-green-600">Completed</Badge>
                  </div>
                  <p className="text-lg font-bold text-green-600">{formatCurrency(Number(goal.target_amount))}</p>
                  <Progress value={100} indicatorClassName="bg-green-500" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {goals.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Target className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">No goals yet. Create your first savings goal to get started.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
