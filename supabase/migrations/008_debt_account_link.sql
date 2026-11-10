-- SpendWise: count each card or loan exactly once; cap EMI principal at what is owed
-- Run this in your Supabase SQL Editor after 007_bill_payment_integrity.sql
--
-- Before: net worth counted every account AND every Debt Tracker entry, skipping an
-- entry only when its name exactly matched some account's name. A card added as
-- "HDFC Card" (account) and "HDFC Credit Card" (Debt Tracker) was counted twice, and
-- a loan named like a savings account was wrongly left out.
--
-- After: a Debt Tracker entry can be linked to the credit card or loan ACCOUNT it
-- describes (debts.account_id). A linked entry's liability is the account's balance and
-- is counted once, through the account. Bill payments against a linked entry move the
-- principal to that account as a transfer, so the liability that is counted goes down.
--
-- Data: existing entries are linked only where exactly one credit card / loan account
-- has the same name (the pairs the old rule already treated as one). No amounts change.

-- 1. The link
ALTER TABLE debts ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;

-- 2. Only to your own credit card or loan account
CREATE OR REPLACE FUNCTION debts_check_account_link() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM accounts WHERE id = NEW.account_id AND user_id = NEW.user_id AND type IN ('credit_card', 'loan')
  ) THEN
    RAISE EXCEPTION 'A Debt Tracker entry can only be linked to one of your credit card or loan accounts';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS debts_check_account_link ON debts;
CREATE TRIGGER debts_check_account_link
  BEFORE INSERT OR UPDATE OF account_id, user_id ON debts
  FOR EACH ROW EXECUTE FUNCTION debts_check_account_link();

-- 3. Link existing one-to-one same-name pairs
WITH pairs AS (
  SELECT d.id AS debt_id, a.id AS account_id
    FROM debts d
    JOIN accounts a ON a.user_id = d.user_id
                   AND a.type IN ('credit_card', 'loan')
                   AND lower(trim(a.name)) = lower(trim(d.name))
   WHERE d.account_id IS NULL
), unique_pairs AS (
  SELECT debt_id, account_id FROM pairs p
   WHERE (SELECT count(*) FROM pairs WHERE debt_id = p.debt_id) = 1
     AND (SELECT count(*) FROM pairs WHERE account_id = p.account_id) = 1
)
UPDATE debts d SET account_id = u.account_id
  FROM unique_pairs u
 WHERE d.id = u.debt_id
   AND NOT EXISTS (SELECT 1 FROM debts x WHERE x.account_id = u.account_id);

-- 4. One Debt Tracker entry per account
CREATE UNIQUE INDEX IF NOT EXISTS uq_debts_account ON debts(account_id) WHERE account_id IS NOT NULL;

-- 5. record_bill_payment: same inputs and result as migration 007, plus
--    - a card or EMI bill whose Debt Tracker entry is linked to an account pays that account
--      (a transfer), instead of lowering the entry's own balance;
--    - EMI principal may not exceed the outstanding balance of an unlinked loan.
CREATE OR REPLACE FUNCTION record_bill_payment(
  p_bill_id uuid,
  p_amount numeric,
  p_paid_date date,
  p_status text DEFAULT 'paid',
  p_account_id uuid DEFAULT NULL,
  p_create_expense boolean DEFAULT true,
  p_principal numeric DEFAULT NULL,
  p_interest numeric DEFAULT NULL,
  p_fees numeric DEFAULT 0,
  p_occurrence_date date DEFAULT NULL,
  p_settles boolean DEFAULT NULL,       -- NULL = settle once part payments reach the bill amount
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_bill bills;
  v_existing bill_payments;
  v_occurrence date;
  v_paid_before numeric;
  v_settles boolean;
  v_account uuid;
  v_principal numeric := 0;
  v_interest numeric := 0;
  v_fees numeric := 0;
  v_debt uuid;
  v_debt_account uuid;      -- account the bill's Debt Tracker entry is linked to
  v_outstanding numeric;    -- that entry's own balance (used when it is not linked)
  v_target uuid;            -- account a card or EMI principal is transferred to
  v_expense uuid;
  v_fee_expense uuid;
  v_transfer uuid;
  v_next date;
  v_guard integer := 0;
  v_payment bill_payments;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  -- Lock the bill: concurrent payments for it run one after the other.
  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill not found';
  END IF;

  -- A retried request returns the payment it already made.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM bill_payments WHERE user_id = v_uid AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      IF v_existing.bill_id <> p_bill_id THEN
        RAISE EXCEPTION 'This request id was already used for another bill' USING ERRCODE = 'SW409';
      END IF;
      RETURN jsonb_build_object('payment', to_jsonb(v_existing), 'replayed', true);
    END IF;
  END IF;

  v_occurrence := COALESCE(p_occurrence_date, v_bill.next_due_date);
  IF EXISTS (
    SELECT 1 FROM bill_payments
     WHERE bill_id = v_bill.id AND occurrence_date = v_occurrence
       AND settles_occurrence AND reversed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'The bill due on % is already paid', to_char(v_occurrence, 'DD Mon YYYY') USING ERRCODE = 'SW409';
  END IF;

  SELECT COALESCE(sum(amount_paid), 0) INTO v_paid_before FROM bill_payments
   WHERE bill_id = v_bill.id AND occurrence_date = v_occurrence AND reversed_at IS NULL;
  v_settles := COALESCE(p_settles, v_paid_before + p_amount >= v_bill.amount - 0.005);

  v_account := COALESCE(p_account_id, v_bill.account_id);
  IF v_account IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounts WHERE id = v_account AND user_id = v_uid) THEN
    RAISE EXCEPTION 'Pay-from account not found';
  END IF;
  IF COALESCE(p_fees, 0) > 0 AND v_bill.kind <> 'loan_emi' THEN
    RAISE EXCEPTION 'Charges can only be recorded on a loan EMI';
  END IF;

  IF v_bill.kind <> 'expense' AND v_bill.debt_id IS NOT NULL THEN
    SELECT account_id, current_balance INTO v_debt_account, v_outstanding
      FROM debts WHERE id = v_bill.debt_id AND user_id = v_uid FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linked Debt Tracker entry not found';
    END IF;
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
    v_target := COALESCE(v_bill.to_account_id, v_debt_account);
    IF v_target IS NULL AND v_bill.debt_id IS NOT NULL THEN
      v_debt := v_bill.debt_id;
    ELSIF v_target IS NULL THEN
      RAISE EXCEPTION 'Link this card bill to a credit card account or a Debt Tracker entry';
    END IF;

  ELSIF v_bill.kind = 'loan_emi' THEN
    IF v_bill.debt_id IS NULL THEN
      RAISE EXCEPTION 'Link this EMI to a loan in the Debt Tracker';
    END IF;
    v_interest := COALESCE(p_interest, 0);
    v_fees := COALESCE(p_fees, 0);
    v_principal := COALESCE(p_principal, p_amount - v_interest - v_fees);
    IF v_principal < 0 OR v_interest < 0 OR v_fees < 0 OR abs(v_principal + v_interest + v_fees - p_amount) > 0.005 THEN
      RAISE EXCEPTION 'Principal, interest and charges must add up to the amount paid';
    END IF;
    IF v_debt_account IS NOT NULL THEN
      -- Linked to a loan account: the principal pays that account (its balance is checked by the app).
      v_target := v_debt_account;
    ELSE
      IF v_principal > v_outstanding + 0.005 THEN
        RAISE EXCEPTION 'Principal of % is more than the % still owed on this loan', v_principal, v_outstanding;
      END IF;
      v_debt := v_bill.debt_id;
    END IF;
    IF v_interest > 0 THEN
      INSERT INTO expenses (user_id, amount, description, category, date, input_method, ai_categorized, is_recurring, account_id)
      VALUES (v_uid, v_interest, v_bill.name || ' (interest)', COALESCE(v_bill.category, 'Bills & Utilities'), p_paid_date, 'manual', false, true, v_account)
      RETURNING id INTO v_expense;
    END IF;
    IF v_fees > 0 THEN
      INSERT INTO expenses (user_id, amount, description, category, date, input_method, ai_categorized, is_recurring, account_id)
      VALUES (v_uid, v_fees, v_bill.name || ' (charges)', COALESCE(v_bill.category, 'Bills & Utilities'), p_paid_date, 'manual', false, true, v_account)
      RETURNING id INTO v_fee_expense;
    END IF;
  END IF;

  -- Card or EMI principal paid to a card / loan account is a transfer between your accounts.
  IF v_target IS NOT NULL AND v_principal > 0 THEN
    IF v_account IS NULL THEN
      RAISE EXCEPTION '%', CASE WHEN v_bill.kind = 'credit_card'
        THEN 'Choose the account you paid the card from' ELSE 'Choose the account you paid the EMI from' END;
    END IF;
    IF v_account = v_target THEN
      RAISE EXCEPTION 'Pay-from account cannot be the card or loan itself';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE id = v_target AND user_id = v_uid) THEN
      RAISE EXCEPTION 'Card or loan account not found';
    END IF;
    INSERT INTO transfers (user_id, from_account_id, to_account_id, amount, date, note)
    VALUES (v_uid, v_account, v_target, v_principal, p_paid_date,
            CASE WHEN v_bill.kind = 'credit_card' THEN 'Card payment: ' ELSE 'EMI principal: ' END || v_bill.name)
    RETURNING id INTO v_transfer;
  END IF;

  IF v_debt IS NOT NULL THEN
    UPDATE debts
       SET current_balance = current_balance - v_principal, updated_at = now()
     WHERE id = v_debt AND user_id = v_uid;
  END IF;

  INSERT INTO bill_payments (bill_id, user_id, amount_paid, paid_date, status, kind, account_id,
                             principal_amount, interest_amount, fees_amount, debt_id, expense_id, fee_expense_id,
                             transfer_id, occurrence_date, settles_occurrence, idempotency_key)
  VALUES (v_bill.id, v_uid, p_amount, p_paid_date, COALESCE(p_status, 'paid'), v_bill.kind, v_account,
          v_principal, v_interest, v_fees, v_debt, v_expense, v_fee_expense,
          v_transfer, v_occurrence, v_settles, p_idempotency_key)
  RETURNING * INTO v_payment;

  -- Settling the bill's current due date moves it to the next due date not already paid.
  IF v_settles AND v_occurrence = v_bill.next_due_date THEN
    v_next := bill_advance_due(v_occurrence, v_bill.frequency, v_bill.due_day);
    WHILE EXISTS (
      SELECT 1 FROM bill_payments
       WHERE bill_id = v_bill.id AND occurrence_date = v_next AND settles_occurrence AND reversed_at IS NULL
    ) AND v_guard < 1000 LOOP
      v_next := bill_advance_due(v_next, v_bill.frequency, v_bill.due_day);
      v_guard := v_guard + 1;
    END LOOP;
    UPDATE bills SET next_due_date = v_next, updated_at = now() WHERE id = v_bill.id;
  END IF;

  RETURN jsonb_build_object('payment', to_jsonb(v_payment), 'replayed', false);
END;
$$;

GRANT EXECUTE ON FUNCTION record_bill_payment(uuid, numeric, date, text, uuid, boolean, numeric, numeric, numeric, date, boolean, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
