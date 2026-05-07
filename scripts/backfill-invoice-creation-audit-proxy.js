/**
 * Backfill script: Populate invoice_audit_log with historical invoice creation events.
 * Uses Railway HTTP Proxy (no direct DB connection).
 *
 * The backfill is idempotent:
 * - It only targets invoices that do not already have an invoice creation audit row.
 * - It uses invoice.created_at as the historical audit timestamp.
 *
 * Usage:
 *   PG_PROXY_TOKEN="..." node scripts/backfill-invoice-creation-audit-proxy.js [--dry-run] [--batch-size=100]
 */

'use strict';

const https = require('https');

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE_ARG = process.argv.find((arg) => arg.startsWith('--batch-size='));
const BATCH_SIZE = BATCH_SIZE_ARG ? Math.max(1, parseInt(BATCH_SIZE_ARG.split('=')[1], 10) || 100) : 100;

const PROXY_HOST = process.env.PG_PROXY_HOST || 'pg-proxy-production.up.railway.app';
const PROXY_TOKEN = process.env.PG_PROXY_TOKEN || '';
const DB_NAME = process.env.PG_PROXY_DB_NAME || 'prod_main';

if (!PROXY_TOKEN) {
  console.error('Missing PG_PROXY_TOKEN environment variable.');
  process.exit(1);
}

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      db_name: DB_NAME,
      sql,
      params
    });

    const req = https.request(
      {
        hostname: PROXY_HOST,
        port: 443,
        path: '/api/sql',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${PROXY_TOKEN}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            if (parsed.error) {
              reject(new Error(parsed.error));
              return;
            }
            resolve({ rows: parsed.data || parsed.rows || [] });
          } catch (err) {
            reject(new Error(`Invalid JSON response: ${raw.slice(0, 200)}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function normalizeActorRole(rawRole) {
  if (Array.isArray(rawRole)) {
    return rawRole.join(', ');
  }
  if (rawRole === null || rawRole === undefined) {
    return 'system';
  }
  const value = String(rawRole).trim();
  return value || 'system';
}

function buildChanges(invoice) {
  return [
    { field: 'Invoice Number', after: invoice.invoice_number },
    { field: 'Status', after: invoice.status },
    { field: 'Total Amount', after: invoice.total_amount },
    { field: 'Linked Customer', after: invoice.linked_customer },
    { field: 'Linked Package', after: invoice.linked_package },
    { field: 'Created By', after: invoice.created_by }
  ];
}

async function fetchMissingInvoices(cursor) {
  return query(
    `
      SELECT
        i.id,
        i.bubble_id,
        i.invoice_number,
        i.status,
        i.total_amount,
        i.linked_customer,
        i.linked_package,
        i.created_by,
        i.created_at,
        COALESCE(a.name, 'System') AS actor_name,
        u.contact AS actor_phone,
        u.access_level AS actor_role,
        COALESCE(u.bubble_id, i.created_by) AS actor_user_id
      FROM invoice i
      LEFT JOIN "user" u
        ON u.bubble_id = i.created_by
        OR u.id::text = i.created_by
      LEFT JOIN agent a
        ON a.bubble_id = u.linked_agent_profile
      LEFT JOIN invoice_audit_log al
        ON al.invoice_id = i.id
       AND al.entity_type = 'invoice'
       AND lower(COALESCE(al.action_type, '')) IN ('insert', 'create', 'added')
      WHERE al.id IS NULL
        AND i.created_at IS NOT NULL
        AND i.id > $1
      ORDER BY i.id ASC
      LIMIT $2
    `,
    [cursor, BATCH_SIZE]
  );
}

async function insertBatch(rows) {
  if (rows.length === 0) {
    return { inserted: 0 };
  }

  if (DRY_RUN) {
    const first = rows[0];
    const last = rows[rows.length - 1];
    console.log(
      `[DRY-RUN] Would insert ${rows.length} invoice creation audit rows (invoice ids ${first.id}..${last.id})`
    );
    return { inserted: 0 };
  }

  const payload = rows.map((invoice) => ({
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number || null,
    entity_type: 'invoice',
    entity_id: invoice.bubble_id || null,
    action_type: 'insert',
    changes: buildChanges(invoice),
    actor_user_id: invoice.actor_user_id || invoice.created_by || null,
    actor_phone: invoice.actor_phone || null,
    actor_name: invoice.actor_name || 'System',
    actor_role: normalizeActorRole(invoice.actor_role),
    source_app: 'agent-os',
    application_name: 'invoice-creation-backfill',
    edited_at: invoice.created_at
  }));

  const result = await query(
    `
      WITH payload AS (
        SELECT *
        FROM jsonb_to_recordset($1::jsonb) AS x(
          invoice_id integer,
          invoice_number text,
          entity_type text,
          entity_id text,
          action_type text,
          changes jsonb,
          row_old jsonb,
          row_new jsonb,
          actor_user_id text,
          actor_phone text,
          actor_name text,
          actor_role text,
          source_app text,
          application_name text,
          edited_at timestamptz
        )
      )
        INSERT INTO invoice_audit_log (
        invoice_id,
        invoice_number,
        entity_type,
        entity_id,
        action_type,
        changes,
        actor_user_id,
        actor_phone,
        actor_name,
        actor_role,
        source_app,
        application_name,
        edited_at
      )
      SELECT
        invoice_id,
        invoice_number,
        entity_type,
        entity_id,
        action_type,
        changes,
        actor_user_id,
        actor_phone,
        actor_name,
        actor_role,
        source_app,
        application_name,
        edited_at
      FROM payload
      RETURNING id
    `,
    [JSON.stringify(payload)]
  );

  return { inserted: result.rows.length };
}

async function main() {
  console.log('=== Invoice Creation Audit Backfill ===');
  console.log(`DB: ${DB_NAME}`);
  console.log(`Mode: ${DRY_RUN ? 'dry-run' : 'apply'}`);
  console.log(`Batch size: ${BATCH_SIZE}`);

  let cursor = 0;
  let scanned = 0;
  let inserted = 0;
  let batchNumber = 0;

  while (true) {
    const { rows } = await fetchMissingInvoices(cursor);
    if (rows.length === 0) {
      break;
    }

    batchNumber += 1;
    scanned += rows.length;
    cursor = rows[rows.length - 1].id;

    const result = await insertBatch(rows);
    inserted += result.inserted || 0;

    console.log(
      `[BATCH ${batchNumber}] ${rows.length} invoice(s) processed, cursor now ${cursor}`
    );
  }

  if (DRY_RUN) {
    console.log(`Dry run complete. ${scanned} invoice creation audit row(s) would be inserted.`);
  } else {
    console.log(`Backfill complete. Inserted ${inserted} invoice creation audit row(s).`);
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
