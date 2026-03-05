const { Client } = require('pg');

const connectionString = 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway';

const client = new Client({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }
});

async function checkIndexes() {
  await client.connect();
  const r = await client.query("SELECT indexname FROM pg_indexes WHERE tablename = 'seda_registration' ORDER BY indexname");
  console.log('Total Indexes:', r.rows.length);
  console.log('\nIndex List:');
  r.rows.forEach(row => console.log('  -', row.indexname));
  await client.end();
}

checkIndexes();
