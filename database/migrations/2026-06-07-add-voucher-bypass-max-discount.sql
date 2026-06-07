-- Add bypass_max_discount column to voucher table
-- When TRUE, this voucher's visible discount AND its deductable_from_commission
-- (hidden commission cost) are excluded from the package discount cap.
-- The cap is package.price - package.nett_price (or 7% of price when nett_price
-- is not set). Vouchers with this flag set can effectively push total discount
-- beyond the cap without blocking invoice save.
--
-- Default FALSE preserves the existing behavior for every voucher created
-- before this migration.
--
-- Applied to prod_main on 2026-06-07 via pg-proxy.

ALTER TABLE voucher
    ADD COLUMN IF NOT EXISTS bypass_max_discount BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_voucher_bypass_max_discount
    ON voucher (bypass_max_discount)
    WHERE bypass_max_discount = TRUE;
