const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL_TARIFF;

if (connectionString) {
  const masked = connectionString.length > 15 ? connectionString.substring(0, 10) + '...' : connectionString;
  console.log('[Tariff Pool] Initializing with DATABASE_URL_TARIFF:', masked);
  const tariffPool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  tariffPool.on('error', (err) => {
    console.error('[Tariff Pool] Unexpected error on idle client', err);
  });
  module.exports = tariffPool;

} else {
  // ── LOCAL PREVIEW ONLY ────────────────────────────────────────────────────
  // DATABASE_URL_TARIFF is not set. If a proxy token is available, route
  // tariff queries through the Postgres Proxy REST API for local testing.
  // This code path is NEVER reached in production (prod always has DATABASE_URL_TARIFF).
  // ─────────────────────────────────────────────────────────────────────────
  const proxyToken = process.env.TARIFF_PROXY_TOKEN;
  if (proxyToken) {
    console.log('[Tariff Pool] DATABASE_URL_TARIFF missing — using LOCAL PROXY fallback (dev only)');
    const { proxyPool, setToken } = require('./tariffProxyClient');
    setToken(proxyToken);
    module.exports = proxyPool;
  } else {
    console.warn('[Tariff Pool] DATABASE_URL_TARIFF is UNDEFINED and no TARIFF_PROXY_TOKEN set — tariff queries will fail');
    // Export a broken pool so existing error handling still fires naturally
    const tariffPool = new Pool({ connectionString });
    tariffPool.on('error', (err) => {
      console.error('[Tariff Pool] Unexpected error on idle client', err);
    });
    module.exports = tariffPool;
  }
}
