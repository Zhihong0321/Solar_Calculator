'use strict';

let hasWarnedMissingRecycleBinTable = false;

function isMissingRecycleBinTableError(err) {
    if (!err) return false;
    if (err.code === '42P01') return true;
    return /relation\s+"?recycle_bin_upload"?\s+does not exist/i.test(String(err.message || ''));
}

function warnMissingRecycleBinTable() {
    if (hasWarnedMissingRecycleBinTable) return;
    hasWarnedMissingRecycleBinTable = true;
    console.warn('[UploadProcessor] recycle_bin_upload table is missing. Falling back to empty deleted-upload state until the migration is applied.');
}

function buildMissingRecycleBinTableError(action) {
    const err = new Error(`Recycle bin is not ready yet. Please apply the recycle_bin_upload migration before trying to ${action}.`);
    err.code = 'RECYCLE_BIN_TABLE_MISSING';
    return err;
}

function normalizeRecycleBinRow(row) {
    if (!row) return null;
    return {
        ...row,
        recycleBinId: row.id,
        field: row.field_key,
        fieldKey: row.field_key,
        url: row.file_url,
        fileUrl: row.file_url,
        storageSubdir: row.storage_subdir,
        originalFilename: row.original_filename,
        mimeType: row.mime_type,
        linkedRecordType: row.linked_record_type,
        linkedRecordId: row.linked_record_id,
        deletedBy: row.deleted_by,
        deletedByName: row.deleted_by_name,
        deletedByRole: row.deleted_by_role,
        deletedAt: row.deleted_at,
        restoredBy: row.restored_by,
        restoredAt: row.restored_at,
        purgedAt: row.purged_at,
        metadataJson: row.metadata_json,
    };
}

async function insertRecycleBinEntry(client, entry = {}) {
    if (!client) throw new Error('insertRecycleBinEntry requires a database client.');
    if (!entry.module || !entry.linkedRecordType || !entry.linkedRecordId || !entry.fieldKey || !entry.fileUrl) {
        throw new Error('insertRecycleBinEntry requires module, linkedRecordType, linkedRecordId, fieldKey, and fileUrl.');
    }

    try {
        const result = await client.query(
            `INSERT INTO recycle_bin_upload (
                module,
                linked_record_type,
                linked_record_id,
                field_key,
                file_url,
                storage_subdir,
                original_filename,
                mime_type,
                deleted_by,
                deleted_by_name,
                deleted_by_role,
                metadata_json
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12::jsonb, '{}'::jsonb)
            )
            RETURNING *`,
            [
                String(entry.module),
                String(entry.linkedRecordType),
                String(entry.linkedRecordId),
                String(entry.fieldKey),
                String(entry.fileUrl),
                entry.storageSubdir ? String(entry.storageSubdir) : null,
                entry.originalFilename ? String(entry.originalFilename) : null,
                entry.mimeType ? String(entry.mimeType) : null,
                entry.deletedBy ? String(entry.deletedBy) : null,
                entry.deletedByName ? String(entry.deletedByName) : null,
                entry.deletedByRole ? String(entry.deletedByRole) : null,
                entry.metadataJson ? JSON.stringify(entry.metadataJson) : null,
            ]
        );

        return normalizeRecycleBinRow(result.rows[0] || null);
    } catch (err) {
        if (isMissingRecycleBinTableError(err)) {
            warnMissingRecycleBinTable();
            throw buildMissingRecycleBinTableError('delete files');
        }
        throw err;
    }
}

async function listRecycleBinEntries(client, filters = {}) {
    if (!client) throw new Error('listRecycleBinEntries requires a database client.');

    const clauses = ['purged_at IS NULL', 'restored_at IS NULL'];
    const params = [];

    if (filters.module) {
        params.push(String(filters.module));
        clauses.push(`module = $${params.length}`);
    }
    if (filters.linkedRecordType) {
        params.push(String(filters.linkedRecordType));
        clauses.push(`linked_record_type = $${params.length}`);
    }
    if (filters.linkedRecordId) {
        params.push(String(filters.linkedRecordId));
        clauses.push(`linked_record_id = $${params.length}`);
    }
    if (filters.fieldKey) {
        params.push(String(filters.fieldKey));
        clauses.push(`field_key = $${params.length}`);
    }

    try {
        const result = await client.query(
            `SELECT *
             FROM recycle_bin_upload
             WHERE ${clauses.join(' AND ')}
             ORDER BY deleted_at DESC, id DESC`,
            params
        );

        return result.rows.map(normalizeRecycleBinRow);
    } catch (err) {
        if (isMissingRecycleBinTableError(err)) {
            warnMissingRecycleBinTable();
            return [];
        }
        throw err;
    }
}

async function getActiveRecycleBinEntry(client, id, filters = {}) {
    if (!client) throw new Error('getActiveRecycleBinEntry requires a database client.');
    if (!id) return null;

    const clauses = ['id = $1', 'purged_at IS NULL', 'restored_at IS NULL'];
    const params = [id];

    if (filters.module) {
        params.push(String(filters.module));
        clauses.push(`module = $${params.length}`);
    }
    if (filters.linkedRecordType) {
        params.push(String(filters.linkedRecordType));
        clauses.push(`linked_record_type = $${params.length}`);
    }
    if (filters.linkedRecordId) {
        params.push(String(filters.linkedRecordId));
        clauses.push(`linked_record_id = $${params.length}`);
    }
    if (filters.fieldKey) {
        params.push(String(filters.fieldKey));
        clauses.push(`field_key = $${params.length}`);
    }

    try {
        const result = await client.query(
            `SELECT *
             FROM recycle_bin_upload
             WHERE ${clauses.join(' AND ')}
             FOR UPDATE`,
            params
        );

        return normalizeRecycleBinRow(result.rows[0] || null);
    } catch (err) {
        if (isMissingRecycleBinTableError(err)) {
            warnMissingRecycleBinTable();
            return null;
        }
        throw err;
    }
}

async function markRecycleBinRestored(client, id, restoredBy, restoredByName = null) {
    if (!client) throw new Error('markRecycleBinRestored requires a database client.');
    if (!id) throw new Error('markRecycleBinRestored requires an id.');

    try {
        const result = await client.query(
            `UPDATE recycle_bin_upload
             SET restored_at = NOW(),
                 restored_by = $2,
                 metadata_json = COALESCE(metadata_json, '{}'::jsonb) || jsonb_build_object('restored_by_name', $3)
             WHERE id = $1
             RETURNING *`,
            [id, restoredBy ? String(restoredBy) : null, restoredByName ? String(restoredByName) : null]
        );

        return normalizeRecycleBinRow(result.rows[0] || null);
    } catch (err) {
        if (isMissingRecycleBinTableError(err)) {
            warnMissingRecycleBinTable();
            throw buildMissingRecycleBinTableError('restore files');
        }
        throw err;
    }
}

module.exports = {
    normalizeRecycleBinRow,
    isMissingRecycleBinTableError,
    insertRecycleBinEntry,
    listRecycleBinEntries,
    getActiveRecycleBinEntry,
    markRecycleBinRestored,
};
