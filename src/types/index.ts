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
  is_reimbursable: boolean;
  reimbursement_status: ReimbursementStatus | null;
  reimbursed_amount: number;
  reimbursed_date: string | null;
  claim_reference: string;
  created_at: string;
  updated_at: string;
}

// --- Company Reimbursements ---

export type ReimbursementStatus = "pending" | "submitted" | "reimbursed" | "rejected";

export const REIMBURSEMENT_STATUS_LABELS: Record<ReimbursementStatus, string> = {
  pending: "To Submit",
  submitted: "Submitted",
  reimbursed: "Reimbursed",
  rejected: "Rejected",
};

/**
 * The part of an expense that counts as your own spending.
 * Reimbursable expenses count as zero until the claim is rejected, or as the
 * shortfall if the company paid back less than the amount spent.
 * Investments (SIPs, stocks) are savings, so they count as zero too.
 */
export function outOfPocket(
  e: Pick<Expense, "amount" | "category" | "is_reimbursable" | "reimbursement_status" | "reimbursed_amount">
): number {
  if (SAVINGS_CATEGORIES.includes(e.category)) return 0;
  const amount = Number(e.amount);
  if (!e.is_reimbursable || e.reimbursement_status === "rejected") return amount;
  if (e.reimbursement_status === "reimbursed") {
    return Math.max(0, amount - Number(e.reimbursed_amount || 0));
  }
  return 0;
}

/** Amount still expected back from the company for this expense. */
export function reimbursementDue(
  e: Pick<Expense, "amount" | "is_reimbursable" | "reimbursement_status">
): number {
  if (!e.is_reimbursable) return 0;
  return e.reimbursement_status === "pending" || e.reimbursement_status === "submitted"
    ? Number(e.amount)
    : 0;
}

// --- Rent & Home ---

export interface Rental {
  id: string;
  user_id: string;
  address: string;
  landlord_name: string;
  landlord_contact: string;
  monthly_rent: number;
  maintenance_charges: number;
  rent_due_day: number;
  security_deposit: number;
  lease_start: string | null;
  lease_end: string | null;
  annual_increment_pct: number;
  notice_period_days: number;
  created_at: string;
  updated_at: string;
}

// --- People & Loans (money between you and friends/family) ---
// Stored in the held_funds / held_fund_entries tables.

export type PersonRelation = "friend" | "family" | "colleague" | "other";

/**
 * holding  – they left money with you to keep; you give it back
 * borrowed – they lent you money / helped you out; you repay it
 * lent     – you lent them money; they pay you back
 */
export type LoanDirection = "holding" | "borrowed" | "lent";

export interface PersonLoanEntry {
  id: string;
  held_fund_id: string;
  user_id: string;
  /** in = money came to you, out = money left you */
  type: "in" | "out";
  amount: number;
  date: string;
  note: string;
  created_at: string;
}

export interface PersonLoan {
  id: string;
  user_id: string;
  person_name: string;
  relation: PersonRelation;
  direction: LoanDirection;
  purpose: string;
  expected_return_date: string | null;
  is_settled: boolean;
  created_at: string;
  updated_at: string;
}

export interface PersonLoanWithBalance extends PersonLoan {
  entries: PersonLoanEntry[];
  /** Original amount plus any top-ups. */
  total_principal: number;
  /** Amount paid back so far. */
  total_repaid: number;
  /** Still outstanding. You owe it for holding/borrowed; they owe you for lent. */
  balance: number;
}

/** Which entry type opens / adds to a record, and which one pays it back. */
export function loanEntryTypes(direction: LoanDirection) {
  return direction === "lent"
    ? { principal: "out" as const, repayment: "in" as const }
    : { principal: "in" as const, repayment: "out" as const };
}

export function loanBalance(direction: LoanDirection, entries: Pick<PersonLoanEntry, "type" | "amount">[]) {
  const { principal } = loanEntryTypes(direction);
  const total_principal = entries.filter((e) => e.type === principal).reduce((s, e) => s + Number(e.amount), 0);
  const total_repaid = entries.filter((e) => e.type !== principal).reduce((s, e) => s + Number(e.amount), 0);
  return { total_principal, total_repaid, balance: total_principal - total_repaid };
}

export const PERSON_RELATION_LABELS: Record<PersonRelation, string> = {
  friend: "Friend",
  family: "Family",
  colleague: "Colleague",
  other: "Other",
};

export const LOAN_DIRECTION_LABELS: Record<LoanDirection, string> = {
  holding: "Keeping for them",
  borrowed: "Borrowed from them",
  lent: "Lent to them",
};

// --- Income ---

export type IncomeType =
  | "salary"
  | "freelance"
  | "business"
  | "interest"
  | "rental"
  | "gift"
  | "refund"
  | "other";

export interface Income {
  id: string;
  user_id: string;
  amount: number;
  source: string;
  type: IncomeType;
  /** Date received (or expected, when is_received is false). */
  date: string;
  /** First day of the month this income belongs to, e.g. August salary paid in September → "2026-08-01". */
  for_month: string;
  is_received: boolean;
  note: string;
  created_at: string;
  updated_at: string;
}

export const INCOME_TYPE_LABELS: Record<IncomeType, string> = {
  salary: "Salary",
  freelance: "Freelance",
  business: "Business",
  interest: "Interest / Dividends",
  rental: "Rental Income",
  gift: "Gift (no need to return)",
  refund: "Refund / Cashback",
  other: "Other",
};

export const INCOME_TYPE_COLORS: Record<IncomeType, string> = {
  salary: "#16a34a",
  freelance: "#0891b2",
  business: "#2563eb",
  interest: "#7c3aed",
  rental: "#0f766e",
  gift: "#db2777",
  refund: "#ca8a04",
  other: "#64748b",
};

/** 50/30/20 split: categories counted as "needs"; everything else is "wants". */
export const NEEDS_CATEGORIES: readonly string[] = [
  "Rent",
  "Home & Maintenance",
  "Household Help",
  "Bills & Utilities",
  "Groceries",
  "Transport",
  "Health",
  "Education",
];

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

/** "loan" is kept for existing accounts; new loans belong in the Debt Tracker. */
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
  "Rent",
  "Home & Maintenance",
  "Household Help",
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
  "Personal Care",
  "Investments",
  "Miscellaneous",
] as const;

/**
 * Money moved into SIPs, stocks, FDs etc. It is recorded like an expense so the
 * cash trail is complete, but it is savings, not spending.
 */
export const SAVINGS_CATEGORIES: readonly string[] = ["Investments"];

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Categories that make up the fixed cost of living in a rented flat. */
export const HOUSING_CATEGORIES: readonly string[] = [
  "Rent",
  "Home & Maintenance",
  "Household Help",
  "Bills & Utilities",
];

export const CATEGORY_COLORS: Record<string, string> = {
  Rent: "#0f766e",
  "Home & Maintenance": "#a16207",
  "Household Help": "#7c3aed",
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
  "Personal Care": "#fb7185",
  Investments: "#16a34a",
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
