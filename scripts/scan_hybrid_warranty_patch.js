/**
 * Scan and optionally repair hybrid-upgrade warranty data drift.
 *
 * Default mode is read-only:
 *   node scripts/scan_hybrid_warranty_patch.js
 *
 * Apply mode repairs:
 *   - hybrid package clones whose linked_package_item still points to the old string inverter
 *   - invoice headers whose linked_package disagrees with their primary package line item
 *
 * Requires PG_PROXY_TOKEN, or a Hermes vault credential containing:
 *   Authorization header: Bearer <token>
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');

const APPLY = process.argv.includes('--apply');
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? Math.max(1, parseInt(LIMIT_ARG.split('=')[1], 10) || 500) : 500;

const PROXY_HOST = process.env.PG_PROXY_HOST || 'pg-proxy-production.up.railway.app';
const DB_NAME = process.env.PG_PROXY_DB_NAME || 'prod_main';
const VAULT_PATH = process.env.HERMES_VAULT_PATH || 'C:\\Users\\Eternalgy\\.hermes\\vault.json';
const VAULT_CREDENTIAL_ID = process.env.HERMES_POSTGRES_CREDENTIAL_ID || 'Solar Calculator V2 POSTGRES Read Only';

function readProxyTokenFromVault() {
  try {
    const vault = JSON.parse(fs.readFileSync(VAULT_PATH, 'utf8'));
    const credential = (vault.credentials || []).find((entry) => entry.id === VAULT_CREDENTIAL_ID);
    const text = String(credential?.credential || '');
    const match = text.match(/Authorization header:\s*Bearer\s+([^\s]+)/i);
    return match ? match[1] : '';
  } catch (err) {
    return '';
  }
}

const PROXY_TOKEN = process.env.PG_PROXY_TOKEN || readProxyTokenFromVault();

if (!PROXY_TOKEN) {
  console.error('Missing PG_PROXY_TOKEN and no usable Hermes proxy token was found.');
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
            reject(new Error(`Invalid JSON response: ${raw.slice(0, 300)}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function getColumns(tableName) {
  const result = await query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName]
  );
  return result.rows.map((row) => row.column_name);
}

async function findStaleHybridPackageItems() {
  const result = await query(
    `
      WITH hybrid_packages AS (
        SELECT
          p.bubble_id AS package_bubble_id,
          p.package_name,
          p.linked_package_item,
          p.inverter_1 AS target_product_id,
          target_pr.name AS target_product_name,
          app.original_package_bubble_id AS source_package_bubble_id,
          source_pkg.inverter_1 AS source_product_id,
          rule.from_product_bubble_id AS rule_source_product_id,
          rule.to_product_bubble_id AS rule_target_product_id
        FROM package p
        JOIN hybrid_inverter_upgrade_application app
          ON app.new_package_bubble_id = p.bubble_id
        LEFT JOIN hybrid_inverter_upgrade_rule rule
          ON app.upgrade_rule_bubble_id = rule.bubble_id
        LEFT JOIN package source_pkg
          ON source_pkg.bubble_id = app.original_package_bubble_id
        LEFT JOIN product target_pr
          ON p.inverter_1::text = target_pr.bubble_id
          OR p.inverter_1::text = target_pr.id::text
        WHERE p.linked_package_item IS NOT NULL
          AND array_length(p.linked_package_item, 1) > 0
      )
      SELECT
        hp.package_bubble_id,
        hp.package_name,
        hp.linked_package_item,
        hp.target_product_id,
        hp.target_product_name,
        hp.source_package_bubble_id,
        COALESCE(hp.rule_source_product_id, hp.source_product_id) AS source_product_id,
        pi.bubble_id AS stale_package_item_bubble_id,
        pi.product AS stale_product_id,
        stale_pr.name AS stale_product_name
      FROM hybrid_packages hp
      JOIN package_item pi
        ON pi.bubble_id = ANY(hp.linked_package_item::text[])
      LEFT JOIN product stale_pr
        ON pi.product::text = stale_pr.bubble_id
        OR pi.product::text = stale_pr.id::text
      WHERE COALESCE(hp.rule_source_product_id, hp.source_product_id) IS NOT NULL
        AND pi.product::text = COALESCE(hp.rule_source_product_id, hp.source_product_id)::text
        AND pi.product::text <> hp.target_product_id::text
      ORDER BY hp.package_bubble_id
      LIMIT $1
    `,
    [LIMIT]
  );

  return result.rows;
}

async function findInvoicePackageMismatches() {
  const result = await query(
    `
      WITH primary_package_item AS (
        SELECT DISTINCT ON (linked_invoice)
          linked_invoice,
          linked_package,
          bubble_id AS invoice_item_bubble_id
        FROM invoice_item
        WHERE is_a_package = TRUE
          AND linked_package IS NOT NULL
        ORDER BY linked_invoice, sort ASC NULLS LAST, created_at ASC NULLS LAST
      )
      SELECT
        i.bubble_id AS invoice_bubble_id,
        i.invoice_number,
        i.linked_package AS invoice_linked_package,
        ppi.linked_package AS item_linked_package,
        header_inv.name AS header_inverter_name,
        item_inv.name AS item_inverter_name,
        ppi.invoice_item_bubble_id
      FROM invoice i
      JOIN primary_package_item ppi
        ON ppi.linked_invoice = i.bubble_id
      LEFT JOIN package header_pkg
        ON i.linked_package = header_pkg.bubble_id
        OR i.linked_package = header_pkg.id::text
      LEFT JOIN package item_pkg
        ON ppi.linked_package = item_pkg.bubble_id
        OR ppi.linked_package = item_pkg.id::text
      LEFT JOIN product header_inv
        ON header_pkg.inverter_1::text = header_inv.bubble_id
        OR header_pkg.inverter_1::text = header_inv.id::text
      LEFT JOIN product item_inv
        ON item_pkg.inverter_1::text = item_inv.bubble_id
        OR item_pkg.inverter_1::text = item_inv.id::text
      WHERE COALESCE(i.linked_package, '') <> COALESCE(ppi.linked_package, '')
        AND (item_inv.name ILIKE '%hybrid%' OR item_inv.name ILIKE '% H2 %')
        AND NOT (COALESCE(header_inv.name, '') ILIKE '%hybrid%' OR COALESCE(header_inv.name, '') ILIKE '% H2 %')
      ORDER BY i.updated_at DESC NULLS LAST, i.id DESC
      LIMIT $1
    `,
    [LIMIT]
  );

  return result.rows;
}

async function repairStaleHybridPackageItem(staleRow, packageItemColumns) {
  const sourceItemRes = await query(
    `SELECT *
     FROM package_item
     WHERE bubble_id = $1
     LIMIT 1`,
    [staleRow.stale_package_item_bubble_id]
  );
  const sourceItem = sourceItemRes.rows[0];
  if (!sourceItem) return null;

  const clonedItemId = `pitem_${crypto.randomBytes(10).toString('hex')}`;
  const columns = [];
  const values = [];

  for (const columnName of packageItemColumns) {
    if (columnName === 'id') continue;

    let value = sourceItem[columnName];
    if (columnName === 'bubble_id') value = clonedItemId;
    if (columnName === 'product') value = staleRow.target_product_id;
    if (columnName === 'created_at' || columnName === 'updated_at' || columnName === 'modified_date') value = new Date().toISOString();
    if (columnName === 'unique_id') value = clonedItemId;

    columns.push(columnName);
    values.push(value);
  }

  const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
  await query(
    `INSERT INTO package_item (${columns.join(', ')})
     VALUES (${placeholders})`,
    values
  );

  await query(
    `UPDATE package
     SET linked_package_item = array_replace(linked_package_item, $1, $2),
         updated_at = NOW()
     WHERE bubble_id = $3`,
    [staleRow.stale_package_item_bubble_id, clonedItemId, staleRow.package_bubble_id]
  );

  return clonedItemId;
}

async function repairInvoicePackageMismatches() {
  const result = await query(
    `
      WITH primary_package_item AS (
        SELECT DISTINCT ON (linked_invoice)
          linked_invoice,
          linked_package
        FROM invoice_item
        WHERE is_a_package = TRUE
          AND linked_package IS NOT NULL
        ORDER BY linked_invoice, sort ASC NULLS LAST, created_at ASC NULLS LAST
      ),
      stale_hybrid_headers AS (
        SELECT
          i.bubble_id AS invoice_bubble_id,
          ppi.linked_package AS effective_linked_package
        FROM invoice i
        JOIN primary_package_item ppi
          ON ppi.linked_invoice = i.bubble_id
        LEFT JOIN package header_pkg
          ON i.linked_package = header_pkg.bubble_id
          OR i.linked_package = header_pkg.id::text
        LEFT JOIN package item_pkg
          ON ppi.linked_package = item_pkg.bubble_id
          OR ppi.linked_package = item_pkg.id::text
        LEFT JOIN product header_inv
          ON header_pkg.inverter_1::text = header_inv.bubble_id
          OR header_pkg.inverter_1::text = header_inv.id::text
        LEFT JOIN product item_inv
          ON item_pkg.inverter_1::text = item_inv.bubble_id
          OR item_pkg.inverter_1::text = item_inv.id::text
        WHERE COALESCE(i.linked_package, '') <> COALESCE(ppi.linked_package, '')
          AND (item_inv.name ILIKE '%hybrid%' OR item_inv.name ILIKE '% H2 %')
          AND NOT (COALESCE(header_inv.name, '') ILIKE '%hybrid%' OR COALESCE(header_inv.name, '') ILIKE '% H2 %')
      )
      UPDATE invoice i
      SET linked_package = stale_hybrid_headers.effective_linked_package,
          updated_at = NOW()
      FROM stale_hybrid_headers
      WHERE stale_hybrid_headers.invoice_bubble_id = i.bubble_id
      RETURNING i.bubble_id, i.invoice_number, i.linked_package
    `
  );
  return result.rows;
}

async function main() {
  console.log('=== Hybrid Warranty Drift Scan ===');
  console.log(`DB: ${DB_NAME}`);
  console.log(`Mode: ${APPLY ? 'apply' : 'scan-only'}`);
  console.log(`Limit: ${LIMIT}`);

  const stalePackageItems = await findStaleHybridPackageItems();
  const invoiceMismatches = await findInvoicePackageMismatches();

  console.log(`Stale hybrid package item links: ${stalePackageItems.length}`);
  console.log(`Invoice/package header mismatches: ${invoiceMismatches.length}`);

  if (stalePackageItems.length > 0) {
    console.log('\nStale hybrid package item samples:');
    console.log(JSON.stringify(stalePackageItems.slice(0, 20), null, 2));
  }

  if (invoiceMismatches.length > 0) {
    console.log('\nInvoice/package mismatch samples:');
    console.log(JSON.stringify(invoiceMismatches.slice(0, 20), null, 2));
  }

  if (!APPLY) {
    console.log('\nScan complete. Re-run with --apply to repair detected drift.');
    return;
  }

  const packageItemColumns = await getColumns('package_item');
  let repairedPackageItems = 0;

  for (const row of stalePackageItems) {
    const clonedItemId = await repairStaleHybridPackageItem(row, packageItemColumns);
    if (clonedItemId) {
      repairedPackageItems += 1;
      console.log(`Repaired package ${row.package_bubble_id}: ${row.stale_package_item_bubble_id} -> ${clonedItemId}`);
    }
  }

  const repairedInvoices = await repairInvoicePackageMismatches();
  console.log(`\nRepaired stale hybrid package item links: ${repairedPackageItems}`);
  console.log(`Repaired invoice/package header mismatches: ${repairedInvoices.length}`);
}

main().catch((err) => {
  console.error('Hybrid warranty drift scan failed:', err.message);
  process.exit(1);
});
