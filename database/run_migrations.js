const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');
require('dotenv').config();

const migrationsDir = path.join(__dirname, 'migrations');

function resolveMigrationFile(input) {
  const directPath = path.isAbsolute(input) ? input : path.join(process.cwd(), input);
  if (fs.existsSync(directPath)) {
    return directPath;
  }

  const migrationsPath = path.join(migrationsDir, input);
  if (fs.existsSync(migrationsPath)) {
    return migrationsPath;
  }

  throw new Error(`Migration file not found: ${input}`);
}

function listAllMigrationFiles() {
  return fs.readdirSync(migrationsDir)
    .filter((name) => name.toLowerCase().endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
}

function resolveRequestedFiles(args) {
  const normalized = args.map((arg) => String(arg).trim()).filter(Boolean);
  if (normalized.length === 0 || normalized.includes('--all')) {
    return listAllMigrationFiles();
  }
  return normalized.map((input) => path.basename(resolveMigrationFile(input)));
}

function createChecksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function run() {
  const requestedFiles = resolveRequestedFiles(process.argv.slice(2));

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    await ensureMigrationTable(client);

    if (requestedFiles.length === 0) {
      console.log('No migration files found.');
      return;
    }

    console.log(`Migration mode: ${process.argv.slice(2).length === 0 || process.argv.slice(2).includes('--all') ? 'all pending migrations' : 'selected files only'}`);

    for (const requestedFile of requestedFiles) {
      const filePath = resolveMigrationFile(requestedFile);
      const filename = path.basename(filePath);
      const sql = fs.readFileSync(filePath, 'utf8');
      const checksum = createChecksum(sql);

      const existing = await client.query(
        'SELECT checksum, applied_at FROM schema_migrations WHERE filename = $1',
        [filename]
      );

      if (existing.rows.length > 0) {
        const applied = existing.rows[0];
        if (applied.checksum !== checksum) {
          throw new Error(
            `Migration ${filename} is already recorded with a different checksum. Review before reapplying.`
          );
        }

        console.log(`Skipping ${filename}; already applied at ${applied.applied_at.toISOString()}.`);
        continue;
      }

      console.log(`Applying ${filename}...`);
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
        [filename, checksum]
      );
      await client.query('COMMIT');
      console.log(`Applied ${filename}.`);
    }
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // Ignore rollback failures after connection-level errors.
    }
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

run();
