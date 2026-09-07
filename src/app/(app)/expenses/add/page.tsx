import { ExpenseForm } from "@/components/expense-form";

export default function AddExpensePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Add Expense</h1>
        <p className="text-muted-foreground">
          Record a new expense manually or by voice
        </p>
      </div>
      <ExpenseForm />
    </div>
  );
}
