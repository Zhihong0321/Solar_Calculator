const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  application_name: 'agent-os',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Log idle client errors, but keep the process alive so transient DB hiccups
// do not hard-crash the whole app for every connected user.
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

module.exports = pool;
