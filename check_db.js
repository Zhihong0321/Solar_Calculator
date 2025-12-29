const { Pool } = require('pg');
require('dotenv').config();

const connectionString = 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway';

const pool = new Pool({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }
});

async function checkUsage() {
  try {
    const client = await pool.connect();
    
    const result = await client.query(`
      SELECT usage_kwh, bill_total_normal 
      FROM tnb_tariff_2025 
      WHERE usage_kwh = 2080
    `);
    
    if (result.rowCount === 0) {
        console.log('No record found for usage_kwh = 2080.');
        
        // Find the closest records
        const closestResult = await client.query(`
          (SELECT usage_kwh, bill_total_normal FROM tnb_tariff_2025 WHERE usage_kwh < 2080 ORDER BY usage_kwh DESC LIMIT 1)
          UNION ALL
          (SELECT usage_kwh, bill_total_normal FROM tnb_tariff_2025 WHERE usage_kwh > 2080 ORDER BY usage_kwh ASC LIMIT 1)
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
