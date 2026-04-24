const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL must be provided by the runtime environment.');
}

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
