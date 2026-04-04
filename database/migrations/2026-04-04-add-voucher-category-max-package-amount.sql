ALTER TABLE voucher_category
    ADD COLUMN IF NOT EXISTS max_package_amount NUMERIC(12,2);
