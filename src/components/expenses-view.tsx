"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExpenseForm } from "@/components/expense-form";
import { ExpenseList } from "@/components/expense-list";

export function ExpensesView() {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // /expenses?add=1 (used by other pages and the old /expenses/add link) opens
  // the dialog straight away, then tidies the URL.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("add") === "1") {
      setAdding(true);
      router.replace("/expenses", { scroll: false });
    }
  }, [router]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Expenses</h1>
          <p className="text-muted-foreground">View and manage your expenses</p>
        </div>
        <Button onClick={() => setAdding(true)} className="shrink-0">
          <Plus className="mr-1 h-4 w-4" />
          Add expense
        </Button>
      </div>

      <ExpenseList refreshKey={refreshKey} onAdd={() => setAdding(true)} />

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Add expense</DialogTitle>
            <DialogDescription>Record a new expense or savings entry.</DialogDescription>
          </DialogHeader>
          {/* Mounted only while open, so every open starts with a fresh form. */}
          {adding && (
            <ExpenseForm
              inDialog
              onSaved={() => {
                setAdding(false);
                setRefreshKey((k) => k + 1);
              }}
              onCancel={() => setAdding(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
