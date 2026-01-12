const { Client } = require('pg');

const connectionString = 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway';

const client = new Client({
  connectionString: connectionString,
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to database.');

    // 1. Create invoice_action table
    console.log('Creating invoice_action table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoice_action (
        id SERIAL PRIMARY KEY,
        bubble_id VARCHAR(255) NOT NULL UNIQUE,
        invoice_id VARCHAR(255) NOT NULL, -- FK to invoice_new.bubble_id
        action_type VARCHAR(50) NOT NULL, -- e.g., 'CREATE', 'EDIT', 'VERSION'
        details JSONB, -- Flexible storage for what changed
        created_by VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    // Add index for performance
    await client.query(`CREATE INDEX IF NOT EXISTS idx_invoice_action_invoice_id ON invoice_action(invoice_id);`);


    // 2. Add columns to invoice_new
    console.log('Altering invoice_new table...');
    
    const alterQueries = [
      "ALTER TABLE invoice_new ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;",
      "ALTER TABLE invoice_new ADD COLUMN IF NOT EXISTS root_id VARCHAR(255);",
      "ALTER TABLE invoice_new ADD COLUMN IF NOT EXISTS parent_id VARCHAR(255);",
      "ALTER TABLE invoice_new ADD COLUMN IF NOT EXISTS is_latest BOOLEAN DEFAULT true;"
    ];

    for (const q of alterQueries) {
        await client.query(q);
    }
    
    // Add indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_invoice_new_root_id ON invoice_new(root_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_invoice_new_is_latest ON invoice_new(is_latest);`);


    // 3. Backfill root_id for existing invoices
    console.log('Backfilling root_id...');
    // For existing rows, root_id should be their own bubble_id (assuming they are version 1s or independent for now)
    // We will assume all existing are "roots" unless we want to try and reconstruct history (which we can't easily).
    // So set root_id = bubble_id where it is null.
    await client.query(`
        UPDATE invoice_new 
        SET root_id = bubble_id 
        WHERE root_id IS NULL;
    `);

    console.log('Migration complete.');

  } catch (err) {
    console.error('Error executing query', err.stack);
  } finally {
    await client.end();
  }
}

run();
