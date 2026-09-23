const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const poolPath = require.resolve('../src/core/database/pool');
const queries = [];
const client = {
  async query(sql, params = []) {
    queries.push({ sql, params });
    if (sql.includes('SELECT id, bubble_id, linked_agent_profile FROM "user"')) {
      return { rows: [{ id: 7, bubble_id: 'user-7', linked_agent_profile: 'agent-7' }] };
    }
    if (sql.includes('information_schema.columns')) {
      return { rows: ['email', 'name', 'contact', 'updated_at'].map((column_name) => ({ column_name })) };
    }
    if (sql.includes('FROM "user" u')) {
      return { rows: [{ id: 7, bubble_id: 'user-7', email: 'agent@example.com', password: 'must-never-appear', name: 'Agent', access_level: ['agent'] }] };
    }
    if (sql.includes('FROM payment')) {
      return { rows: [{ bubble_id: 'pay-1', linked_invoice: 'inv-1', amount: '125.00' }] };
    }
    if (sql.includes('FROM invoice')) {
      return { rows: [{ bubble_id: 'inv-1', invoice_number: 'INV-1' }] };
    }
    if (sql.includes('FROM seda_registration')) {
      return { rows: [{ bubble_id: 'seda-1', linked_customer: 'customer-1' }] };
    }
    return { rows: [] };
  },
  release() {}
};
require.cache[poolPath] = { id: poolPath, filename: poolPath, loaded: true, exports: { connect: async () => client } };

async function main() {
  const app = express();
  app.use(express.json());
  app.use(require('../routes/integrationApiRoutes'));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const password = 'eternalgy2026eternalgy2026';
  const request = (route, options = {}) => fetch(`${base}${route}`, {
    ...options,
    headers: { 'X-Api-Password': password, ...options.headers }
  });

  try {
    const unauthorized = await fetch(`${base}/api/integration/v1/users`);
    assert.equal(unauthorized.status, 401);
    assert.equal(queries.length, 0, 'Unauthorized requests must not query the database');

    const users = await request('/api/integration/v1/users?limit=1');
    assert.equal(users.status, 200);
    const usersBody = await users.json();
    assert.equal(usersBody.data[0].bubble_id, 'user-7');
    assert.equal(JSON.stringify(usersBody).includes('must-never-appear'), false);

    const rejectedEdit = await request('/api/integration/v1/users/user-7', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_level: ['admin'] })
    });
    assert.equal(rejectedEdit.status, 400);

    const edited = await request('/api/integration/v1/users/user-7', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Updated Agent', contact: '0123456789' })
    });
    assert.equal(edited.status, 200);
    assert(queries.some(({ sql }) => sql.includes('UPDATE "user"')));
    assert(queries.some(({ sql }) => sql.includes('UPDATE agent')));
    assert(queries.some(({ sql }) => sql === 'COMMIT'));

    const invoice = await request('/api/integration/v1/invoices/inv-1');
    assert.equal((await invoice.json()).data.invoice_number, 'INV-1');
    const seda = await request('/api/integration/v1/seda?linked_customer=customer-1');
    assert.equal((await seda.json()).data[0].bubble_id, 'seda-1');

    const payments = await request('/api/integration/v1/payments?linked_invoice=inv-1');
    assert.equal(payments.status, 200);
    assert.equal((await payments.json()).data[0].bubble_id, 'pay-1');
    assert(queries.some(({ sql }) => sql.includes('FROM payment') && sql.includes('linked_payment')));
    assert(!queries.some(({ sql }) => sql.includes('submitted_payment')));

    const badPage = await request('/api/integration/v1/invoices?limit=101');
    assert.equal(badPage.status, 400);

    const docs = await fetch(`${base}/api/integration/docs`);
    assert.equal(docs.status, 200);
    assert((await docs.text()).includes('Recorded payments'));
    console.log('Integration API checks passed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
