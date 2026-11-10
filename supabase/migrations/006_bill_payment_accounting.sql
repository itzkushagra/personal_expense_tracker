-- SpendWise: correct accounting for credit card bills and loan EMIs
-- Run this in your Supabase SQL Editor after 005_account_ledger.sql
--
-- Before: marking any bill paid recorded the full amount as an expense, so a
-- credit card bill double-counted the purchases already made on the card and a
-- loan EMI counted its principal as spending.
--
-- After, a bill has a kind:
--   expense      - a normal bill (electricity, Netflix): the payment is an expense (unchanged)
--   credit_card  - paying a card: a transfer to the card account, or a reduction of a
--                  Debt Tracker card balance; never an expense
--   loan_emi     - an EMI on a Debt Tracker loan: principal reduces the loan,
--                  only interest is an expense
-- Each payment is written by one function call, so it is saved completely or not at all.
-- Existing bills and payments keep working unchanged (kind defaults to 'expense').

-- 1. What kind of bill, and what it pays off
ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'expense'
    CHECK (kind IN ('expense', 'credit_card', 'loan_emi')),
  ADD COLUMN IF NOT EXISTS to_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS debt_id uuid REFERENCES debts(id) ON DELETE SET NULL;

-- 2. What each payment did, so it can be shown and reversed exactly
ALTER TABLE bill_payments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'expense'
    CHECK (kind IN ('expense', 'credit_card', 'loan_emi')),
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS principal_amount numeric NOT NULL DEFAULT 0 CHECK (principal_amount >= 0),
  ADD COLUMN IF NOT EXISTS interest_amount numeric NOT NULL DEFAULT 0 CHECK (interest_amount >= 0),
  ADD COLUMN IF NOT EXISTS debt_id uuid REFERENCES debts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expense_id uuid REFERENCES expenses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transfer_id uuid REFERENCES transfers(id) ON DELETE SET NULL;

ALTER TABLE bill_payments DROP CONSTRAINT IF EXISTS bill_payments_split_check;
ALTER TABLE bill_payments ADD CONSTRAINT bill_payments_split_check
  CHECK (principal_amount + interest_amount <= amount_paid + 0.01);

CREATE INDEX IF NOT EXISTS idx_bill_payments_debt ON bill_payments(debt_id) WHERE debt_id IS NOT NULL;

-- 3. Record a payment atomically. Runs with the caller's permissions, so row-level
--    security still limits every read and write to the signed-in user's rows.
CREATE OR REPLACE FUNCTION record_bill_payment(
  p_bill_id uuid,
  p_amount numeric,
  p_paid_date date,
  p_status text DEFAULT 'paid',
  p_account_id uuid DEFAULT NULL,
  p_create_expense boolean DEFAULT true,
  p_principal numeric DEFAULT NULL,
  p_interest numeric DEFAULT NULL
) RETURNS bill_payments
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_bill bills;
  v_account uuid;
  v_principal numeric := 0;
  v_interest numeric := 0;
  v_debt uuid;
  v_expense uuid;
  v_transfer uuid;
  v_payment bill_payments;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill not found';
  END IF;

  v_account := COALESCE(p_account_id, v_bill.account_id);
  IF v_account IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounts WHERE id = v_account AND user_id = v_uid) THEN
    RAISE EXCEPTION 'Pay-from account not found';
  END IF;

  IF v_bill.kind = 'expense' THEN
    IF p_create_expense THEN
      INSERT INTO expenses (user_id, amount, description, category, date, input_method, ai_categorized, is_recurring, account_id)
      VALUES (v_uid, p_amount, v_bill.name, COALESCE(v_bill.category, 'Bills & Utilities'), p_paid_date, 'manual', false, true, v_account)
      RETURNING id INTO v_expense;
    END IF;

  ELSIF v_bill.kind = 'credit_card' THEN
    -- Paying a card reduces what you owe on it; the purchases were already expenses.
    v_principal := p_amount;
    IF v_bill.to_account_id IS NOT NULL THEN
      IF v_account IS NULL THEN
        RAISE EXCEPTION 'Choose the account you paid the card from';
      END IF;
      IF v_account = v_bill.to_account_id THEN
        RAISE EXCEPTION 'Pay-from account cannot be the card itself';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM accounts WHERE id = v_bill.to_account_id AND user_id = v_uid) THEN
        RAISE EXCEPTION 'Card account not found';
      END IF;
      INSERT INTO transfers (user_id, from_account_id, to_account_id, amount, date, note)
      VALUES (v_uid, v_account, v_bill.to_account_id, p_amount, p_paid_date, 'Card payment: ' || v_bill.name)
      RETURNING id INTO v_transfer;
    ELSIF v_bill.debt_id IS NOT NULL THEN
      v_debt := v_bill.debt_id;
    ELSE
      RAISE EXCEPTION 'Link this card bill to a credit card account or a Debt Tracker entry';
    END IF;

  ELSIF v_bill.kind = 'loan_emi' THEN
    IF v_bill.debt_id IS NULL THEN
      RAISE EXCEPTION 'Link this EMI to a loan in the Debt Tracker';
    END IF;
    v_debt := v_bill.debt_id;
    v_interest := COALESCE(p_interest, 0);
    v_principal := COALESCE(p_principal, p_amount - v_interest);
    IF v_principal < 0 OR v_interest < 0 OR abs(v_principal + v_interest - p_amount) > 0.01 THEN
      RAISE EXCEPTION 'Principal and interest must add up to the EMI amount';
    END IF;
    IF v_interest > 0 THEN
      INSERT INTO expenses (user_id, amount, description, category, date, input_method, ai_categorized, is_recurring, account_id)
      VALUES (v_uid, v_interest, v_bill.name || ' (interest)', COALESCE(v_bill.category, 'Bills & Utilities'), p_paid_date, 'manual', false, true, v_account)
      RETURNING id INTO v_expense;
    END IF;
  END IF;

  IF v_debt IS NOT NULL THEN
    UPDATE debts
       SET current_balance = current_balance - v_principal, updated_at = now()
     WHERE id = v_debt AND user_id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linked Debt Tracker entry not found';
    END IF;
  END IF;

  INSERT INTO bill_payments (bill_id, user_id, amount_paid, paid_date, status, kind, account_id,
                             principal_amount, interest_amount, debt_id, expense_id, transfer_id)
  VALUES (v_bill.id, v_uid, p_amount, p_paid_date, COALESCE(p_status, 'paid'), v_bill.kind, v_account,
          v_principal, v_interest, v_debt, v_expense, v_transfer)
  RETURNING * INTO v_payment;

  UPDATE bills
     SET next_due_date = (v_bill.next_due_date + CASE v_bill.frequency
                            WHEN 'weekly' THEN interval '7 days'
                            WHEN 'quarterly' THEN interval '3 months'
                            WHEN 'yearly' THEN interval '1 year'
                            ELSE interval '1 month' END)::date,
         updated_at = now()
   WHERE id = v_bill.id;

  RETURN v_payment;
END;
$$;

-- 4. Delete a payment record and undo what it did to balances: the card transfer is
--    removed and the loan principal is added back. An expense it created stays in
--    Expenses (as before this migration) and can be deleted there.
CREATE OR REPLACE FUNCTION delete_bill_payment(p_payment_id uuid) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_payment bill_payments;
BEGIN
  SELECT * INTO v_payment FROM bill_payments WHERE id = p_payment_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  IF v_payment.transfer_id IS NOT NULL THEN
    DELETE FROM transfers WHERE id = v_payment.transfer_id AND user_id = v_uid;
  END IF;
  IF v_payment.debt_id IS NOT NULL AND v_payment.principal_amount > 0 THEN
    UPDATE debts
       SET current_balance = current_balance + v_payment.principal_amount, updated_at = now()
     WHERE id = v_payment.debt_id AND user_id = v_uid;
  END IF;

  DELETE FROM bill_payments WHERE id = p_payment_id AND user_id = v_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION record_bill_payment(uuid, numeric, date, text, uuid, boolean, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_bill_payment(uuid) TO authenticated;

-- Let the API see the new columns and functions straight away.
NOTIFY pgrst, 'reload schema';
