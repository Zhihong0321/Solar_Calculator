const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway',
  ssl: { rejectUnauthorized: false }
});

async function check() {
  const client = await pool.connect();
  try {
    // Check invoice_action table columns
    const cols = await client.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'invoice_action' ORDER BY ordinal_position`
    );
    console.log('\n=== invoice_action Table Schema ===\n');
    cols.rows.forEach(r => console.log(`  - ${r.column_name} (${r.data_type})`));

    // Get sample action records
    const sample = await client.query(
      `SELECT * FROM invoice_action LIMIT 3`
    );

    console.log('\n=== Sample Action Records ===\n');
    sample.rows.forEach((row, index) => {
      console.log(`Action ${index + 1}:`);
      console.log(`  - bubble_id: ${row.bubble_id}`);
      console.log(`  - invoice_id: ${row.invoice_id}`);
      console.log(`  - action_type: ${row.action_type}`);
      console.log(`  - created_by: ${row.created_by}`);
      console.log(`  - created_at: ${row.created_at}`);

      const details = row.details;
      console.log(`  - details type: ${typeof details}`);
      console.log(`  - has snapshot: !!${details && details.snapshot}`);

      if (details && details.snapshot) {
        console.log(`\n  === SNAPSHOT STRUCTURE ===`);
        const snapshot = details.snapshot;
        console.log(`  - bubble_id: ${snapshot.bubble_id}`);
        console.log(`  - invoice_number: ${snapshot.invoice_number}`);
        console.log(`  - customer_name_snapshot: ${snapshot.customer_name_snapshot}`);
        console.log(`  - package_name_snapshot: ${snapshot.package_name_snapshot}`);
        console.log(`  - total_amount: ${snapshot.total_amount}`);
        console.log(`  - items count: ${snapshot.items ? snapshot.items.length : 0}`);

        if (snapshot.items && snapshot.items.length > 0) {
          console.log(`\n  === SAMPLE ITEM ===`);
          const item = snapshot.items[0];
          console.log(JSON.stringify(item, null, 4).split('\n').map(l => '  ' + l).join('\n'));
        }
      }

      // Print full details JSON structure
      console.log(`\n  === FULL DETAILS JSON ===`);
      console.log(JSON.stringify(details, null, 2).split('\n').map(l => '  ' + l).join('\n'));

      console.log('\n' + '='.repeat(60) + '\n');
    });

    // Check how many actions exist
    const countResult = await client.query(
      `SELECT COUNT(*) as count, action_type FROM invoice_action GROUP BY action_type`
    );
    console.log('\n=== Action Type Counts ===\n');
    countResult.rows.forEach(r => {
      console.log(`  - ${r.action_type}: ${r.count}`);
    });

  } finally {
    await client.release();
    await pool.end();
  }
}

check().catch(console.error);
