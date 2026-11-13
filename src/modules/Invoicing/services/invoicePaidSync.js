const fs = require('fs');
const path = require('path');
const pool = require('../../../core/database/pool');

/**
 * Installs the trigger that keeps invoice.paid_amount / percent_of_total_amount / paid in step with the
 * payment table (migrations/add_invoice_paid_sync.sql) and runs the one-time fix of stale rows.
 * Idempotent. Never throws: a failure here is logged and the server keeps running.
 */
async function ensureInvoicePaidSync() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, '../../../../migrations/add_invoice_paid_sync.sql'), 'utf8');
    await pool.query(sql);
    console.log('[InvoicePaidSync] payment -> invoice paid sync is in place');
  } catch (err) {
    console.error('[InvoicePaidSync] could not install the paid sync:', err.message);
  }
}

module.exports = { ensureInvoicePaidSync };
