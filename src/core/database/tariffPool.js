const { Pool } = require('pg');

let connectionString = process.env.DATABASE_URL_TARIFF || process.env.DATABASE_URL;

// Safety check for common misconfigurations
if (connectionString === 'base') {
  console.warn('[Tariff Pool] DATABASE_URL_TARIFF is set to "base". Using direct fallback URL.');
  connectionString = "postgresql://postgres:obOflKFfCshdZlcpoCDzMVReqxEclBPR@yamanote.proxy.rlwy.net:39808/railway";
}

if (!connectionString) {
  console.warn('[Tariff Pool] No database connection string found (DATABASE_URL_TARIFF or DATABASE_URL).');
} else {
  // Log a masked version to avoid leaking secrets but see if it looks like a URL
  const masked = connectionString.length > 20 ? connectionString.substring(0, 15) + '...' : connectionString;
  console.log('[Tariff Pool] Initializing with:', masked);
}

const tariffPool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

tariffPool.on('error', (err) => {
  console.error('[Tariff Pool] Unexpected error on idle client', err);
});

module.exports = tariffPool;
