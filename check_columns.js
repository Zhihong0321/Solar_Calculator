const { Client } = require('pg');

const connectionString = 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway';

const client = new Client({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }
});

async function checkColumns() {
  await client.connect();
  const r = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'seda_registration' ORDER BY ordinal_position");
  console.log('Total Columns:', r.rows.length);
  console.log('\nColumn List:');
  r.rows.forEach((row, i) => console.log(`${i + 1}. ${row.column_name}`));
  await client.end();
}

checkColumns();
