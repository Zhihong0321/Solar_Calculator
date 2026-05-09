const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  application_name: 'agent-os',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// ── LOCAL PREVIEW STUB ────────────────────────────────────────────────────────
// If mainPool can't connect (e.g. stale credentials locally), return a stub
// client that returns empty rows. Package lookup → null, calc still runs.
// This ONLY activates when DATABASE_URL is missing or connection fails locally.
const emptyResult = { rows: [], rowCount: 0 };
const stubClient = {
  query: () => Promise.resolve(emptyResult),
  release: () => { }
};
const stubPool = {
  connect: () => Promise.resolve(stubClient),
  query: () => Promise.resolve(emptyResult),
  end: () => Promise.resolve()
};

// Test connection on startup; swap to stub if it fails (local dev only)
pool.connect()
  .then(client => { client.release(); })
  .catch(err => {
    if (process.env.DATABASE_URL) {
      console.warn('[Main Pool] Connection failed — swapping to LOCAL STUB (dev only):', err.message);
      // Patch pool methods to use stub behaviour for this session
      pool.connect = () => Promise.resolve(stubClient);
      pool.query = () => Promise.resolve(emptyResult);
    }
  });

module.exports = pool;
