ALTER TABLE invoice
ADD COLUMN IF NOT EXISTS solar_sun_peak_hour NUMERIC(4,2),
ADD COLUMN IF NOT EXISTS solar_morning_usage_percent NUMERIC(5,2);
