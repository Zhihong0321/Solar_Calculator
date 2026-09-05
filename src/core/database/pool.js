const { Pool } = require('pg');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  application_name: 'agent-os',
  ssl: IS_PRODUCTION ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// ── LOCAL PREVIEW STUB ────────────────────────────────────────────────────────
// If the pool can't connect locally (stale credentials, no local Postgres),
// return a stub client that yields empty rows. Package lookup → null, calc
// still runs.
//
// NEVER in production. A stub there silently turns the app into an empty
// database: every user lookup returns zero rows, so requireAuth treats everyone
// as unregistered and bounces them back to the auth hub in a redirect loop,
// while /api/health still reports "connected". That took prod down for an hour
// on 2026-08-22 — fail loudly instead and let Railway restart us.
const emptyResult = { rows: [], rowCount: 0 };
const stubClient = {
  query: () => Promise.resolve(emptyResult),
  release: () => { }
};

// Railway's private network is not always routable the moment the container
// starts, so a single connect attempt at boot can lose that race and time out
// against a database that is perfectly healthy. Retry with backoff before
// concluding it is genuinely unreachable.
const CONNECT_ATTEMPTS = 6;
const CONNECT_BACKOFF_MS = 2000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function verifyConnection() {
  let lastError;

  for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt++) {
    try {
      const client = await pool.connect();
      client.release();
      if (attempt > 1) {
        console.log(`[Main Pool] Connected on attempt ${attempt}.`);
      }
      return;
    } catch (err) {
      lastError = err;
      console.warn(`[Main Pool] Connect attempt ${attempt}/${CONNECT_ATTEMPTS} failed: ${err.message}`);
      if (attempt < CONNECT_ATTEMPTS) {
        await wait(CONNECT_BACKOFF_MS * attempt);
      }
    }
  }

  if (IS_PRODUCTION) {
    console.error(
      `[Main Pool] FATAL: database unreachable after ${CONNECT_ATTEMPTS} attempts:`,
      lastError.message
    );
    // Exit rather than serve traffic against a database we cannot reach.
    // Railway restarts the container, which retries from a clean slate.
    process.exit(1);
  }

  console.warn('[Main Pool] Connection failed — swapping to LOCAL STUB (dev only):', lastError.message);
  pool.connect = () => Promise.resolve(stubClient);
  pool.query = () => Promise.resolve(emptyResult);
}

verifyConnection();

module.exports = pool;
