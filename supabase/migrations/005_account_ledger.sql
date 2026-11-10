-- SpendWise: account ledger — link every rupee to an account
-- Run this in your Supabase SQL Editor after 004_income_for_month.sql
--
-- An account's balance is now calculated:
--   opening_balance (as of opening_date)
--   + money in  (received income, loan entries "in", reimbursement payouts, transfers in)
--   - money out (expenses, loan entries "out", transfers out)
-- For credit cards and loans the balance is the amount owed, so spending raises it.

-- 1. Accounts: cash & wallet types, opening balance, default account
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_type_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_type_check
  CHECK (type IN ('checking', 'savings', 'cash', 'wallet', 'credit_card', 'loan', 'investment'));

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS opening_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_date date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- Existing accounts keep their typed-in balance as the starting point from today.
UPDATE accounts SET opening_balance = balance WHERE opening_balance = 0 AND balance <> 0;

-- 2. Which account money moved through
ALTER TABLE incomes ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE held_fund_entries ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reimbursed_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;

-- 3. Transfers between your own accounts (ATM withdrawal, card bill payment, moving to savings, SIP account)
CREATE TABLE IF NOT EXISTS transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  to_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  date date NOT NULL DEFAULT CURRENT_DATE,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_account_id <> to_account_id)
);

ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own transfers" ON transfers
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_incomes_account ON incomes(account_id);
CREATE INDEX IF NOT EXISTS idx_held_fund_entries_account ON held_fund_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_expenses_reimbursed_account ON expenses(reimbursed_account_id);
CREATE INDEX IF NOT EXISTS idx_transfers_user ON transfers(user_id, date DESC);
