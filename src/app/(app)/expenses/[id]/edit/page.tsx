"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ExpenseForm } from "@/components/expense-form";
import { type Expense } from "@/types";
import { Loader2 } from "lucide-react";

export default function EditExpensePage() {
  const params = useParams();
  const [expense, setExpense] = useState<Expense | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchExpense() {
      try {
        const res = await fetch(`/api/expenses?limit=1000`);
        const json = await res.json();
        const found = (json.data || []).find(
          (e: Expense) => e.id === params.id
        );
        setExpense(found || null);
      } catch {
        // handled below
      } finally {
        setLoading(false);
      }
    }
    fetchExpense();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!expense) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Expense not found.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Edit Expense</h1>
        <p className="text-muted-foreground">Update this expense</p>
      </div>
      <ExpenseForm expense={expense} mode="edit" />
    </div>
  );
}
