const { Pool } = require('pg');

let connectionString = process.env.DATABASE_URL_TARIFF || process.env.DATABASE_URL;

// Safety check for common misconfigurations
// ENOTFOUND base means the hostname is literally 'base'
if (connectionString && (connectionString === 'base' || connectionString.includes('@base') || connectionString.includes('//base'))) {
  console.warn('[Tariff Pool] connectionString has invalid "base" hostname. Using direct fallback URL.');
  connectionString = "postgresql://postgres:obOflKFfCshdZlcpoCDzMVReqxEclBPR@yamanote.proxy.rlwy.net:39808/railway";
}

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
