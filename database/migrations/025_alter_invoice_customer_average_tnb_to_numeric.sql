ALTER TABLE invoice
ALTER COLUMN customer_average_tnb TYPE NUMERIC(12,2)
USING customer_average_tnb::NUMERIC(12,2);
