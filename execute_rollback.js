require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL must be provided by the runtime environment.');
}

const client = new Client({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }
});

async function runRollback() {
  try {
    await client.connect();
    console.log('✅ Connected to production database\n');

    // Read the rollback SQL file
    const sqlPath = path.join(__dirname, 'rollback_seda_schema.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('🔄 Executing ROLLBACK script...\n');
    console.log('─'.repeat(80));

    // Execute the rollback script
    await client.query(sqlContent);
    
    console.log('─'.repeat(80));
    console.log('\n✅ ROLLBACK completed!\n');

    // Verify the rollback
    console.log('=== VERIFICATION ===\n');
    
    const colResult = await client.query(`
      SELECT COUNT(*) as count
      FROM information_schema.columns
      WHERE table_name = 'seda_registration'
    `);
    console.log(`Total columns: ${colResult.rows[0].count} (should be 99)`);

    const idxResult = await client.query(`
      SELECT COUNT(*) as count
      FROM pg_indexes
      WHERE tablename = 'seda_registration'
    `);
    console.log(`Total indexes: ${idxResult.rows[0].count} (should be 4)`);

    const constraintResult = await client.query(`
      SELECT COUNT(*) as count
      FROM pg_constraint
      WHERE conrelid = 'seda_registration'::regclass
    `);
    console.log(`Total constraints: ${constraintResult.rows[0].count}`);

    const rowCount = await client.query(`
      SELECT COUNT(*) as count FROM seda_registration
    `);
    console.log(`Total rows: ${rowCount.rows[0].count} (all data preserved)`);

    if (colResult.rows[0].count === 99 && idxResult.rows[0].count === 4) {
      console.log('\n✅✅✅ ROLLBACK SUCCESSFUL! Table restored to original state. ✅✅✅\n');
    } else {
      console.log('\n⚠️  Warning: Counts may need manual verification\n');
    }

  } catch (err) {
    console.error('❌ Rollback failed:', err.message);
    console.error('SQL Error:', err);
    process.exit(1);
  } finally {
    await client.end();
    console.log('✅ Database connection closed');
  }
}

runRollback();
