/**
 * TNB Bill Subsidy Promo (runs until 31 Dec 2026).
 *
 * RM0.75 per panel per day, 0-60 days (deposit day until installation is
 * finished, max 60 days). Staff set the days with a slider in Invoice Office
 * and upload the customer's TNB bills (dated after the deposit date).
 *
 * The subsidy lives in its own table so it survives "Edit Invoice", which
 * deletes and rebuilds every invoice_item row. The discount itself is an
 * invoice_item with inv_item_type = 'tnb_bill_subsidy' (negative amount).
 *
 * Nothing here may stop an invoice from saving or rendering: every failure is
 * logged and the invoice carries on without the subsidy line.
 */
const crypto = require('crypto');

const RATE_PER_PANEL_PER_DAY = 0.75;
const MAX_DAYS = 60;
const MAX_AMOUNT = 1000; // subsidy is capped at RM1,000 per invoice
const PROMO_END_DATE = '2026-12-31';
const ITEM_TYPE = 'tnb_bill_subsidy';
const ITEM_SORT = 250;

let schemaReady = false;

async function ensureTnbBillSubsidySchema(client) {
  if (schemaReady) return;
  await client.query(`
    CREATE TABLE IF NOT EXISTS invoice_tnb_bill_subsidy (
      invoice_bubble_id TEXT PRIMARY KEY,
      panel_qty INTEGER NOT NULL DEFAULT 0,
      rate NUMERIC(10,2) NOT NULL DEFAULT ${RATE_PER_PANEL_PER_DAY},
      days INTEGER NOT NULL DEFAULT 0,
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      tnb_bill_urls TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
      item_bubble_id TEXT,
      updated_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  schemaReady = true;
}

function clampDays(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, MAX_DAYS);
}

function computeAmount(panelQty, days, rate = RATE_PER_PANEL_PER_DAY) {
  const panels = Math.max(0, parseInt(panelQty, 10) || 0);
  const r = Number(rate) || RATE_PER_PANEL_PER_DAY;
  const raw = Math.round(panels * clampDays(days) * r * 100) / 100;
  return Math.min(raw, MAX_AMOUNT);
}

function isPromoActive(now = new Date()) {
  // Malaysia time (UTC+8): promo runs through the end of 31 Dec 2026.
  const myDate = new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  return myDate <= PROMO_END_DATE;
}

function buildDescription(row) {
  const panels = parseInt(row.panel_qty, 10) || 0;
  const days = clampDays(row.days);
  const rate = (Number(row.rate) || RATE_PER_PANEL_PER_DAY).toFixed(2);
  const raw = Math.round(panels * days * Number(rate) * 100) / 100;
  const capNote = raw > MAX_AMOUNT ? `, capped at RM${MAX_AMOUNT.toLocaleString('en-MY')}` : '';
  return `TNB Bill Subsidy Promo (${panels} panels × ${days} days × RM${rate}${capNote})`;
}

/** Panel count from the invoice's package item, else the invoice package. */
async function getInvoicePanelQty(client, invoiceBubbleId) {
  const res = await client.query(
    `SELECT COALESCE(
        (SELECT p.panel_qty
           FROM invoice_item ii
           JOIN package p ON p.bubble_id = ii.linked_package OR p.id::text = ii.linked_package
          WHERE ii.linked_invoice = $1 AND ii.is_a_package = TRUE
          ORDER BY ii.sort ASC NULLS LAST
          LIMIT 1),
        (SELECT p.panel_qty
           FROM invoice i
           JOIN package p ON p.bubble_id = i.linked_package OR p.id::text = i.linked_package
          WHERE i.bubble_id = $1
          LIMIT 1),
        0) AS panel_qty`,
    [invoiceBubbleId]
  );
  return parseInt(res.rows[0]?.panel_qty, 10) || 0;
}

async function getSubsidyRow(client, invoiceBubbleId) {
  await ensureTnbBillSubsidySchema(client);
  const res = await client.query(
    'SELECT * FROM invoice_tnb_bill_subsidy WHERE invoice_bubble_id = $1 LIMIT 1',
    [invoiceBubbleId]
  );
  return res.rows[0] || null;
}

/** Read-only lookup for renderers: never throws, returns null on any problem. */
async function getSubsidyRowSafe(client, invoiceBubbleId) {
  try {
    return await getSubsidyRow(client, invoiceBubbleId);
  } catch (err) {
    console.error('[TnbBillSubsidy] read failed (invoice still renders):', invoiceBubbleId, err.message);
    return null;
  }
}

async function ensureSubsidyRow(client, invoiceBubbleId, userId) {
  await ensureTnbBillSubsidySchema(client);
  await client.query(
    `INSERT INTO invoice_tnb_bill_subsidy (invoice_bubble_id, updated_by)
     VALUES ($1, $2)
     ON CONFLICT (invoice_bubble_id) DO NOTHING`,
    [invoiceBubbleId, userId ? String(userId) : null]
  );
  return getSubsidyRow(client, invoiceBubbleId);
}

/**
 * Make the invoice's subsidy line match the stored row: remove any old
 * subsidy line, add the new one (if amount > 0), and move total_amount /
 * balance_due by the difference. Caller owns the transaction.
 */
async function syncSubsidyLineItem(client, invoiceBubbleId, row) {
  const existing = await client.query(
    `SELECT bubble_id, amount FROM invoice_item
     WHERE linked_invoice = $1 AND inv_item_type = $2`,
    [invoiceBubbleId, ITEM_TYPE]
  );
  const oldIds = existing.rows.map((r) => r.bubble_id);
  const oldSum = existing.rows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0); // negative

  if (oldIds.length > 0) {
    await client.query('DELETE FROM invoice_item WHERE bubble_id = ANY($1::text[])', [oldIds]);
  }

  const amount = Math.max(0, parseFloat(row?.amount) || 0);
  let newItemId = null;
  if (amount > 0) {
    newItemId = `item_${crypto.randomBytes(8).toString('hex')}`;
    await client.query(
      `INSERT INTO invoice_item
       (bubble_id, linked_invoice, description, qty, unit_price, amount, inv_item_type, sort, created_at, updated_at, is_a_package)
       VALUES ($1, $2, $3, 1, $4, $4, $5, $6, NOW(), NOW(), FALSE)`,
      [newItemId, invoiceBubbleId, buildDescription(row), -amount, ITEM_TYPE, ITEM_SORT]
    );
  }

  const delta = -oldSum - amount; // add back the old discount, take off the new one
  await client.query(
    `UPDATE invoice
     SET total_amount = COALESCE(total_amount, 0) + $1,
         balance_due = (COALESCE(total_amount, 0) + $1) - COALESCE(paid_amount, 0),
         linked_invoice_item = array_cat(
           ARRAY(SELECT x FROM unnest(COALESCE(linked_invoice_item, ARRAY[]::text[])) AS x WHERE NOT (x = ANY($2::text[]))),
           $3::text[]
         ),
         updated_at = NOW()
     WHERE bubble_id = $4`,
    [delta, oldIds, newItemId ? [newItemId] : [], invoiceBubbleId]
  );

  await client.query(
    'UPDATE invoice_tnb_bill_subsidy SET item_bubble_id = $1 WHERE invoice_bubble_id = $2',
    [newItemId, invoiceBubbleId]
  );
  return newItemId;
}

/** Set the days (0-60) for an invoice. Caller owns the transaction. */
async function setSubsidyDays(client, invoiceBubbleId, days, userId) {
  await ensureSubsidyRow(client, invoiceBubbleId, userId);
  const panelQty = await getInvoicePanelQty(client, invoiceBubbleId);
  const cleanDays = clampDays(days);
  const amount = computeAmount(panelQty, cleanDays);
  await client.query(
    `UPDATE invoice_tnb_bill_subsidy
     SET panel_qty = $1, rate = $2, days = $3, amount = $4, updated_by = $5, updated_at = NOW()
     WHERE invoice_bubble_id = $6`,
    [panelQty, RATE_PER_PANEL_PER_DAY, cleanDays, amount, userId ? String(userId) : null, invoiceBubbleId]
  );
  const row = await getSubsidyRow(client, invoiceBubbleId);
  await syncSubsidyLineItem(client, invoiceBubbleId, row);
  return getSubsidyRow(client, invoiceBubbleId);
}

/**
 * After "Edit Invoice" rebuilds every line item, put the subsidy line back.
 * Runs inside the edit transaction under a savepoint: if anything fails the
 * edit still saves (without the subsidy line) and the problem is logged.
 */
async function reapplyAfterInvoiceRebuild(client, invoiceBubbleId) {
  try {
    await client.query('SAVEPOINT tnb_bill_subsidy_reapply');
  } catch (err) {
    console.error('[TnbBillSubsidy] savepoint failed, subsidy not re-applied:', invoiceBubbleId, err.message);
    return;
  }
  try {
    const row = await getSubsidyRow(client, invoiceBubbleId);
    if (row && (parseFloat(row.amount) || 0) > 0) {
      await syncSubsidyLineItem(client, invoiceBubbleId, row);
    }
    await client.query('RELEASE SAVEPOINT tnb_bill_subsidy_reapply');
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT tnb_bill_subsidy_reapply').catch(() => {});
    console.error('[TnbBillSubsidy] re-apply after edit failed (edit still saved, subsidy line missing):', invoiceBubbleId, err.message);
  }
}

async function addSubsidyBillUrl(client, invoiceBubbleId, url, userId) {
  await ensureSubsidyRow(client, invoiceBubbleId, userId);
  await client.query(
    `UPDATE invoice_tnb_bill_subsidy
     SET tnb_bill_urls = array_append(COALESCE(tnb_bill_urls, ARRAY[]::text[]), $1),
         updated_by = $2, updated_at = NOW()
     WHERE invoice_bubble_id = $3`,
    [url, userId ? String(userId) : null, invoiceBubbleId]
  );
  return getSubsidyRow(client, invoiceBubbleId);
}

async function removeSubsidyBillUrl(client, invoiceBubbleId, url, userId) {
  await ensureSubsidyRow(client, invoiceBubbleId, userId);
  await client.query(
    `UPDATE invoice_tnb_bill_subsidy
     SET tnb_bill_urls = array_remove(COALESCE(tnb_bill_urls, ARRAY[]::text[]), $1),
         updated_by = $2, updated_at = NOW()
     WHERE invoice_bubble_id = $3`,
    [url, userId ? String(userId) : null, invoiceBubbleId]
  );
  return getSubsidyRow(client, invoiceBubbleId);
}

/** Shape sent to the office page and attached to the invoice for rendering. */
function toPublicSummary(row, panelQtyFallback = 0) {
  const panelQty = parseInt(row?.panel_qty, 10) || panelQtyFallback || 0;
  const days = clampDays(row?.days);
  const rate = Number(row?.rate) || RATE_PER_PANEL_PER_DAY;
  return {
    panel_qty: panelQty,
    rate,
    days,
    max_days: MAX_DAYS,
    amount: parseFloat(row?.amount) || 0,
    max_amount: computeAmount(panelQty, MAX_DAYS, rate),
    cap_amount: MAX_AMOUNT,
    tnb_bill_urls: Array.isArray(row?.tnb_bill_urls) ? row.tnb_bill_urls : [],
    promo_end_date: PROMO_END_DATE,
    promo_active: isPromoActive(),
    updated_at: row?.updated_at || null
  };
}

module.exports = {
  RATE_PER_PANEL_PER_DAY,
  MAX_DAYS,
  MAX_AMOUNT,
  PROMO_END_DATE,
  ITEM_TYPE,
  clampDays,
  computeAmount,
  isPromoActive,
  getInvoicePanelQty,
  getSubsidyRow,
  getSubsidyRowSafe,
  setSubsidyDays,
  reapplyAfterInvoiceRebuild,
  addSubsidyBillUrl,
  removeSubsidyBillUrl,
  toPublicSummary
};
