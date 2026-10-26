/**
 * [AI-CONTEXT]
 * Domain: Invoicing Terms & Conditions Versions (persistence)
 * Primary Responsibility: Read/write invoice_tnc_version rows and the invoice.tnc_version_id pin.
 * Stability: A published version is frozen — only drafts (published_at IS NULL) can be edited or
 *   deleted, so a signed document always keeps the exact wording the customer agreed to.
 *   Every read checks the schema first (to_regclass never errors), so code deployed before the
 *   migration — including callers inside a transaction — keeps working on the legacy policies.
 */

const VERSION_COLUMNS = `id, label, terms_and_conditions, payment_schedule, schedule_label, notes,
  is_current, published_at, created_by, created_at, updated_at`;

let schemaConfirmed = false;

async function hasTncSchema(client) {
  if (schemaConfirmed) return true;
  const result = await client.query(
    `SELECT to_regclass('public.invoice_tnc_version') IS NOT NULL AS has_table,
            EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'invoice' AND column_name = 'tnc_version_id'
            ) AS has_column`
  );
  const row = result.rows[0] || {};
  schemaConfirmed = Boolean(row.has_table && row.has_column);
  return schemaConfirmed;
}

/**
 * The versions an invoice can render: the one it is pinned to (signed documents) and the current one.
 * Returns null when versions are not set up yet, so callers fall back to the legacy policies.
 */
async function loadInvoiceTncVersions(client, tncVersionId) {
  try {
    if (!(await hasTncSchema(client))) return null;

    const pinnedId = tncVersionId ? Number(tncVersionId) : null;
    const result = await client.query(
      `SELECT ${VERSION_COLUMNS} FROM invoice_tnc_version WHERE is_current OR id = $1`,
      [pinnedId]
    );
    const current = result.rows.find((row) => row.is_current) || null;
    if (!current) return null;

    const pinned = pinnedId ? (result.rows.find((row) => row.id === pinnedId) || null) : null;
    return { pinned, current };
  } catch (err) {
    console.warn('[TNC] Failed to load TNC versions, using legacy terms policies:', err.message);
    return null;
  }
}

/**
 * Pin an invoice to the version the customer saw when signing. An earlier pin is never replaced.
 * `shownVersionId` is only honoured when it is a published version; otherwise the current one is used.
 */
async function pinInvoiceTncVersion(client, bubbleId, shownVersionId = null) {
  if (!(await hasTncSchema(client))) return null;

  const shownId = Number.isInteger(Number(shownVersionId)) && Number(shownVersionId) > 0
    ? Number(shownVersionId)
    : null;

  const result = await client.query(
    `UPDATE invoice
     SET tnc_version_id = COALESCE(
       (SELECT id FROM invoice_tnc_version WHERE id = $2 AND published_at IS NOT NULL),
       (SELECT id FROM invoice_tnc_version WHERE is_current LIMIT 1)
     )
     WHERE bubble_id = $1 AND tnc_version_id IS NULL
     RETURNING tnc_version_id`,
    [bubbleId, shownId]
  );
  return result.rows[0]?.tnc_version_id ?? null;
}

async function listTncVersions(client) {
  const result = await client.query(
    `SELECT v.id, v.label, v.schedule_label, v.notes, v.is_current, v.published_at,
            v.created_by, v.created_at, v.updated_at,
            (SELECT COUNT(*)::int FROM invoice i WHERE i.tnc_version_id = v.id) AS pinned_documents
     FROM invoice_tnc_version v
     ORDER BY v.id DESC`
  );
  return result.rows;
}

async function getTncVersionById(client, id) {
  const result = await client.query(
    `SELECT ${VERSION_COLUMNS} FROM invoice_tnc_version WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function createTncVersion(client, data, createdBy = null) {
  const result = await client.query(
    `INSERT INTO invoice_tnc_version
       (label, terms_and_conditions, payment_schedule, schedule_label, notes, created_by)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6)
     RETURNING ${VERSION_COLUMNS}`,
    [
      data.label,
      data.terms_and_conditions,
      JSON.stringify(data.payment_schedule),
      data.schedule_label,
      data.notes,
      createdBy
    ]
  );
  return result.rows[0];
}

/** Returns null when the version does not exist, or { locked: true } when it is already published. */
async function updateDraftTncVersion(client, id, data) {
  const result = await client.query(
    `UPDATE invoice_tnc_version
     SET label = $2, terms_and_conditions = $3, payment_schedule = $4::jsonb,
         schedule_label = $5, notes = $6, updated_at = NOW()
     WHERE id = $1 AND published_at IS NULL
     RETURNING ${VERSION_COLUMNS}`,
    [
      id,
      data.label,
      data.terms_and_conditions,
      JSON.stringify(data.payment_schedule),
      data.schedule_label,
      data.notes
    ]
  );
  if (result.rows[0]) return result.rows[0];
  return (await getTncVersionById(client, id)) ? { locked: true } : null;
}

async function deleteDraftTncVersion(client, id) {
  const result = await client.query(
    `DELETE FROM invoice_tnc_version WHERE id = $1 AND published_at IS NULL RETURNING id`,
    [id]
  );
  if (result.rows[0]) return { deleted: true };
  return (await getTncVersionById(client, id)) ? { locked: true } : null;
}

/** Make a version current. Publishing freezes it; re-publishing an older version just switches back. */
async function publishTncVersion(client, id) {
  await client.query('BEGIN');
  try {
    const target = await client.query(
      `SELECT id FROM invoice_tnc_version WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (!target.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query(`UPDATE invoice_tnc_version SET is_current = false WHERE is_current AND id <> $1`, [id]);
    const result = await client.query(
      `UPDATE invoice_tnc_version
       SET is_current = true, published_at = COALESCE(published_at, NOW()), updated_at = NOW()
       WHERE id = $1
       RETURNING ${VERSION_COLUMNS}`,
      [id]
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

module.exports = {
  hasTncSchema,
  loadInvoiceTncVersions,
  pinInvoiceTncVersion,
  listTncVersions,
  getTncVersionById,
  createTncVersion,
  updateDraftTncVersion,
  deleteDraftTncVersion,
  publishTncVersion
};
