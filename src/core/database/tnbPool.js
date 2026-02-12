const { Pool } = require('pg');

// Use DATABASE_URL_TARIFF if available, otherwise fallback to DATABASE_URL or log warning
let connectionString = process.env.DATABASE_URL_TARIFF || process.env.DATABASE_URL;

// Safety check for common misconfigurations
// ENOTFOUND base means the hostname is literally 'base'
if (connectionString && (connectionString === 'base' || connectionString.includes('@base') || connectionString.includes('//base'))) {
  console.warn('[TNB Pool] connectionString has invalid "base" hostname. Using direct fallback URL.');
  connectionString = "postgresql://postgres:obOflKFfCshdZlcpoCDzMVReqxEclBPR@yamanote.proxy.rlwy.net:39808/railway";
}

if (!connectionString) {
  console.warn('[TNB Pool] No database connection string found (DATABASE_URL_TARIFF or DATABASE_URL).');
}

const tnbPool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

tnbPool.on('error', (err) => {
  console.error('[TNB Pool] Unexpected error on idle client', err);
});

module.exports = tnbPool;
