/**
 * src/core/attachments/repo.js
 *
 * Every read and write of ee_attachment goes through here. No SQL for this
 * table anywhere else.
 *
 * Delete is a flag on the row, not a move to a second table. The legacy path
 * had to copy a URL into recycle_bin_upload because the "record" was a string
 * inside a text[] and there was nowhere else to put the who/when. Once the
 * attachment is a row, restore is one UPDATE and the recycle bin is a WHERE
 * clause — which also means a deleted attachment cannot drift out of sync with
 * its own audit trail, because they are the same row.
 *
 * Missing-table tolerance mirrors recycleBin.js: reads degrade to empty and warn
 * once, writes fail loudly with an actionable message. A server booted ahead of
 * its migration should render a page, not 500 on every request.
 */

'use strict';

let hasWarnedMissingTable = false;

function isMissingTableError(err) {
    if (!err) return false;
    if (err.code === '42P01') return true;
    return /relation\s+"?ee_attachment"?\s+does not exist/i.test(String(err.message || ''));
}

function warnMissingTable() {
    if (hasWarnedMissingTable) return;
    hasWarnedMissingTable = true;
    console.warn('[Attachments] ee_attachment table is missing. Returning empty attachment state until the migration is applied.');
}

function buildMissingTableError(action) {
    const err = new Error(`Attachments are not ready yet. Please apply the ee_attachment migration before trying to ${action}.`);
    err.code = 'EE_ATTACHMENT_TABLE_MISSING';
    return err;
}

/**
 * Adds camelCase aliases without dropping the snake_case originals — existing
 * Invoice Office render code reads snake_case, new code reads camelCase.
 */
function normalizeRow(row) {
    if (!row) return null;
    return {
        ...row,
        attachmentId: row.id,
        ownerType: row.owner_type,
        ownerId: row.owner_id,
        docType: row.doc_type,
        url: row.file_url,
        fileUrl: row.file_url,
        storageSubdir: row.storage_subdir,
        storageKey: row.storage_key,
        originalFilename: row.original_filename,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        sortOrder: row.sort_order,
        uploadedBy: row.uploaded_by,
        uploadedByName: row.uploaded_by_name,
        uploadedAt: row.uploaded_at,
        deletedAt: row.deleted_at,
        deletedBy: row.deleted_by,
        deletedByName: row.deleted_by_name,
        floor: row.metadata_json?.floor ?? null,
        metadata: row.metadata_json || {},
    };
}

const INSERT_COLUMNS = `
    owner_type, owner_id, linked_customer, module,
    category, doc_type, sort_order, caption,
    file_url, storage_subdir, storage_key, original_filename, mime_type, size_bytes, checksum_sha256,
    uploaded_by, uploaded_by_name, uploaded_by_role,
    taken_at, gps_lat, gps_lng,
    metadata_json
`;

async function insertAttachment(client, entry = {}) {
    if (!client) throw new Error('insertAttachment requires a database client.');
    if (!entry.ownerType || !entry.ownerId || !entry.category || !entry.docType || !entry.fileUrl) {
        throw new Error('insertAttachment requires ownerType, ownerId, category, docType, and fileUrl.');
    }

    try {
        const result = await client.query(
            `INSERT INTO ee_attachment (${INSERT_COLUMNS})
             VALUES ($1,$2,$3,$4,$5,$6,
                     COALESCE($7, (
                        SELECT COALESCE(MAX(sort_order) + 1, 0) FROM ee_attachment
                        WHERE owner_type = $1 AND owner_id = $2 AND doc_type = $6 AND deleted_at IS NULL
                     )),
                     $8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
                     COALESCE($22::jsonb, '{}'::jsonb))
             RETURNING *`,
            [
                String(entry.ownerType),
                String(entry.ownerId),
                entry.linkedCustomer ? String(entry.linkedCustomer) : null,
                String(entry.module || 'unknown'),
                String(entry.category),
                String(entry.docType),
                Number.isInteger(entry.sortOrder) ? entry.sortOrder : null,
                entry.caption ? String(entry.caption) : null,
                String(entry.fileUrl),
                entry.storageSubdir ? String(entry.storageSubdir) : null,
                entry.storageKey ? String(entry.storageKey) : null,
                entry.originalFilename ? String(entry.originalFilename) : null,
                entry.mimeType ? String(entry.mimeType) : null,
                Number.isFinite(entry.sizeBytes) ? Math.round(entry.sizeBytes) : null,
                entry.checksumSha256 ? String(entry.checksumSha256) : null,
                entry.uploadedBy ? String(entry.uploadedBy) : null,
                entry.uploadedByName ? String(entry.uploadedByName) : null,
                entry.uploadedByRole ? String(entry.uploadedByRole) : null,
                entry.takenAt || null,
                Number.isFinite(entry.gpsLat) ? entry.gpsLat : null,
                Number.isFinite(entry.gpsLng) ? entry.gpsLng : null,
                entry.metadata ? JSON.stringify(entry.metadata) : null,
            ]
        );

        return normalizeRow(result.rows[0] || null);
    } catch (err) {
        if (isMissingTableError(err)) {
            warnMissingTable();
            throw buildMissingTableError('upload files');
        }
        throw err;
    }
}

/**
 * All attachments for one record, active first then deleted.
 *
 * Returns both in a single query on purpose: the checklist and its recycle bin
 * render together, and two round trips to paint one screen is one too many on a
 * phone.
 */
async function listForOwner(client, { ownerType, ownerId, category = null, includeDeleted = true } = {}) {
    if (!client) throw new Error('listForOwner requires a database client.');
    if (!ownerType || !ownerId) return [];

    const clauses = ['owner_type = $1', 'owner_id = $2', 'purged_at IS NULL'];
    const params = [String(ownerType), String(ownerId)];

    if (category) {
        params.push(String(category));
        clauses.push(`category = $${params.length}`);
    }
    if (!includeDeleted) {
        clauses.push('deleted_at IS NULL');
    }

    try {
        const result = await client.query(
            `SELECT * FROM ee_attachment
             WHERE ${clauses.join(' AND ')}
             ORDER BY (deleted_at IS NOT NULL), doc_type, sort_order, id`,
            params
        );
        return result.rows.map(normalizeRow);
    } catch (err) {
        if (isMissingTableError(err)) {
            warnMissingTable();
            return [];
        }
        throw err;
    }
}

async function getById(client, id, { forUpdate = false } = {}) {
    if (!client) throw new Error('getById requires a database client.');
    if (!id) return null;

    try {
        const result = await client.query(
            `SELECT * FROM ee_attachment WHERE id = $1 AND purged_at IS NULL${forUpdate ? ' FOR UPDATE' : ''}`,
            [id]
        );
        return normalizeRow(result.rows[0] || null);
    } catch (err) {
        if (isMissingTableError(err)) {
            warnMissingTable();
            return null;
        }
        throw err;
    }
}

async function softDelete(client, id, { deletedBy = null, deletedByName = null } = {}) {
    if (!client) throw new Error('softDelete requires a database client.');

    try {
        const result = await client.query(
            `UPDATE ee_attachment
             SET deleted_at = NOW(),
                 deleted_by = $2,
                 deleted_by_name = $3,
                 restored_at = NULL,
                 restored_by = NULL,
                 updated_at = NOW()
             WHERE id = $1 AND deleted_at IS NULL AND purged_at IS NULL
             RETURNING *`,
            [id, deletedBy ? String(deletedBy) : null, deletedByName ? String(deletedByName) : null]
        );
        return normalizeRow(result.rows[0] || null);
    } catch (err) {
        if (isMissingTableError(err)) {
            warnMissingTable();
            throw buildMissingTableError('delete files');
        }
        throw err;
    }
}

async function restore(client, id, { restoredBy = null, restoredByName = null } = {}) {
    if (!client) throw new Error('restore requires a database client.');

    try {
        const result = await client.query(
            `UPDATE ee_attachment
             SET deleted_at = NULL,
                 deleted_by = NULL,
                 deleted_by_name = NULL,
                 restored_at = NOW(),
                 restored_by = $2,
                 metadata_json = COALESCE(metadata_json, '{}'::jsonb)
                     || jsonb_build_object('restored_by_name', $3::text),
                 updated_at = NOW()
             WHERE id = $1 AND deleted_at IS NOT NULL AND purged_at IS NULL
             RETURNING *`,
            [id, restoredBy ? String(restoredBy) : null, restoredByName ? String(restoredByName) : null]
        );
        return normalizeRow(result.rows[0] || null);
    } catch (err) {
        if (isMissingTableError(err)) {
            warnMissingTable();
            throw buildMissingTableError('restore files');
        }
        throw err;
    }
}

/**
 * Same file already sitting in another slot on the same record.
 *
 * Eight slots on one screen makes it genuinely easy to drop the same photo into
 * two of them by accident, and the result looks like a complete checklist when
 * it is not. Advisory only — the caller decides whether to warn or block.
 */
async function findDuplicate(client, { ownerType, ownerId, checksumSha256, excludeId = null } = {}) {
    if (!client || !checksumSha256 || !ownerType || !ownerId) return null;

    try {
        // excludeId matters: this runs *after* the insert, so without it the
        // freshly written row is itself a candidate and LIMIT 1 can return it
        // instead of the earlier copy — reporting "no duplicate" for a file that
        // has one. Oldest first, so the answer is the original.
        const result = await client.query(
            `SELECT * FROM ee_attachment
             WHERE owner_type = $1 AND owner_id = $2 AND checksum_sha256 = $3
               AND deleted_at IS NULL AND purged_at IS NULL
               AND ($4::bigint IS NULL OR id <> $4::bigint)
             ORDER BY id ASC
             LIMIT 1`,
            [String(ownerType), String(ownerId), String(checksumSha256), excludeId]
        );
        return normalizeRow(result.rows[0] || null);
    } catch (err) {
        if (isMissingTableError(err)) {
            warnMissingTable();
            return null;
        }
        throw err;
    }
}

module.exports = {
    normalizeRow,
    isMissingTableError,
    insertAttachment,
    listForOwner,
    getById,
    softDelete,
    restore,
    findDuplicate,
};
