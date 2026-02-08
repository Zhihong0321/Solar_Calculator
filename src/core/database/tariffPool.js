const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL_TARIFF || process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('[Tariff Pool] No database connection string found (DATABASE_URL_TARIFF or DATABASE_URL).');
}

const tariffPool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

tariffPool.on('error', (err) => {
  console.error('[Tariff Pool] Unexpected error on idle client', err);
});

module.exports = tariffPool;
