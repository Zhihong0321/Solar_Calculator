const { Pool } = require('pg');

// Using ONLY the requested variable. No fallbacks.
const connectionString = process.env.DATABASE_URL_TARIFF;

if (connectionString) {
  const masked = connectionString.length > 15 ? connectionString.substring(0, 10) + '...' : connectionString;
  console.log('[Tariff Pool] Initializing with DATABASE_URL_TARIFF:', masked);
} else {
  console.warn('[Tariff Pool] DATABASE_URL_TARIFF is UNDEFINED');
}

const tariffPool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

tariffPool.on('error', (err) => {
  console.error('[Tariff Pool] Unexpected error on idle client', err);
});

module.exports = tariffPool;
