const { Pool } = require('pg');
const invoiceRepo = require('./services/invoiceRepo');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function debug() {
  try {
    const client = await pool.connect();
    
    // We know INV-000178 was created by user '1' from previous output
    const userId = '1';
    console.log("Fetching invoices for User ID:", userId);

    const result = await invoiceRepo.getInvoicesByUserId(client, userId, { limit: 50, offset: 0 });
    
    const target = result.invoices.find(i => i.invoice_number === 'INV-000178');
    
    if (target) {
        console.log("\n--- Target Invoice Found ---");
        console.log("Invoice:", target.invoice_number);
        console.log("Bubble ID:", target.bubble_id);
        console.log("Linked SEDA:", target.linked_seda_registration); // THIS IS THE KEY
    } else {
        console.log("\nINV-000178 not found in the list for user 1.");
        console.log("First 3 invoices found:", result.invoices.slice(0, 3).map(i => i.invoice_number));
    }

    client.release();
  } catch (err) {
    console.error("Debug Error:", err);
  } finally {
    pool.end();
  }
}

debug();
