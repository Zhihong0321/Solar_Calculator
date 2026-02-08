const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL_TARIFF || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL_TARIFF (or DATABASE_URL) is required to run this script.');
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }
});

async function checkUsage() {
  try {
    const client = await pool.connect();
    
    const result = await client.query(`
      SELECT usage_kwh, total_bill 
      FROM domestic_am_tariff 
      WHERE usage_kwh = 2080
    `);
    
    if (result.rowCount === 0) {
        console.log('No record found for usage_kwh = 2080.');
        
        // Find the closest records
        const closestResult = await client.query(`
          (SELECT usage_kwh, total_bill FROM domestic_am_tariff WHERE usage_kwh < 2080 ORDER BY usage_kwh DESC LIMIT 1)
          UNION ALL
          (SELECT usage_kwh, total_bill FROM domestic_am_tariff WHERE usage_kwh > 2080 ORDER BY usage_kwh ASC LIMIT 1)
        `);
        console.log('Closest records:');
        console.table(closestResult.rows);
    } else {
        console.log('Record for usage_kwh = 2080:');
        console.table(result.rows);
    }
    
    client.release();
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

checkUsage();
