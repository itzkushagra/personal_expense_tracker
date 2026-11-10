-- SpendWise: bill payment integrity — reversals, duplicate prevention, full allocation
-- Run this in your Supabase SQL Editor after 006_bill_payment_accounting.sql
--
-- 1. Reversal instead of deletion. A payment is marked reversed (kept for history)
--    and everything it did is undone in one transaction: its expense(s), its card
--    transfer, the loan principal, and the bill's due date.
-- 2. Every payment belongs to one due date ("occurrence"). Only one settling payment
--    may exist per bill and due date; part payments are allowed until it is settled.
--    Requests carry an idempotency key, so a retried request returns the original
--    payment instead of creating another.
-- 3. Every rupee is allocated: principal + interest + charges = amount for EMIs,
--    principal = amount for card payments, no split for regular bills.
--
-- Replaces functions only (no data is removed). Existing payment rows keep working:
-- they have no occurrence date, so they are left out of the duplicate rule.

-- 1. New payment columns
ALTER TABLE bill_payments
  ADD COLUMN IF NOT EXISTS occurrence_date date,
  ADD COLUMN IF NOT EXISTS settles_occurrence boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS fees_amount numeric NOT NULL DEFAULT 0 CHECK (fees_amount >= 0),
  ADD COLUMN IF NOT EXISTS fee_expense_id uuid REFERENCES expenses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key uuid,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversal_reason text,
  ADD COLUMN IF NOT EXISTS reversal_snapshot jsonb;

-- 2. Every rupee allocated, by kind (replaces 006's "parts <= amount" rule)
ALTER TABLE bill_payments DROP CONSTRAINT IF EXISTS bill_payments_split_check;
ALTER TABLE bill_payments DROP CONSTRAINT IF EXISTS bill_payments_allocation_check;
ALTER TABLE bill_payments ADD CONSTRAINT bill_payments_allocation_check CHECK (
  CASE kind
    WHEN 'expense' THEN principal_amount = 0 AND interest_amount = 0 AND fees_amount = 0
    WHEN 'credit_card' THEN principal_amount = amount_paid AND interest_amount = 0 AND fees_amount = 0
    WHEN 'loan_emi' THEN abs(principal_amount + interest_amount + fees_amount - amount_paid) <= 0.005
    ELSE false
  END
);

-- 3. Duplicate protection
CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_payments_idempotency
  ON bill_payments(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
-- One live settling payment per bill and due date (part payments and reversed rows excluded).
CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_payments_settled_occurrence
  ON bill_payments(bill_id, occurrence_date)
  WHERE settles_occurrence AND reversed_at IS NULL AND occurrence_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bill_payments_occurrence ON bill_payments(bill_id, occurrence_date) WHERE reversed_at IS NULL;

-- 4. Due-date arithmetic anchored to the bill's due day (31 Jan -> 28 Feb -> 31 Mar, no drift)
CREATE OR REPLACE FUNCTION bill_advance_due(p_date date, p_frequency text, p_due_day integer)
RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_months integer;
  v_month_start date;
  v_last_day integer;
BEGIN
  IF p_frequency = 'weekly' THEN
    RETURN p_date + 7;
  END IF;
  v_months := CASE p_frequency WHEN 'quarterly' THEN 3 WHEN 'yearly' THEN 12 ELSE 1 END;
  v_month_start := (date_trunc('month', p_date) + make_interval(months => v_months))::date;
  v_last_day := extract(day FROM (v_month_start + interval '1 month' - interval '1 day'))::integer;
  RETURN v_month_start + (least(greatest(coalesce(p_due_day, extract(day FROM p_date)::integer), 1), v_last_day) - 1);
END;
$$;

-- 5. Record a payment (replaces 006's version: adds idempotency, due dates, part payments, charges)
DROP FUNCTION IF EXISTS record_bill_payment(uuid, numeric, date, text, uuid, boolean, numeric, numeric);

CREATE FUNCTION record_bill_payment(
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
    v_fees := COALESCE(p_fees, 0);
    v_principal := COALESCE(p_principal, p_amount - v_interest - v_fees);
    IF v_principal < 0 OR v_interest < 0 OR v_fees < 0 OR abs(v_principal + v_interest + v_fees - p_amount) > 0.005 THEN
      RAISE EXCEPTION 'Principal, interest and charges must add up to the amount paid';
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

  IF v_debt IS NOT NULL THEN
    UPDATE debts
       SET current_balance = current_balance - v_principal, updated_at = now()
     WHERE id = v_debt AND user_id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linked Debt Tracker entry not found';
    END IF;
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

-- 6. Reverse a payment (replaces 006's delete_bill_payment). The payment row is kept,
--    marked reversed, with a copy of everything that was undone.
DROP FUNCTION IF EXISTS delete_bill_payment(uuid);

CREATE OR REPLACE FUNCTION reverse_bill_payment(p_payment_id uuid, p_reason text DEFAULT NULL)
RETURNS bill_payments
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_payment bill_payments;
  v_bill bills;
  v_debt_before numeric;
  v_next_before date;
  v_snapshot jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  -- Lock the bill first (same order as record_bill_payment, so the two never deadlock).
  SELECT b.* INTO v_bill FROM bills b
    JOIN bill_payments p ON p.bill_id = b.id
   WHERE p.id = p_payment_id AND p.user_id = v_uid
   FOR UPDATE OF b;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;
  SELECT * INTO v_payment FROM bill_payments WHERE id = p_payment_id AND user_id = v_uid FOR UPDATE;
  IF v_payment.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This payment was already reversed' USING ERRCODE = 'SW409';
  END IF;
  -- Part payments are undone latest-first: while the payment that settled this due date
  -- stands, an earlier part of it can't be removed (the due date would read as paid but short).
  IF NOT v_payment.settles_occurrence AND v_payment.occurrence_date IS NOT NULL AND EXISTS (
    SELECT 1 FROM bill_payments
     WHERE bill_id = v_bill.id AND occurrence_date = v_payment.occurrence_date
       AND settles_occurrence AND reversed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Reverse the payment that completed this due date first' USING ERRCODE = 'SW409';
  END IF;
  v_next_before := v_bill.next_due_date;

  v_snapshot := jsonb_build_object(
    'expense', (SELECT to_jsonb(e) FROM expenses e WHERE e.id = v_payment.expense_id),
    'fee_expense', (SELECT to_jsonb(e) FROM expenses e WHERE e.id = v_payment.fee_expense_id),
    'transfer', (SELECT to_jsonb(t) FROM transfers t WHERE t.id = v_payment.transfer_id),
    'next_due_before', v_next_before
  );

  IF v_payment.expense_id IS NOT NULL THEN
    DELETE FROM expenses WHERE id = v_payment.expense_id AND user_id = v_uid;
  END IF;
  IF v_payment.fee_expense_id IS NOT NULL THEN
    DELETE FROM expenses WHERE id = v_payment.fee_expense_id AND user_id = v_uid;
  END IF;
  IF v_payment.transfer_id IS NOT NULL THEN
    DELETE FROM transfers WHERE id = v_payment.transfer_id AND user_id = v_uid;
  END IF;
  IF v_payment.debt_id IS NOT NULL AND v_payment.principal_amount > 0 THEN
    SELECT current_balance INTO v_debt_before FROM debts WHERE id = v_payment.debt_id AND user_id = v_uid FOR UPDATE;
    UPDATE debts
       SET current_balance = current_balance + v_payment.principal_amount, updated_at = now()
     WHERE id = v_payment.debt_id AND user_id = v_uid;
    v_snapshot := v_snapshot || jsonb_build_object('debt_balance_before', v_debt_before);
  END IF;

  -- Reopen the due date this payment settled, unless an earlier one is already open.
  -- A later due date that was paid stays paid.
  IF v_payment.settles_occurrence AND v_payment.occurrence_date IS NOT NULL
     AND v_payment.occurrence_date < v_bill.next_due_date THEN
    UPDATE bills SET next_due_date = v_payment.occurrence_date, updated_at = now() WHERE id = v_bill.id;
  END IF;
  v_snapshot := v_snapshot || jsonb_build_object(
    'next_due_after', (SELECT next_due_date FROM bills WHERE id = v_bill.id)
  );

  UPDATE bill_payments
     SET reversed_at = now(),
         reversal_reason = NULLIF(trim(p_reason), ''),
         reversal_snapshot = v_snapshot
   WHERE id = p_payment_id
  RETURNING * INTO v_payment;

  RETURN v_payment;
END;
$$;

GRANT EXECUTE ON FUNCTION bill_advance_due(date, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION record_bill_payment(uuid, numeric, date, text, uuid, boolean, numeric, numeric, numeric, date, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION reverse_bill_payment(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
