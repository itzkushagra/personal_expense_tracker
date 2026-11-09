-- SpendWise: income tracking and People & Loans
-- Run this in your Supabase SQL Editor after 002_rent_held_money_reimbursements.sql

-- 1. Income
CREATE TABLE IF NOT EXISTS incomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  source text NOT NULL,
  type text NOT NULL DEFAULT 'salary'
    CHECK (type IN ('salary', 'freelance', 'business', 'interest', 'rental', 'gift', 'refund', 'other')),
  date date NOT NULL DEFAULT CURRENT_DATE,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE incomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own incomes" ON incomes
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_incomes_user_date ON incomes(user_id, date DESC);

-- 2. People & Loans: held money now has a direction
--    holding  = they left money with you to keep (you owe it back)
--    borrowed = they lent/helped you with money you must repay (you owe it back)
--    lent     = you lent them money (they owe you)
ALTER TABLE held_funds
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'holding'
    CHECK (direction IN ('holding', 'borrowed', 'lent'));

-- Entries become direction-neutral: 'in' = money came to you, 'out' = money left you.
ALTER TABLE held_fund_entries DROP CONSTRAINT IF EXISTS held_fund_entries_type_check;
UPDATE held_fund_entries SET type = 'in' WHERE type = 'received';
UPDATE held_fund_entries SET type = 'out' WHERE type = 'returned';
ALTER TABLE held_fund_entries
  ADD CONSTRAINT held_fund_entries_type_check CHECK (type IN ('in', 'out'));
