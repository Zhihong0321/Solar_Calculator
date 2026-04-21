require('dotenv').config();

const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL_TARIFF || process.env.DATABASE_URL;
const TARGET_GROUP = 'LV_COMMERCIAL';
const MAX_USAGE = 20000;

if (!DATABASE_URL) {
  console.error('DATABASE_URL_TARIFF or DATABASE_URL is required.');
  process.exit(1);
}

const sql = `
WITH constants AS (
  SELECT
    27.03::numeric AS energy_sen_per_kwh,
    8.83::numeric AS capacity_sen_per_kwh,
    14.82::numeric AS network_sen_per_kwh,
    20.00::numeric AS retail_rm_per_month,
    0.00::numeric AS afa_sen_per_kwh,
    1.6::numeric AS kwtbb_percent
),
series AS (
  SELECT generate_series(1, $1::int) AS usage_kwh
),
charges AS (
  SELECT
    s.usage_kwh,
    ROUND((s.usage_kwh * c.energy_sen_per_kwh) / 100.0, 2) AS energy_charge,
    ROUND((s.usage_kwh * c.capacity_sen_per_kwh) / 100.0, 2) AS capacity_charge,
    ROUND((s.usage_kwh * c.network_sen_per_kwh) / 100.0, 2) AS network_charge,
    ROUND(c.retail_rm_per_month, 2) AS retail_charge,
    ROUND((s.usage_kwh * c.afa_sen_per_kwh) / 100.0, 2) AS afa_adjustment,
    c.kwtbb_percent
  FROM series s
  CROSS JOIN constants c
)
INSERT INTO bill_simulation_lookup (
  tariff_group,
  usage_kwh,
  demand_kw,
  retail_charge,
  energy_charge,
  capacity_charge,
  network_charge,
  base_bill,
  kwtbb_fund,
  sst_tax,
  total_bill
)
SELECT
  $2::varchar AS tariff_group,
  usage_kwh,
  0.00::numeric AS demand_kw,
  retail_charge,
  energy_charge,
  capacity_charge,
  network_charge,
  ROUND(energy_charge + capacity_charge + network_charge + retail_charge + afa_adjustment, 2) AS base_bill,
  ROUND((energy_charge + capacity_charge + network_charge + afa_adjustment) * (kwtbb_percent / 100.0), 2) AS kwtbb_fund,
  0.00::numeric AS sst_tax,
  ROUND(
    energy_charge + capacity_charge + network_charge + retail_charge + afa_adjustment
    + ((energy_charge + capacity_charge + network_charge + afa_adjustment) * (kwtbb_percent / 100.0)),
    2
  ) AS total_bill
FROM charges
ORDER BY usage_kwh;
`;

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM bill_simulation_lookup WHERE tariff_group = $1', [TARGET_GROUP]);
    await client.query(sql, [MAX_USAGE, TARGET_GROUP]);
    await client.query('COMMIT');

    const summary = await client.query(
      `SELECT COUNT(*)::int AS row_count, MIN(usage_kwh)::int AS min_usage, MAX(usage_kwh)::int AS max_usage
       FROM bill_simulation_lookup
       WHERE tariff_group = $1`,
      [TARGET_GROUP]
    );

    const sample = await client.query(
      `SELECT usage_kwh, retail_charge, energy_charge, capacity_charge, network_charge, base_bill, kwtbb_fund, sst_tax, total_bill
       FROM bill_simulation_lookup
       WHERE tariff_group = $1 AND usage_kwh IN (1, 500, 1000, 20000)
       ORDER BY usage_kwh`,
      [TARGET_GROUP]
    );

    console.log(JSON.stringify({
      status: 'ok',
      tariff_group: TARGET_GROUP,
      summary: summary.rows[0],
      sample: sample.rows
    }, null, 2));
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Rollback failed:', rollbackError.message);
    }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
