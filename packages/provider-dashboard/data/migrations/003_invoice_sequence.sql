-- ============================================================
-- Atomic invoice numbering via database sequence
-- Prevents race conditions where two concurrent invoice sends
-- generate the same invoice number.
-- ============================================================

-- Per-provider invoice counter table
CREATE TABLE IF NOT EXISTS invoice_counters (
  provider_id uuid PRIMARY KEY REFERENCES providers(id),
  current_number int NOT NULL DEFAULT 0
);

-- Atomic next number function
-- Uses INSERT ... ON CONFLICT to atomically increment the counter
CREATE OR REPLACE FUNCTION next_invoice_number(p_provider_id uuid) RETURNS text AS $$
DECLARE
  v_next int;
  v_year text;
BEGIN
  INSERT INTO invoice_counters (provider_id, current_number) VALUES (p_provider_id, 1)
  ON CONFLICT (provider_id) DO UPDATE SET current_number = invoice_counters.current_number + 1
  RETURNING current_number INTO v_next;

  v_year := to_char(now(), 'YYYY');
  RETURN 'INV-' || v_year || '-' || lpad(v_next::text, 4, '0');
END;
$$ LANGUAGE plpgsql;
