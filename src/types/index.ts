export interface Expense {
  id: string;
  user_id: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  input_method: "manual" | "voice";
  ai_categorized: boolean;
  tags: string[];
  account_id: string | null;
  is_recurring: boolean;
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

// --- Accounts & Net Worth ---

export type AccountType = "checking" | "savings" | "credit_card" | "loan" | "investment";

export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  balance: number;
  institution: string;
  color: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface NetWorthSnapshot {
  id: string;
  user_id: string;
  date: string;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  breakdown: Record<string, number>;
  created_at: string;
}

export interface Debt {
  id: string;
  user_id: string;
  name: string;
  type: "credit_card" | "personal_loan" | "emi" | "mortgage" | "other";
  original_amount: number;
  current_balance: number;
  interest_rate: number;
  minimum_payment: number;
  due_day: number;
  start_date: string;
  expected_payoff_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// --- Budgeting ---

export type BudgetPeriod = "weekly" | "monthly" | "custom";

export interface Budget {
  id: string;
  user_id: string;
  category: string;
  amount: number;
  period: BudgetPeriod;
  start_date: string;
  end_date: string | null;
  alert_threshold: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BudgetWithSpent extends Budget {
  spent: number;
  remaining: number;
  percentage: number;
}

// --- Goals & Savings ---

export type GoalPriority = "normal" | "high" | "emergency";

export interface Goal {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  priority: GoalPriority;
  deadline: string | null;
  icon: string;
  color: string;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
}

// --- Bills & Recurring Payments ---

export type BillFrequency = "weekly" | "monthly" | "quarterly" | "yearly";

export interface Bill {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  category: string;
  frequency: BillFrequency;
  due_day: number;
  next_due_date: string;
  is_auto_pay: boolean;
  is_active: boolean;
  reminder_days_before: number;
  created_at: string;
  updated_at: string;
}

export interface BillPayment {
  id: string;
  bill_id: string;
  user_id: string;
  amount_paid: number;
  paid_date: string;
  status: "paid" | "missed" | "late";
  created_at: string;
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

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: "Checking",
  savings: "Savings",
  credit_card: "Credit Card",
  loan: "Loan",
  investment: "Investment",
};

export const ACCOUNT_TYPE_COLORS: Record<AccountType, string> = {
  checking: "#3b82f6",
  savings: "#22c55e",
  credit_card: "#ef4444",
  loan: "#f97316",
  investment: "#8b5cf6",
};

export const DEBT_TYPE_LABELS: Record<Debt["type"], string> = {
  credit_card: "Credit Card",
  personal_loan: "Personal Loan",
  emi: "EMI",
  mortgage: "Mortgage",
  other: "Other",
};

export const BILL_FREQUENCY_LABELS: Record<BillFrequency, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

export const GOAL_ICONS = [
  "target",
  "piggy-bank",
  "home",
  "plane",
  "car",
  "graduation-cap",
  "heart",
  "shield",
  "briefcase",
  "gift",
] as const;
