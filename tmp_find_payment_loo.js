const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  const q1 = await pool.query(
    "SELECT i.bubble_id AS invoice_id, i.invoice_number, COALESCE(i.customer_name_snapshot,'') AS invoice_customer_name, i.linked_customer, i.total_amount, i.status AS invoice_status FROM invoice i WHERE UPPER(COALESCE(i.customer_name_snapshot,'')) LIKE UPPER($1) ORDER BY i.created_at DESC LIMIT 50",
    ['%LOO SHU TING%']
  );
  console.log('INVOICE_MATCHES', JSON.stringify(q1.rows, null, 2));

  const q2 = await pool.query(
    "SELECT c.customer_id, c.name, c.phone, c.email FROM customer c WHERE UPPER(COALESCE(c.name,'')) LIKE UPPER($1) LIMIT 20",
    ['%LOO SHU TING%']
  );
  console.log('CUSTOMER_MATCHES', JSON.stringify(q2.rows, null, 2));

  const customerIds = q2.rows.map(r => r.customer_id);
  let q3rows = [];
  if (customerIds.length) {
    const q3 = await pool.query(
      "SELECT sp.bubble_id AS submitted_payment_id, sp.linked_invoice AS invoice_id, sp.amount, sp.payment_date, sp.status, sp.payment_method, sp.created_at, sp.attachment FROM submitted_payment sp WHERE sp.linked_customer = ANY($1::text[]) ORDER BY sp.created_at DESC LIMIT 100",
      [customerIds]
    );
    q3rows = q3.rows;
  }
  console.log('SUBMITTED_BY_CUSTOMER', JSON.stringify(q3rows, null, 2));

  const invoiceIds = [...new Set([...q1.rows.map(r => r.invoice_id), ...q3rows.map(r => r.invoice_id)])];
  let q4rows = [];
  let q5rows = [];
  if (invoiceIds.length) {
    const q4 = await pool.query(
      "SELECT sp.bubble_id AS submitted_payment_id, sp.linked_invoice AS invoice_id, sp.amount, sp.payment_date, sp.status, sp.payment_method, sp.created_at, sp.attachment FROM submitted_payment sp WHERE sp.linked_invoice = ANY($1::text[]) ORDER BY sp.created_at DESC LIMIT 200",
      [invoiceIds]
    );
    q4rows = q4.rows;

    const q5 = await pool.query(
      "SELECT p.bubble_id AS payment_id, p.linked_invoice AS invoice_id, p.amount, p.payment_date, p.payment_method, p.created_at, p.attachment FROM payment p WHERE p.linked_invoice = ANY($1::text[]) ORDER BY p.created_at DESC LIMIT 200",
      [invoiceIds]
    );
    q5rows = q5.rows;
  }
  console.log('SUBMITTED_BY_INVOICE', JSON.stringify(q4rows, null, 2));
  console.log('VERIFIED_PAYMENT_BY_INVOICE', JSON.stringify(q5rows, null, 2));

  await pool.end();
})().catch(async (e) => {
  console.error('ERR', e.message);
  try { await pool.end(); } catch (_) {}
  process.exit(1);
});
