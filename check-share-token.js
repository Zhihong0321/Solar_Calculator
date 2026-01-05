/**
 * Check share_token in database
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway',
  ssl: { rejectUnauthorized: false }
});

async function checkShareToken() {
  const client = await pool.connect();
  try {
    // Check recent invoices
    const result = await client.query(`
      SELECT bubble_id, invoice_number, share_token, created_at
      FROM invoice_new
      ORDER BY created_at DESC
      LIMIT 5
    `);

    console.log('Recent invoices:');
    console.log('='.repeat(80));

    result.rows.forEach((inv, index) => {
      console.log(`\nInvoice ${index + 1}:`);
      console.log(`  Bubble ID: ${inv.bubble_id}`);
      console.log(`  Invoice Number: ${inv.invoice_number}`);
      console.log(`  Share Token: ${inv.share_token}`);
      console.log(`  Share Token Length: ${inv.share_token ? inv.share_token.length : 0} characters`);

      // Check if token looks like URL path
      if (inv.share_token && inv.share_token.includes('/')) {
        console.log(`  ⚠️  WARNING: Share token contains '/' - looks like a URL!`);
        console.log(`  Expected: 64-character hex string`);
        console.log(`  Actual: ${inv.share_token}`);
      }

      // Show hex representation
      if (inv.share_token) {
        const hexValue = Buffer.from(inv.share_token).toString('hex').substring(0, 100);
        console.log(`  Share Token (hex): ${hexValue}...`);
      }
    });

    // Check specific invoice from error
    const problemToken = '226d5400286395bd4e482f6d7b7567b470ddea79cbd1a31732a9480767aa24e5/pdf-gen-production-6c81.up.railway.app/api/download/b0681cf3-c694-492a-9a9f-ddf9532b6ead';

    console.log('\n\nChecking for problem token in database:');
    console.log('='.repeat(80));

    const problemResult = await client.query(`
      SELECT bubble_id, invoice_number, share_token
      FROM invoice_new
      WHERE share_token LIKE $1
      LIMIT 1
    `, [`%${problemToken.substring(0, 50)}%`]); // Search with prefix

    if (problemResult.rows.length > 0) {
      console.log(`\n❌ FOUND PROBLEM TOKEN IN DATABASE!`);
      console.log(`  Bubble ID: ${problemResult.rows[0].bubble_id}`);
      console.log(`  Invoice Number: ${problemResult.rows[0].invoice_number}`);
      console.log(`  Share Token: ${problemResult.rows[0].share_token}`);
      console.log(`  Share Token Length: ${problemResult.rows[0].share_token.length} characters`);
    } else {
      console.log(`\n✅ Problem token NOT found in database.`);
      console.log(`   This might be an invoice created by old code.`);
    }

    // Check share_token column type
    const columnResult = await client.query(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'invoice_new'
        AND column_name = 'share_token'
    `);

    console.log('\n\nshare_token column info:');
    console.log('='.repeat(80));
    if (columnResult.rows.length > 0) {
      console.log(`  Column Name: ${columnResult.rows[0].column_name}`);
      console.log(`  Data Type: ${columnResult.rows[0].data_type}`);
      console.log(`  Max Length: ${columnResult.rows[0].character_maximum_length}`);
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    client.release();
  }
}

checkShareToken().then(() => {
  console.log('\n\nCheck complete.');
  process.exit(0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
