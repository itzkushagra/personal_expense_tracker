import { ExpenseList } from "@/components/expense-list";

export default function ExpensesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Expenses</h1>
          <p className="text-muted-foreground">View and manage your expenses</p>
        </div>
      </div>
      <ExpenseList />
    </div>
  );
}
