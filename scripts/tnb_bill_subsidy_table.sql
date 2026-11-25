-- TNB Bill Subsidy Promo (until 31 Dec 2026): RM0.75 / panel / day, 0-60 days.
-- Optional: the app creates this table itself on first use (CREATE TABLE IF NOT EXISTS).
-- No existing table is altered.
CREATE TABLE IF NOT EXISTS invoice_tnb_bill_subsidy (
  invoice_bubble_id TEXT PRIMARY KEY,
  panel_qty INTEGER NOT NULL DEFAULT 0,
  rate NUMERIC(10,2) NOT NULL DEFAULT 0.75,
  days INTEGER NOT NULL DEFAULT 0,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tnb_bill_urls TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  item_bubble_id TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
