-- SpendWise: Rent, money held for others, and company reimbursements
-- Run this in your Supabase SQL Editor after 0015_core_finance_tables.sql

-- 1. Rental details (one row per user)
CREATE TABLE IF NOT EXISTS rentals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  address text NOT NULL DEFAULT '',
  landlord_name text NOT NULL DEFAULT '',
  landlord_contact text NOT NULL DEFAULT '',
  monthly_rent numeric NOT NULL DEFAULT 0,
  maintenance_charges numeric NOT NULL DEFAULT 0,
  rent_due_day integer NOT NULL DEFAULT 1 CHECK (rent_due_day BETWEEN 1 AND 31),
  security_deposit numeric NOT NULL DEFAULT 0,
  lease_start date,
  lease_end date,
  annual_increment_pct numeric NOT NULL DEFAULT 0,
  notice_period_days integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rentals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own rental" ON rentals
  FOR ALL USING (auth.uid() = user_id);

-- 2. Money friends/family gave you to keep (you owe it back)
CREATE TABLE IF NOT EXISTS held_funds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_name text NOT NULL,
  relation text NOT NULL DEFAULT 'friend' CHECK (relation IN ('friend', 'family', 'colleague', 'other')),
  purpose text NOT NULL DEFAULT '',
  expected_return_date date,
  is_settled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE held_funds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own held funds" ON held_funds
  FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS held_fund_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  held_fund_id uuid NOT NULL REFERENCES held_funds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('received', 'returned')),
  amount numeric NOT NULL CHECK (amount > 0),
  date date NOT NULL DEFAULT CURRENT_DATE,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE held_fund_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own held fund entries" ON held_fund_entries
  FOR ALL USING (auth.uid() = user_id);

-- 3. Company reimbursement tracking on expenses
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS is_reimbursable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reimbursement_status text
    CHECK (reimbursement_status IN ('pending', 'submitted', 'reimbursed', 'rejected')),
  ADD COLUMN IF NOT EXISTS reimbursed_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reimbursed_date date,
  ADD COLUMN IF NOT EXISTS claim_reference text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_held_funds_user ON held_funds(user_id);
CREATE INDEX IF NOT EXISTS idx_held_fund_entries_fund ON held_fund_entries(held_fund_id);
CREATE INDEX IF NOT EXISTS idx_expenses_reimbursable ON expenses(user_id, reimbursement_status) WHERE is_reimbursable;
