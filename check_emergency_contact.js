const { Client } = require('pg');

const connectionString = 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway';

const client = new Client({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }
});

async function checkEmergencyContactIC() {
  await client.connect();
  
  const r = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'seda_registration' 
      AND (
        column_name ILIKE '%emergency%' 
        OR column_name ILIKE '%contact%' 
        OR column_name ILIKE '%ic%' 
        OR column_name ILIKE '%mykad%'
      )
    ORDER BY column_name
  `);
  
  console.log('Emergency Contact & IC/MyKad columns in seda_registration:\n');
  r.rows.forEach(row => {
    console.log(`  ${row.column_name.padEnd(40)} | ${row.data_type}`);
  });
  
  await client.end();
}

checkEmergencyContactIC();
