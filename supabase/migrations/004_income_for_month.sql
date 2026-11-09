-- SpendWise: attribute income to the month it was earned, and track expected income
-- Run this in your Supabase SQL Editor after 003_income_and_people_loans.sql
--
-- for_month   = first day of the month the income belongs to
--               (e.g. August salary paid on 10 September -> 2026-08-01)
-- is_received = false for income you're still waiting on (pending salary, F&F)

ALTER TABLE incomes
  ADD COLUMN IF NOT EXISTS for_month date,
  ADD COLUMN IF NOT EXISTS is_received boolean NOT NULL DEFAULT true;

UPDATE incomes SET for_month = date_trunc('month', date)::date WHERE for_month IS NULL;

ALTER TABLE incomes
  ALTER COLUMN for_month SET DEFAULT date_trunc('month', CURRENT_DATE)::date,
  ALTER COLUMN for_month SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_incomes_user_for_month ON incomes(user_id, for_month DESC);
