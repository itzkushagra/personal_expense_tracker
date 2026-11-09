"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExpenseForm } from "@/components/expense-form";
import { type Expense } from "@/types";

interface ExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The expense to edit; leave out to add a new one. */
  expense?: Expense | null;
  /** Pre-tick "Company will reimburse this" for new expenses. */
  defaultReimbursable?: boolean;
  /** Called after a successful save (the dialog closes itself). */
  onSaved?: () => void;
}

/**
 * The one place expenses are added or edited. Every page opens this pop-up
 * instead of navigating to a separate form page.
 */
export function ExpenseDialog({
  open,
  onOpenChange,
  expense,
  defaultReimbursable = false,
  onSaved,
}: ExpenseDialogProps) {
  const editing = !!expense;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit expense" : "Add expense"}</DialogTitle>
          <DialogDescription>
            {editing ? "Change the details and save." : "Record a new expense or savings entry."}
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open (keyed per expense) so each open starts fresh. */}
        {open && (
          <ExpenseForm
            key={expense?.id ?? "new"}
            inDialog
            mode={editing ? "edit" : "create"}
            expense={expense ?? undefined}
            defaultReimbursable={defaultReimbursable}
            onSaved={() => {
              onOpenChange(false);
              onSaved?.();
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
