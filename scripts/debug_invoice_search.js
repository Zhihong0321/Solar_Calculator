const pool = require('../src/core/database/pool');
const invoiceRepo = require('../src/modules/Invoicing/services/invoiceRepo');

async function pickTestUser(client) {
  const candidates = [
    `SELECT created_by::text AS user_id FROM invoice WHERE created_by IS NOT NULL LIMIT 1`,
    `SELECT linked_agent::text AS user_id FROM invoice WHERE linked_agent IS NOT NULL LIMIT 1`,
    `SELECT id::text AS user_id FROM "user" LIMIT 1`,
    `SELECT bubble_id::text AS user_id FROM "user" LIMIT 1`
  ];

  for (const sql of candidates) {
    try {
      const res = await client.query(sql);
      if (res.rows?.[0]?.user_id) return res.rows[0].user_id;
    } catch (err) {
      // keep trying fallbacks
    }
  }
  return null;
}

async function runCase(client, label, userId, options) {
  const started = Date.now();
  try {
    const result = await invoiceRepo.getInvoicesByUserId(client, userId, options);
    return {
      label,
      ok: true,
      ms: Date.now() - started,
      total: result.total,
      returned: result.invoices.length,
      sample: result.invoices.slice(0, 2).map((inv) => ({
        bubble_id: inv.bubble_id,
        invoice_number: inv.invoice_number,
        customer_name: inv.customer_name,
        customer_phone: inv.customer_phone,
        customer_address: inv.customer_address,
        package_name: inv.package_name,
        status: inv.status,
      }))
    };
  } catch (err) {
    return {
      label,
      ok: false,
      ms: Date.now() - started,
      error: err.message,
      code: err.code || null,
      detail: err.detail || null,
      hint: err.hint || null,
      position: err.position || null,
      stack: err.stack
    };
  }
}

async function main() {
  const client = await pool.connect();
  try {
    const explicitUserId = process.argv[2] || '';
    const userId = explicitUserId || await pickTestUser(client);

    if (!userId) {
      throw new Error('Could not find a sample user/invoice owner to test.');
    }

    const tests = [
      { label: 'baseline', options: { limit: 5, offset: 0 } },
      { label: 'search-demo', options: { search: 'demo', limit: 5, offset: 0 } },
      { label: 'search-sample', options: { search: 'sample', limit: 5, offset: 0 } },
      { label: 'deleted-filter', options: { paymentStatus: 'deleted', limit: 5, offset: 0 } },
      { label: 'unpaid-filter', options: { paymentStatus: 'unpaid', limit: 5, offset: 0 } },
      { label: 'partial-filter', options: { paymentStatus: 'partial', limit: 5, offset: 0 } },
      { label: 'paid-filter', options: { paymentStatus: 'paid', limit: 5, offset: 0 } },
      { label: 'search+deleted', options: { search: 'demo', paymentStatus: 'deleted', limit: 5, offset: 0 } },
    ];

    const results = [];
    for (const test of tests) {
      results.push(await runCase(client, test.label, userId, test.options));
    }

    const summary = {
      userId,
      results,
      failing: results.filter(r => !r.ok).map(r => ({
        label: r.label,
        error: r.error,
        code: r.code,
        detail: r.detail,
        hint: r.hint,
        position: r.position
      }))
    };

    console.log(JSON.stringify(summary, null, 2));

    if (summary.failing.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    client.release();
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message, stack: err.stack }, null, 2));
  process.exit(1);
});
