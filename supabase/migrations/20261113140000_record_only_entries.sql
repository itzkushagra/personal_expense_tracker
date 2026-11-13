-- SpendWise: record-only entries
--
-- An income, People & Loans entry or investment buy/sale can name the account the money sits in
-- without moving that account's balance. Use it when the money is already part of the balance
-- (for example a friend's money that arrived before you set the account's opening balance) and
-- you are only recording what it is.
--
-- moves_balance = true  (default): the entry adds to / takes from the account, as before.
-- moves_balance = false: the entry is kept for the record; the account balance is unchanged.
--
-- Additive: one boolean column with a default per table. Existing rows keep today's behaviour.

ALTER TABLE incomes ADD COLUMN IF NOT EXISTS moves_balance boolean NOT NULL DEFAULT true;
ALTER TABLE held_fund_entries ADD COLUMN IF NOT EXISTS moves_balance boolean NOT NULL DEFAULT true;
ALTER TABLE investment_transactions ADD COLUMN IF NOT EXISTS moves_balance boolean NOT NULL DEFAULT true;
