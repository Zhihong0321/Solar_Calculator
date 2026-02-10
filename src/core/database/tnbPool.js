const { Pool } = require('pg');

// Use TNB_DATABASE_URL if available, otherwise fallback to DATABASE_URL or log warning
const connectionString = process.env.TNB_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('[TNB Pool] No database connection string found (TNB_DATABASE_URL or DATABASE_URL).');
}

const tnbPool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

tnbPool.on('error', (err) => {
  console.error('[TNB Pool] Unexpected error on idle client', err);
});

module.exports = tnbPool;
