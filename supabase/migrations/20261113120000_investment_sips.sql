-- SpendWise: monthly SIPs and fund categories
--
-- 1. investment_holdings.fund_category: large / mid / small cap, flexi cap, ELSS, index, debt...
--    so a portfolio with several cap-based funds shows its split by category.
-- 2. investment_sips: a monthly plan (fund, amount, day of month, account it's paid from).
-- 3. investment_transactions.sip_id: the instalment a buy belongs to. A unique index allows one
--    instalment per SIP per month, so logging the same month twice is refused.
--
-- Additive: one new column with a default, one new table, one new nullable column, one index.
-- The transactions policy is recreated with the same rules plus a check on sip_id.

ALTER TABLE investment_holdings
  ADD COLUMN IF NOT EXISTS fund_category text NOT NULL DEFAULT ''
    CHECK (fund_category IN (
      '', 'large_cap', 'mid_cap', 'small_cap', 'large_mid_cap', 'flexi_cap', 'multi_cap', 'focused',
      'value', 'elss', 'index', 'sectoral', 'international', 'hybrid', 'debt', 'liquid', 'gold_silver', 'other'
    ));

CREATE TABLE IF NOT EXISTS investment_sips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  holding_id uuid NOT NULL REFERENCES investment_holdings(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  -- Day the instalment is debited; 29–31 fall on the month's last day in shorter months.
  day_of_month integer NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  is_active boolean NOT NULL DEFAULT true,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE investment_sips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own investment SIPs" ON investment_sips
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM investment_holdings h WHERE h.id = holding_id AND h.user_id = auth.uid())
    AND (account_id IS NULL OR EXISTS (SELECT 1 FROM accounts a WHERE a.id = account_id AND a.user_id = auth.uid()))
  );

CREATE INDEX IF NOT EXISTS idx_investment_sips_user ON investment_sips(user_id);

ALTER TABLE investment_transactions
  ADD COLUMN IF NOT EXISTS sip_id uuid REFERENCES investment_sips(id) ON DELETE SET NULL;

-- One instalment per SIP per calendar month.
CREATE UNIQUE INDEX IF NOT EXISTS uq_investment_transactions_sip_month
  ON investment_transactions (sip_id, (date_trunc('month', date::timestamp)))
  WHERE sip_id IS NOT NULL;

-- Same rules as before, plus: an instalment can only point at your own SIP for the same fund.
DROP POLICY IF EXISTS "Users manage own investment transactions" ON investment_transactions;
CREATE POLICY "Users manage own investment transactions" ON investment_transactions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM investment_holdings h WHERE h.id = holding_id AND h.user_id = auth.uid())
    AND (account_id IS NULL OR EXISTS (SELECT 1 FROM accounts a WHERE a.id = account_id AND a.user_id = auth.uid()))
    AND (
      sip_id IS NULL
      OR EXISTS (
        SELECT 1 FROM investment_sips s
         WHERE s.id = investment_transactions.sip_id
           AND s.user_id = auth.uid()
           AND s.holding_id = investment_transactions.holding_id
      )
    )
  );
