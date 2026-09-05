-- Migration: Add afa_rates table
-- Lets the Monthly AFA rate shown on the solar calculator (public/domestic-v4.html,
-- AFA Bill Month dropdown) be updated via POST /api/afa-rates instead of editing
-- the hardcoded AFA_OPTIONS array in that file and redeploying.

CREATE TABLE IF NOT EXISTS afa_rates (
    id SERIAL PRIMARY KEY,
    period_year INTEGER NOT NULL,
    period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    rate_value NUMERIC(6,4) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (period_year, period_month)
);

-- Seed with the rate history previously hardcoded as AFA_OPTIONS in
-- public/domestic-v4.html, so the dropdown's content is unchanged by this migration.
INSERT INTO afa_rates (period_year, period_month, rate_value) VALUES
    (2026, 9, 0.0376),
    (2026, 8, 0.0380),
    (2026, 7, 0.0359),
    (2026, 6, 0.0259),
    (2026, 5, 0.0138),
    (2026, 4, -0.0047),
    (2026, 3, -0.0215),
    (2026, 2, -0.0509),
    (2026, 1, -0.0499),
    (2025, 12, -0.0642),
    (2025, 11, -0.0891),
    (2025, 10, -0.0650),
    (2025, 9, -0.0110),
    (2025, 8, -0.0145),
    (2025, 7, 0.0)
ON CONFLICT (period_year, period_month) DO NOTHING;
