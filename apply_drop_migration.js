const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway',
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
    try {
        const client = await pool.connect();
        console.log('Connected to database.');

        const sql = fs.readFileSync(path.join(__dirname, 'database/migrations/004_drop_invoice_payment_new.sql'), 'utf8');
        
        console.log('Running migration to drop invoice_payment_new table...');
        await client.query(sql);
        console.log('Migration successful: invoice_payment_new table dropped.');

        client.release();
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        pool.end();
    }
}

runMigration();
