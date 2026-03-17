const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: parseInt(process.env.PG_POOL_MAX || '20', 10),
  idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT_MS || '10000', 10),
  connectionTimeoutMillis: parseInt(process.env.PG_CONNECT_TIMEOUT_MS || '5000', 10),
  query_timeout: parseInt(process.env.PG_QUERY_TIMEOUT_MS || '20000', 10),
  statement_timeout: parseInt(process.env.PG_STATEMENT_TIMEOUT_MS || '20000', 10)
});

// Log idle client errors, but keep the process alive so transient DB hiccups
// do not hard-crash the whole app for every connected user.
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

module.exports = pool;
