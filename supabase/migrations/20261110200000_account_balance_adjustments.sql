-- SpendWise: auditable balance adjustments
--
-- "Match my bank balance" used to shift the account's opening balance so the calculated
-- balance equalled the bank's. That silently rewrote every past running balance and left no
-- record of the correction. Now each match adds one dated adjustment row instead: history
-- before it is unchanged, and the statement shows the adjustment and its size.
--
-- Additive only: one new table, no changes to existing rows. Safe to apply while the app runs.

CREATE TABLE IF NOT EXISTS account_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  -- Signed like every ledger flow: + money into the account, − money out of it.
  -- (For a credit card or loan, − means the amount owed went up.)
  amount numeric NOT NULL CHECK (amount <> 0),
  -- The calculated balance before the adjustment and the bank balance it was matched to,
  -- both in the account's own terms (amount owed for cards and loans).
  previous_balance numeric NOT NULL,
  new_balance numeric NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE account_adjustments ENABLE ROW LEVEL SECURITY;

-- Your own rows, and only against one of your own accounts.
CREATE POLICY "Users manage own account adjustments" ON account_adjustments
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM accounts a WHERE a.id = account_id AND a.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_account_adjustments_account ON account_adjustments(account_id, date);
