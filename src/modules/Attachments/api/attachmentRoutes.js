/**
 * src/modules/Attachments/api/attachmentRoutes.js
 *
 * One upload surface for every module.
 *
 * The pattern this replaces put a FILE_FIELDS map and a ~200-line handler in
 * each feature's route file, with the DB column baked into the field config —
 * so a new document type meant a migration, a new column, a new field entry and
 * a copy of the handler. Here the document type is a row value, so adding one
 * is an entry in src/core/attachments/registry.js and nothing else.
 *
 * Routes:
 *   POST   /api/v1/attachments/:ownerType/:ownerId/:docType
 *   GET    /api/v1/attachments/:ownerType/:ownerId
 *   DELETE /api/v1/attachments/:ownerType/:ownerId/:id
 *   POST   /api/v1/attachments/:ownerType/:ownerId/:id/restore
 *
 * :ownerType and :ownerId are repeated on the delete and restore routes rather
 * than resolved from the attachment id. The ownership check then runs on the
 * same pair for every verb, and an id from another agent's invoice fails the
 * check instead of being trusted because it was found.
 */

'use strict';

const crypto = require('crypto');
const express = require('express');

const pool = require('../../../core/database/pool');
const { requireAuth } = require('../../../core/middleware/auth');
const { getCanonicalUserIdentity } = require('../../../core/auth/userIdentity');
const invoiceRepo = require('../../Invoicing/services/invoiceRepo');

const {
    createUploader,
    storageDriver,
    resolvedMime,
    fileExtension,
    validateFilename,
    validateSize,
    uploadSuccess,
    uploadError,
    ERROR_CODES,
    logUpload,
} = require('../../../core/upload');

const attachments = require('../../../core/attachments');

const router = express.Router();

// Audit is a soft dependency: this module must not fail to load because the
// Invoicing module moved a file. A missing audit writer degrades to no audit
// entry, never to a failed upload.
let writeInvoiceAuditEntry = null;
let resolveAgentAuditContext = async (client, authUser = {}) => ({
    userName: String(authUser?.name || authUser?.email || 'system').trim() || 'system',
    userPhone: String(authUser?.contact || authUser?.phone || 'system').trim() || 'system',
    userRole: Array.isArray(authUser?.access_level) ? authUser.access_level.join(', ') : null,
});

try {
    ({ writeInvoiceAuditEntry } = require('../../Invoicing/services/auditWriter'));
} catch (err) {
    if (err?.code !== 'MODULE_NOT_FOUND') throw err;
    console.warn('[Attachments] auditWriter unavailable — attachment changes will not be written to the invoice audit trail.');
}

try {
    ({ resolveAgentAuditContext } = require('../../Invoicing/services/agentAuditContext'));
} catch (err) {
    if (err?.code !== 'MODULE_NOT_FOUND') throw err;
}

/**
 * Ownership per owner type. Returns { found, allowed, linkedCustomer }.
 * Adding an owner type is an entry here plus one in the registry.
 */
const OWNERSHIP = {
    invoice: async (client, ownerId, userId) => {
        const res = await client.query(
            'SELECT created_by, linked_agent, linked_customer FROM invoice WHERE bubble_id = $1',
            [ownerId]
        );
        if (res.rows.length === 0) return { found: false, allowed: false, linkedCustomer: null };

        const row = res.rows[0];
        const allowed = await invoiceRepo.verifyOwnership(client, userId, row.created_by, row.linked_agent);
        return { found: true, allowed, linkedCustomer: row.linked_customer || null };
    },
};

const uploaders = {};

function getUploader(docType) {
    if (uploaders[docType]) return uploaders[docType];
    const def = attachments.getDocType(docType);

    uploaders[docType] = createUploader({
        storageSubdir: attachments.STORAGE_SUBDIR,
        allowedMimes: def.accept,
        maxFileSizeMB: def.maxMB,
        storage: 'memory', // buffered in req.file.buffer, pushed to R2 via storageDriver
        generateFilename: (req, file) => {
            const ts = Date.now();
            const rand = crypto.randomBytes(4).toString('hex');
            return `${docType}_${req.params.ownerId}_${ts}_${rand}${fileExtension(file)}`;
        },
    });
    return uploaders[docType];
}

/**
 * Coordinates arrive from the browser, so they are checked rather than trusted.
 * Out-of-range or unparseable values become null — a wrong pin on a map is worse
 * than no pin, because only one of the two looks like missing data.
 */
function parseCoordinate(value, limit) {
    if (value === undefined || value === null || value === '') return null;
    const num = Number(value);
    if (!Number.isFinite(num) || Math.abs(num) > limit) return null;
    return num;
}

function parseTakenAt(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    // A capture timestamp in the future is a wrong device clock, not evidence.
    if (date.getTime() > Date.now() + 24 * 60 * 60 * 1000) return null;
    return date.toISOString();
}

async function resolveAccess(client, ownerType, ownerId, userId) {
    const check = OWNERSHIP[ownerType];
    if (!check) return { found: false, allowed: false, linkedCustomer: null };
    return check(client, ownerId, userId);
}

async function writeAudit(client, { ownerType, ownerId, actionType, label, url, auditContext }) {
    if (ownerType !== 'invoice' || !writeInvoiceAuditEntry) return;
    try {
        await writeInvoiceAuditEntry(client, {
            invoiceBubbleId: ownerId,
            entityType: 'invoice_upload',
            actionType,
            changes: [actionType === 'DELETED' ? { field: label, before: url } : { field: label, after: url }],
            actorName: auditContext?.userName,
            actorPhone: auditContext?.userPhone,
            actorRole: auditContext?.userRole,
        });
    } catch (err) {
        // An audit failure must not undo a successful upload — the file and its
        // row are already committed and correct.
        console.error('[Attachments] audit write failed:', err.message);
    }
}

/**
 * POST /api/v1/attachments/:ownerType/:ownerId/:docType
 */
async function handleUpload(req, res) {
    const { ownerType, ownerId, docType } = req.params;

    const target = attachments.validateTarget({ ownerType, docType });
    if (!target.ok) {
        logUpload({ route: req.path, field: docType, recordId: ownerId, result: 'rejected', code: ERROR_CODES.UNKNOWN_FIELD, error: target.error });
        return res.status(400).json(uploadError(ERROR_CODES.UNKNOWN_FIELD, { field: docType, error: target.error }));
    }

    const { docTypeDef, ownerTypeDef } = target;
    const userId = getCanonicalUserIdentity(req);
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    let client = null;
    try {
        client = await pool.connect();
        const auditContext = await resolveAgentAuditContext(client, req.user);
        const access = await resolveAccess(client, ownerType, ownerId, userId);

        if (!access.found) {
            return res.status(404).json(uploadError(ERROR_CODES.RECORD_NOT_FOUND, { field: docType, error: 'Record not found.' }));
        }
        if (!access.allowed) {
            return res.status(403).json(uploadError(ERROR_CODES.FORBIDDEN, { field: docType, error: 'You do not have access to this record.' }));
        }

        const multerErr = await getUploader(docType)(req, res);
        if (multerErr) {
            const isTooLarge = multerErr.code === 'LIMIT_FILE_SIZE';
            const isWrongType = multerErr.code === 'WRONG_TYPE';
            const code = isTooLarge ? ERROR_CODES.TOO_LARGE : isWrongType ? ERROR_CODES.WRONG_TYPE : ERROR_CODES.STORAGE_FAILED;
            const status = isTooLarge ? 413 : isWrongType ? 400 : 500;
            const message = isTooLarge
                ? `${docTypeDef.label}: File too large. Maximum is ${docTypeDef.maxMB} MB.`
                : (multerErr.message || 'Upload failed.');

            logUpload({ route: req.path, field: docType, recordId: ownerId, result: 'rejected', code, error: message });
            return res.status(status).json(uploadError(code, { field: docType, error: message }));
        }

        if (!req.file) {
            logUpload({ route: req.path, field: docType, recordId: ownerId, result: 'rejected', code: ERROR_CODES.NO_FILE, error: 'No file received.' });
            return res.status(400).json(uploadError(ERROR_CODES.NO_FILE, {
                field: docType,
                error: `${docTypeDef.label}: No file received. Please select a file and try again.`,
            }));
        }

        const sizeCheck = validateSize(req.file.size, docTypeDef.maxMB, docTypeDef.label);
        if (!sizeCheck.ok) {
            logUpload({ route: req.path, field: docType, recordId: ownerId, mime: req.file.mimetype, sizeBytes: req.file.size, result: 'rejected', code: ERROR_CODES.TOO_LARGE, error: sizeCheck.error });
            return res.status(413).json(uploadError(ERROR_CODES.TOO_LARGE, { field: docType, error: sizeCheck.error }));
        }

        const nameCheck = validateFilename(req.file.originalname || '');
        if (!nameCheck.ok) {
            logUpload({ route: req.path, field: docType, recordId: ownerId, mime: req.file.mimetype, sizeBytes: req.file.size, result: 'rejected', code: ERROR_CODES.UNSAFE_FILENAME, error: nameCheck.error });
            return res.status(400).json(uploadError(ERROR_CODES.UNSAFE_FILENAME, { field: docType, error: `${docTypeDef.label}: ${nameCheck.error}` }));
        }

        const floor = attachments.normalizeFloor(docType, req.body?.floor);
        if (docTypeDef.floors && floor === null) {
            return res.status(400).json(uploadError(ERROR_CODES.UNKNOWN_FIELD, {
                field: docType,
                error: `${docTypeDef.label}: "${req.body?.floor}" is not a valid floor.`,
            }));
        }

        const mime = resolvedMime(req.file);
        // Checksum the bytes we actually received. The client could send one, but
        // a duplicate check the client can influence is not a duplicate check.
        const checksum = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

        let stored;
        try {
            stored = await storageDriver.put(req.file.buffer, {
                subdir: attachments.STORAGE_SUBDIR,
                filename: req.file.filename,
                mimeType: mime,
                req,
            });
        } catch (storeErr) {
            console.error('[Attachments] storage put failed:', storeErr.message);
            logUpload({ route: req.path, field: docType, recordId: ownerId, mime, sizeBytes: req.file.size, result: 'error', code: ERROR_CODES.STORAGE_FAILED, error: storeErr.message });
            return res.status(500).json(uploadError(ERROR_CODES.STORAGE_FAILED, { field: docType, error: `${docTypeDef.label}: Failed to store file. Please try again.` }));
        }

        let row;
        try {
            row = await attachments.insertAttachment(client, {
                ownerType,
                ownerId,
                linkedCustomer: access.linkedCustomer,
                module: ownerTypeDef.module,
                category: docTypeDef.category,
                docType,
                caption: req.body?.caption ? String(req.body.caption).slice(0, 500) : null,
                fileUrl: stored.url,
                storageSubdir: attachments.STORAGE_SUBDIR,
                storageKey: `${attachments.STORAGE_SUBDIR}/${stored.filename}`,
                originalFilename: req.file.originalname || stored.filename,
                mimeType: stored.mimeType || mime,
                sizeBytes: stored.bytes ?? req.file.size,
                checksumSha256: checksum,
                uploadedBy: userId,
                uploadedByName: auditContext?.userName || null,
                uploadedByRole: auditContext?.userRole || null,
                takenAt: parseTakenAt(req.body?.takenAt),
                gpsLat: parseCoordinate(req.body?.gpsLat, 90),
                gpsLng: parseCoordinate(req.body?.gpsLng, 180),
                metadata: floor === null ? {} : { floor },
            });
        } catch (dbErr) {
            // Reclaim the object: nothing else would ever find it on R2.
            await storageDriver.remove(stored.url, { subdir: attachments.STORAGE_SUBDIR }).catch(() => {});
            console.error('[Attachments] DB insert failed — stored file rolled back:', stored.url, dbErr.message);
            logUpload({ route: req.path, field: docType, recordId: ownerId, mime, sizeBytes: req.file.size, filename: req.file.filename, result: 'error', code: ERROR_CODES.DB_FAILED, error: dbErr.message });

            const isMissingTable = dbErr.code === 'EE_ATTACHMENT_TABLE_MISSING';
            return res.status(isMissingTable ? 503 : 500).json(uploadError(ERROR_CODES.DB_FAILED, {
                field: docType,
                error: isMissingTable
                    ? dbErr.message
                    : 'File saved but database update failed. Please try uploading again — the retry is safe.',
            }));
        }

        const duplicateOf = await attachments.findDuplicate(client, {
            ownerType,
            ownerId,
            checksumSha256: checksum,
            excludeId: row.id,
        });

        await writeAudit(client, {
            ownerType,
            ownerId,
            actionType: 'ADDED',
            label: docTypeDef.label,
            url: stored.url,
            auditContext,
        });

        logUpload({ route: req.path, field: docType, recordId: ownerId, mime, sizeBytes: req.file.size, filename: req.file.filename, result: 'success' });

        return res.json(uploadSuccess({
            field: docType,
            url: stored.url,
            filename: stored.filename,
            mime: stored.mimeType || mime,
            size: stored.bytes ?? req.file.size,
            attachment: row,
            // Advisory: the same bytes already sit in another slot on this record.
            duplicateOf: duplicateOf && duplicateOf.id !== row.id
                ? { id: duplicateOf.id, docType: duplicateOf.doc_type }
                : null,
        }));
    } catch (err) {
        console.error('[Attachments] Unexpected error:', err);
        logUpload({ route: req.path, field: docType, recordId: ownerId, result: 'error', code: ERROR_CODES.SERVER_ERROR, error: err.message });
        return res.status(500).json(uploadError(ERROR_CODES.SERVER_ERROR, { field: docType, error: 'Unexpected upload failure. Please try again.' }));
    } finally {
        if (client) client.release();
    }
}

/**
 * GET /api/v1/attachments/:ownerType/:ownerId
 */
async function handleList(req, res) {
    const { ownerType, ownerId } = req.params;
    const category = req.query.category || null;

    if (!attachments.getOwnerType(ownerType)) {
        return res.status(400).json({ success: false, error: `"${ownerType}" is not a valid attachment owner type.` });
    }

    const userId = getCanonicalUserIdentity(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    let client = null;
    try {
        client = await pool.connect();
        const access = await resolveAccess(client, ownerType, ownerId, userId);
        if (!access.found) return res.status(404).json({ success: false, error: 'Record not found.' });
        if (!access.allowed) return res.status(403).json({ success: false, error: 'Access denied' });

        const rows = await attachments.listForOwner(client, { ownerType, ownerId, category });
        const active = rows.filter((r) => !r.deleted_at);

        return res.json({
            success: true,
            data: {
                attachments: active,
                deleted: rows.filter((r) => r.deleted_at),
                docTypes: attachments.listDocTypes(category || 'site_assessment'),
                progress: attachments.checklistProgress(active, category || 'site_assessment'),
            },
        });
    } catch (err) {
        console.error('[Attachments] list failed:', err);
        return res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
}

/**
 * DELETE /api/v1/attachments/:ownerType/:ownerId/:id
 */
async function handleDelete(req, res) {
    const { ownerType, ownerId, id } = req.params;

    if (!attachments.getOwnerType(ownerType)) {
        return res.status(400).json({ success: false, error: `"${ownerType}" is not a valid attachment owner type.` });
    }

    const userId = getCanonicalUserIdentity(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    let client = null;
    try {
        client = await pool.connect();
        const auditContext = await resolveAgentAuditContext(client, req.user);
        const access = await resolveAccess(client, ownerType, ownerId, userId);
        if (!access.found) return res.status(404).json({ success: false, error: 'Record not found.' });
        if (!access.allowed) return res.status(403).json({ success: false, error: 'Access denied' });

        const existing = await attachments.getById(client, id);
        // Belongs-to check, not just an existence check: an id from someone
        // else's record must 404 here rather than be deleted.
        if (!existing || existing.owner_type !== ownerType || existing.owner_id !== ownerId) {
            return res.status(404).json({ success: false, error: 'Attachment not found on this record.' });
        }
        if (existing.deleted_at) {
            return res.status(409).json({ success: false, error: 'This file is already deleted.' });
        }

        const row = await attachments.softDelete(client, id, {
            deletedBy: userId,
            deletedByName: auditContext?.userName || null,
        });

        await writeAudit(client, {
            ownerType,
            ownerId,
            actionType: 'DELETED',
            label: attachments.getDocType(existing.doc_type)?.label || existing.doc_type,
            url: existing.file_url,
            auditContext,
        });

        return res.json({ success: true, data: { attachment: row } });
    } catch (err) {
        console.error('[Attachments] delete failed:', err);
        return res.status(err.code === 'EE_ATTACHMENT_TABLE_MISSING' ? 503 : 500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
}

/**
 * POST /api/v1/attachments/:ownerType/:ownerId/:id/restore
 */
async function handleRestore(req, res) {
    const { ownerType, ownerId, id } = req.params;

    if (!attachments.getOwnerType(ownerType)) {
        return res.status(400).json({ success: false, error: `"${ownerType}" is not a valid attachment owner type.` });
    }

    const userId = getCanonicalUserIdentity(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    let client = null;
    try {
        client = await pool.connect();
        const auditContext = await resolveAgentAuditContext(client, req.user);
        const access = await resolveAccess(client, ownerType, ownerId, userId);
        if (!access.found) return res.status(404).json({ success: false, error: 'Record not found.' });
        if (!access.allowed) return res.status(403).json({ success: false, error: 'Access denied' });

        const existing = await attachments.getById(client, id);
        if (!existing || existing.owner_type !== ownerType || existing.owner_id !== ownerId) {
            return res.status(404).json({ success: false, error: 'Attachment not found on this record.' });
        }
        if (!existing.deleted_at) {
            return res.status(409).json({ success: false, error: 'This file is already active.' });
        }

        const row = await attachments.restore(client, id, {
            restoredBy: userId,
            restoredByName: auditContext?.userName || null,
        });

        await writeAudit(client, {
            ownerType,
            ownerId,
            actionType: 'ADDED',
            label: attachments.getDocType(existing.doc_type)?.label || existing.doc_type,
            url: existing.file_url,
            auditContext,
        });

        return res.json({ success: true, data: { attachment: row } });
    } catch (err) {
        console.error('[Attachments] restore failed:', err);
        return res.status(err.code === 'EE_ATTACHMENT_TABLE_MISSING' ? 503 : 500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
}

router.get('/api/v1/attachments/:ownerType/:ownerId', requireAuth, handleList);
router.post('/api/v1/attachments/:ownerType/:ownerId/:id/restore', requireAuth, handleRestore);
router.post('/api/v1/attachments/:ownerType/:ownerId/:docType', requireAuth, handleUpload);
router.delete('/api/v1/attachments/:ownerType/:ownerId/:id', requireAuth, handleDelete);

module.exports = router;
