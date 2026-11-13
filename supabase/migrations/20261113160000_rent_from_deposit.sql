-- SpendWise: rent paid from the security deposit
--
-- During a notice period the landlord keeps the last months' rent out of the security deposit.
-- That rent is still spending (a Rent expense), but no money leaves a bank account, and the
-- deposit owed back to you goes down by the same amount.
--
-- expenses.paid_from_deposit = true marks such a rent expense. The deposit left is worked out as
-- rentals.security_deposit minus these expenses, so deleting or editing one keeps it right.
-- A deposit-paid expense has no bank account (it would otherwise be counted twice).
--
-- Additive: one boolean column with a default, and one check constraint.

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS paid_from_deposit boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_deposit_has_no_account') THEN
    ALTER TABLE expenses
      ADD CONSTRAINT expenses_deposit_has_no_account CHECK (NOT paid_from_deposit OR account_id IS NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_expenses_paid_from_deposit ON expenses(user_id) WHERE paid_from_deposit;
