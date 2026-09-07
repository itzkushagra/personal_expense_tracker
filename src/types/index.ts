export interface Expense {
  id: string;
  user_id: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  input_method: "manual" | "voice";
  ai_categorized: boolean;
  created_at: string;
  updated_at: string;
}

export interface MonthlySummary {
  id: string;
  user_id: string;
  month: number;
  year: number;
  total_spent: number;
  category_breakdown: Record<string, number>;
  top_expenses: Expense[];
  tips: string[];
  comparison: {
    prev_total: number;
    change_pct: number;
  } | null;
  created_at: string;
}

export interface CategoryBreakdown {
  name: string;
  value: number;
  color: string;
}

export interface DailySpending {
  date: string;
  amount: number;
}

export const EXPENSE_CATEGORIES = [
  "Food & Dining",
  "Groceries",
  "Transport",
  "Shopping",
  "Bills & Utilities",
  "Entertainment",
  "Health",
  "Education",
  "Subscriptions",
  "Travel",
  "Gifts",
  "Miscellaneous",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const CATEGORY_COLORS: Record<string, string> = {
  "Food & Dining": "#f97316",
  Groceries: "#22c55e",
  Transport: "#3b82f6",
  Shopping: "#a855f7",
  "Bills & Utilities": "#ef4444",
  Entertainment: "#ec4899",
  Health: "#14b8a6",
  Education: "#6366f1",
  Subscriptions: "#f59e0b",
  Travel: "#06b6d4",
  Gifts: "#e879f9",
  Miscellaneous: "#94a3b8",
};
