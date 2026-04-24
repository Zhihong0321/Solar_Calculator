const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL must be provided by the runtime environment.');
}

const client = new Client({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }
});

async function verifyEmergencyContactMyKad() {
  try {
    await client.connect();
    
    // Check if e_contact_mykad column exists
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'seda_registration'
        AND column_name = 'e_contact_mykad'
    `);
    
    if (result.rows.length > 0) {
      console.log('✅ Column e_contact_mykad exists in seda_registration table');
      console.log(`   Type: ${result.rows[0].data_type}`);
      console.log(`   Nullable: ${result.rows[0].is_nullable}`);
      
      // Check sample data
      const sample = await client.query(`
        SELECT bubble_id, e_contact_name, e_contact_no, e_contact_mykad
        FROM seda_registration
        WHERE e_contact_mykad IS NOT NULL
        LIMIT 5
      `);
      
      if (sample.rows.length > 0) {
        console.log(`\n📊 Found ${sample.rows.length} records with emergency contact MyKad:`);
        sample.rows.forEach((row, i) => {
          console.log(`   ${i + 1}. ${row.bubble_id}: ${row.e_contact_mykad}`);
        });
      } else {
        console.log('\nℹ️  No existing records with emergency contact MyKad (column is ready for new data)');
      }
    } else {
      console.log('❌ Column e_contact_mykad does NOT exist!');
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await client.end();
  }
}

verifyEmergencyContactMyKad();
