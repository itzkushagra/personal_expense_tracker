-- SpendWise: manual investment portfolio
--
-- Holdings (a fund, stock, FD, gold...) and their buy / sell transactions. A buy moves cash
-- from an account into the holding, so net worth is unchanged at cost; the holding's value
-- (quantity × the price you last entered) is counted as an asset. Purchases are not expenses
-- and never appear in spending.
--
-- "opening" records units you already own (for example bought before this feature, possibly
-- logged as an "Investments" expense): it adds the holding at cost without moving any cash.
--
-- Additive only: two new tables, no changes to existing rows. Existing "Investments"
-- expenses are left exactly as they are.

CREATE TABLE IF NOT EXISTS investment_holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  asset_type text NOT NULL DEFAULT 'mutual_fund'
    CHECK (asset_type IN ('mutual_fund', 'stock', 'etf', 'bond', 'fixed_deposit', 'gold', 'crypto', 'retirement', 'other')),
  symbol text NOT NULL DEFAULT '',
  -- Latest price per unit you entered; NULL means "value at cost" until you enter one.
  current_price numeric CHECK (current_price IS NULL OR current_price >= 0),
  valued_on date,
  note text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE investment_holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own investment holdings" ON investment_holdings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS investment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  holding_id uuid NOT NULL REFERENCES investment_holdings(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('buy', 'sell', 'opening')),
  date date NOT NULL DEFAULT CURRENT_DATE,
  quantity numeric NOT NULL CHECK (quantity > 0),
  -- Price per unit. Cash moved: buy = quantity × price + fees; sell = quantity × price − fees.
  price numeric NOT NULL CHECK (price >= 0),
  fees numeric NOT NULL DEFAULT 0 CHECK (fees >= 0),
  -- Account the cash came from (buy) or went to (sell). NULL = cash not tracked here.
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Units you already owned didn't move any cash now.
  CHECK (type <> 'opening' OR account_id IS NULL)
);

ALTER TABLE investment_transactions ENABLE ROW LEVEL SECURITY;
-- Your own rows, only on your own holding, and only from / to your own account.
CREATE POLICY "Users manage own investment transactions" ON investment_transactions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM investment_holdings h WHERE h.id = holding_id AND h.user_id = auth.uid())
    AND (account_id IS NULL OR EXISTS (SELECT 1 FROM accounts a WHERE a.id = account_id AND a.user_id = auth.uid()))
  );

CREATE INDEX IF NOT EXISTS idx_investment_holdings_user ON investment_holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_investment_transactions_holding ON investment_transactions(holding_id, date);
CREATE INDEX IF NOT EXISTS idx_investment_transactions_account ON investment_transactions(account_id) WHERE account_id IS NOT NULL;
