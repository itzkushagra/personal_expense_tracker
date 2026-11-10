"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ExpenseDialog } from "@/components/expense-dialog";
import { ExpenseList } from "@/components/expense-list";
import { type Expense } from "@/types";

export function ExpensesView() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [defaultReimbursable, setDefaultReimbursable] = useState(false);

  // Old links still work: /expenses?add=1 opens "Add" (&reimbursable=1 pre-ticks the
  // company-claim box, used by quick add), /expenses?edit=<id> opens "Edit" for that
  // expense. The URL is tidied afterwards.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("edit");
    if (params.get("add") === "1") {
      setEditing(null);
      setDefaultReimbursable(params.get("reimbursable") === "1");
      setOpen(true);
    } else if (editId) {
      fetch(`/api/expenses/${editId}`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((json) => {
          setEditing(json.data as Expense);
          setOpen(true);
        })
        .catch(() => toast.error("Couldn't find that expense"));
    } else {
      return;
    }
    router.replace("/expenses", { scroll: false });
  }, [router]);

  function openAdd() {
    setEditing(null);
    setDefaultReimbursable(false);
    setOpen(true);
  }

  function openEdit(expense: Expense) {
    setEditing(expense);
    setOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Expenses</h1>
          <p className="text-muted-foreground">Search, filter, bulk-edit and export your spending</p>
        </div>
        <Button onClick={openAdd} className="shrink-0">
          <Plus className="mr-1 h-4 w-4" />
          Add expense
        </Button>
      </div>

      <ExpenseList refreshKey={refreshKey} onAdd={openAdd} onEdit={openEdit} />

      <ExpenseDialog
        open={open}
        onOpenChange={setOpen}
        expense={editing}
        defaultReimbursable={defaultReimbursable}
        onSaved={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}
