/**
 * Columns each API route may write, per table.
 *
 * Routes used to spread the whole request body into the database write, so a
 * request could also set columns like id, user_id or created_at. Row-level
 * security still stopped anyone touching another user's rows, but only the
 * fields below are now accepted; anything else in the body is ignored.
 */
export const WRITABLE = {
  accounts: [
    "name", "type", "balance", "institution", "color", "is_active",
    "opening_balance", "opening_date", "is_default",
  ],
  debts: [
    "name", "type", "original_amount", "current_balance", "interest_rate",
    "minimum_payment", "due_day", "start_date", "expected_payoff_date", "is_active",
    "account_id",
  ],
  budgets: ["category", "amount", "period", "start_date", "end_date", "alert_threshold", "is_active"],
  goals: ["name", "target_amount", "current_amount", "priority", "deadline", "icon", "color", "is_completed"],
  bills: [
    "name", "amount", "category", "frequency", "due_day", "next_due_date",
    "is_auto_pay", "is_active", "reminder_days_before",
    "account_id", "kind", "to_account_id", "debt_id",
  ],
  bill_payments: ["amount_paid", "paid_date", "status"],
  rentals: [
    "address", "landlord_name", "landlord_contact", "monthly_rent", "maintenance_charges",
    "rent_due_day", "security_deposit", "lease_start", "lease_end", "annual_increment_pct",
    "notice_period_days",
  ],
} as const;

/** Copy only the allowed keys that are present in the body. */
export function pick(body: unknown, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!body || typeof body !== "object") return out;
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(body, f)) out[f] = (body as Record<string, unknown>)[f];
  }
  return out;
}
