-- Migration: keep the stored paid fields on `invoice` in step with the `payment` table.
--
-- Problem: invoice.paid_amount / percent_of_total_amount / paid were never refreshed when a payment was
-- added, changed or deleted (payments are written by several services), so they went stale
-- (about 240 invoices, 131 of them fully paid but showing under 100%).
--
-- The `payment` table stays the source of truth (see .agents/decisions.md, 2026-04-23). This only copies
-- the verified totals onto the invoice:
--   paid_amount             = SUM(payment.amount) for the invoice (payment.linked_invoice = invoice.bubble_id
--                             OR payment.bubble_id is in invoice.linked_payment)
--   percent_of_total_amount = paid_amount / total_amount * 100
--   paid                    = paid_amount >= 99.5% of total_amount
--   paid_at                 = set to the last payment date the first time it becomes fully paid
-- balance_due is NOT touched: it also carries adjustments that are not derivable from payments.
--
-- The trigger can never block a payment write: any error inside it is turned into a WARNING.
-- Idempotent: safe to run on every boot.

CREATE OR REPLACE FUNCTION refresh_invoice_paid(p_invoice_id text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_paid numeric;
  v_last timestamptz;
BEGIN
  IF p_invoice_id IS NULL OR p_invoice_id = '' THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(p.amount), 0), MAX(p.payment_date)
    INTO v_paid, v_last
    FROM payment p
   WHERE p.linked_invoice = p_invoice_id
      OR p.bubble_id = ANY (COALESCE((SELECT i.linked_payment FROM invoice i WHERE i.bubble_id = p_invoice_id LIMIT 1), ARRAY[]::text[]));
  v_paid := ROUND(v_paid, 2);

  UPDATE invoice i
     SET paid_amount = v_paid,
         percent_of_total_amount = CASE WHEN COALESCE(i.total_amount, 0) > 0
                                        THEN v_paid / i.total_amount * 100
                                        ELSE i.percent_of_total_amount END,
         paid = (COALESCE(i.total_amount, 0) > 0 AND v_paid >= i.total_amount * 0.995),
         paid_at = CASE WHEN COALESCE(i.total_amount, 0) > 0 AND v_paid >= i.total_amount * 0.995
                        THEN COALESCE(i.paid_at, v_last)
                        ELSE i.paid_at END
   WHERE i.bubble_id = p_invoice_id
     AND i.is_deleted IS NOT TRUE
     AND (   i.paid_amount IS DISTINCT FROM v_paid
          OR (COALESCE(i.total_amount, 0) > 0
              AND ABS(COALESCE(i.percent_of_total_amount, 0) - v_paid / i.total_amount * 100) > 0.01)
          OR COALESCE(i.paid, false) IS DISTINCT FROM (COALESCE(i.total_amount, 0) > 0 AND v_paid >= i.total_amount * 0.995));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'refresh_invoice_paid(%) failed: %', p_invoice_id, SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION trg_payment_refresh_invoice() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  r text;
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
      PERFORM refresh_invoice_paid(NEW.linked_invoice);
      IF NEW.bubble_id IS NOT NULL THEN
        FOR r IN SELECT i.bubble_id FROM invoice i
                  WHERE NEW.bubble_id = ANY (COALESCE(i.linked_payment, ARRAY[]::text[]))
                    AND i.bubble_id IS DISTINCT FROM NEW.linked_invoice
        LOOP
          PERFORM refresh_invoice_paid(r);
        END LOOP;
      END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
      PERFORM refresh_invoice_paid(OLD.linked_invoice);
      IF OLD.bubble_id IS NOT NULL THEN
        FOR r IN SELECT i.bubble_id FROM invoice i
                  WHERE OLD.bubble_id = ANY (COALESCE(i.linked_payment, ARRAY[]::text[]))
                    AND i.bubble_id IS DISTINCT FROM OLD.linked_invoice
        LOOP
          PERFORM refresh_invoice_paid(r);
        END LOOP;
      END IF;
    ELSIF TG_OP = 'UPDATE' THEN
      -- The payment moved to another invoice: refresh the one it left.
      IF OLD.linked_invoice IS DISTINCT FROM NEW.linked_invoice THEN
        PERFORM refresh_invoice_paid(OLD.linked_invoice);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_payment_refresh_invoice failed: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_refresh_invoice ON payment;
CREATE TRIGGER trg_payment_refresh_invoice
  AFTER INSERT OR UPDATE OR DELETE ON payment
  FOR EACH ROW EXECUTE FUNCTION trg_payment_refresh_invoice();

-- One-time fix of the rows that are already stale.
CREATE TABLE IF NOT EXISTS invoice_paid_sync_marker (
  name    text PRIMARY KEY,
  done_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE
  r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM invoice_paid_sync_marker WHERE name = 'backfill_2026_11') THEN
    FOR r IN SELECT i.bubble_id FROM invoice i
              WHERE i.is_deleted IS NOT TRUE
                AND (EXISTS (SELECT 1 FROM payment p WHERE p.linked_invoice = i.bubble_id)
                     OR COALESCE(array_length(i.linked_payment, 1), 0) > 0)
    LOOP
      PERFORM refresh_invoice_paid(r.bubble_id);
    END LOOP;
    INSERT INTO invoice_paid_sync_marker (name) VALUES ('backfill_2026_11');
  END IF;
END;
$$;
