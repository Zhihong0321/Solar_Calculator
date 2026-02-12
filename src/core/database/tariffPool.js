const { Pool } = require('pg');

// Using ONLY the requested variable. No fallbacks.
const connectionString = process.env.DATABASE_URL_TARIFF;

const tariffPool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

tariffPool.on('error', (err) => {
  console.error('[Tariff Pool] Unexpected error on idle client', err);
});

module.exports = tariffPool;
