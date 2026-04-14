-- Migration: Add hybrid_inverter_upgrade_application audit table
-- Tracks every hybrid inverter upgrade applied during invoice creation.
-- Used for audit trail and to detect "already upgraded" state.

CREATE TABLE IF NOT EXISTS hybrid_inverter_upgrade_application (
  id                          bigserial PRIMARY KEY,
  bubble_id                   text NOT NULL UNIQUE,
  invoice_item_bubble_id      text NOT NULL,
  invoice_bubble_id           text NOT NULL,
  original_package_bubble_id  text NOT NULL,
  new_package_bubble_id       text NOT NULL,
  upgrade_rule_bubble_id      text NOT NULL,
  upgrade_price_amount        numeric(12,2) NOT NULL,
  applied_by                  text,
  applied_at                  timestamp with time zone DEFAULT now(),
  notes                       text,
  created_at                  timestamp with time zone DEFAULT now(),
  updated_at                  timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hiua_invoice_bubble_id
  ON hybrid_inverter_upgrade_application (invoice_bubble_id);

CREATE INDEX IF NOT EXISTS idx_hiua_invoice_item_bubble_id
  ON hybrid_inverter_upgrade_application (invoice_item_bubble_id);
