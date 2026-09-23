const crypto = require('crypto');
const express = require('express');
const path = require('path');
const pool = require('../src/core/database/pool');

const router = express.Router();
const API_PASSWORD = process.env.INTEGRATION_API_PASSWORD || 'eternalgy2026eternalgy2026';
const USER_FIELDS = ['email', 'name', 'contact', 'banker', 'bankin_account', 'user_signature'];
const RESOURCE_TABLES = {
  invoices: { table: 'invoice', filter: 'linked_customer' },
  seda: { table: 'seda_registration', filter: 'linked_customer' },
  payments: { table: 'payment', filter: 'linked_invoice' }
};

function requireIntegrationPassword(req, res, next) {
  const supplied = req.get('x-api-password') || '';
  const actual = Buffer.from(API_PASSWORD);
  const candidate = Buffer.from(supplied);
  if (!candidate.length || candidate.length !== actual.length || !crypto.timingSafeEqual(candidate, actual)) {
    return res.status(401).json({ success: false, error: 'Invalid API password' });
  }
  return next();
}

function pageParams(req, res) {
  const limit = Number(req.query.limit ?? 50);
  const offset = Number(req.query.offset ?? 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) {
    res.status(400).json({ success: false, error: 'limit must be 1-100 and offset must be a non-negative integer' });
    return null;
  }
  return { limit, offset };
}

async function withClient(res, handler) {
  let client;
  try {
    client = await pool.connect();
    await handler(client);
  } catch (err) {
    console.error('[Integration API] Request failed:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Internal server error' });
  } finally {
    if (client) client.release();
  }
}

function publicUser(row) {
  return {
    id: row.id,
    bubble_id: row.bubble_id,
    email: row.email,
    access_level: row.access_level,
    linked_agent_profile: row.linked_agent_profile,
    name: row.name ?? row.agent_name ?? null,
    contact: row.contact ?? row.agent_contact ?? null,
    banker: row.banker ?? row.agent_banker ?? null,
    bankin_account: row.bankin_account ?? row.agent_bankin_account ?? null,
    user_signature: row.user_signature ?? null,
    profile_picture: row.profile_picture ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null
  };
}

const userSelect = `SELECT u.*, a.name AS agent_name, a.contact AS agent_contact,
  a.banker AS agent_banker, a.bankin_account AS agent_bankin_account
  FROM "user" u LEFT JOIN LATERAL (
    SELECT name, contact, banker, bankin_account FROM agent
    WHERE bubble_id = u.linked_agent_profile OR linked_user_login = u.bubble_id
    ORDER BY CASE WHEN bubble_id = u.linked_agent_profile THEN 0 ELSE 1 END LIMIT 1
  ) a ON true`;

router.get('/api/integration/docs', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/templates/integration_api_docs.html'));
});

router.use('/api/integration/v1', requireIntegrationPassword);

router.get('/api/integration/v1/users', (req, res) => {
  const page = pageParams(req, res);
  if (!page) return;
  return withClient(res, async (client) => {
    const result = await client.query(`${userSelect} ORDER BY u.id DESC LIMIT $1 OFFSET $2`, [page.limit, page.offset]);
    res.json({ success: true, data: result.rows.map(publicUser), ...page });
  });
});

router.get('/api/integration/v1/users/:id', (req, res) => withClient(res, async (client) => {
  const result = await client.query(`${userSelect} WHERE u.bubble_id = $1 OR u.id::text = $1 LIMIT 1`, [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ success: false, error: 'User not found' });
  return res.json({ success: true, data: publicUser(result.rows[0]) });
}));

router.patch('/api/integration/v1/users/:id', (req, res) => withClient(res, async (client) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ success: false, error: 'A JSON object is required' });
  }
  const fields = Object.keys(body);
  if (!fields.length || fields.some((field) => !USER_FIELDS.includes(field))) {
    return res.status(400).json({ success: false, error: `Only these fields can be edited: ${USER_FIELDS.join(', ')}` });
  }
  if (fields.some((field) => body[field] !== null && (typeof body[field] !== 'string' || body[field].length > 2000))) {
    return res.status(400).json({ success: false, error: 'Values must be strings of at most 2000 characters or null' });
  }
  if ('email' in body && body.email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return res.status(400).json({ success: false, error: 'Invalid email' });
  }
  if ('contact' in body && body.contact !== null && !/^0\d{9,10}$/.test(body.contact)) {
    return res.status(400).json({ success: false, error: 'Invalid mobile number format' });
  }

  await client.query('BEGIN');
  try {
    const existing = await client.query('SELECT id, bubble_id, linked_agent_profile FROM "user" WHERE bubble_id = $1 OR id::text = $1 LIMIT 1 FOR UPDATE', [req.params.id]);
    if (!existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const columns = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user'");
    const available = new Set(columns.rows.map((row) => row.column_name));
    const userFields = fields.filter((field) => available.has(field));
    if (userFields.length) {
      const assignments = userFields.map((field, index) => `"${field}" = $${index + 1}`);
      if (available.has('updated_at')) assignments.push('updated_at = NOW()');
      await client.query(`UPDATE "user" SET ${assignments.join(', ')} WHERE id = $${userFields.length + 1}`,
        [...userFields.map((field) => body[field]), existing.rows[0].id]);
    }
    const agentFields = fields.filter((field) => ['email', 'name', 'contact', 'banker', 'bankin_account'].includes(field));
    if (agentFields.length) {
      const assignments = agentFields.map((field, index) => `"${field}" = $${index + 1}`);
      assignments.push('updated_at = NOW()');
      await client.query(`UPDATE agent SET ${assignments.join(', ')} WHERE bubble_id = $${agentFields.length + 1} OR linked_user_login = $${agentFields.length + 2}`,
        [...agentFields.map((field) => body[field]), existing.rows[0].linked_agent_profile, existing.rows[0].bubble_id]);
    }
    const updated = await client.query(`${userSelect} WHERE u.id = $1 LIMIT 1`, [existing.rows[0].id]);
    await client.query('COMMIT');
    return res.json({ success: true, data: publicUser(updated.rows[0]) });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}));

for (const [resource, config] of Object.entries(RESOURCE_TABLES)) {
  router.get(`/api/integration/v1/${resource}`, (req, res) => {
    const page = pageParams(req, res);
    if (!page) return;
    return withClient(res, async (client) => {
      const filterValue = req.query[config.filter];
      if (filterValue !== undefined && (typeof filterValue !== 'string' || !filterValue.trim())) {
        return res.status(400).json({ success: false, error: `Invalid ${config.filter}` });
      }
      const where = filterValue && resource === 'payments'
        ? `WHERE linked_invoice = $3 OR bubble_id = ANY((SELECT COALESCE(linked_payment, ARRAY[]::text[]) FROM invoice WHERE bubble_id = $3 LIMIT 1))`
        : filterValue ? `WHERE ${config.filter} = $3` : '';
      const params = filterValue ? [page.limit, page.offset, filterValue] : [page.limit, page.offset];
      const result = await client.query(`SELECT * FROM ${config.table} ${where} ORDER BY created_at DESC, bubble_id DESC LIMIT $1 OFFSET $2`, params);
      return res.json({ success: true, data: result.rows, ...page });
    });
  });

  router.get(`/api/integration/v1/${resource}/:id`, (req, res) => withClient(res, async (client) => {
    const result = await client.query(`SELECT * FROM ${config.table} WHERE bubble_id = $1 LIMIT 1`, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, error: `${resource} not found` });
    return res.json({ success: true, data: result.rows[0] });
  }));
}

module.exports = router;
