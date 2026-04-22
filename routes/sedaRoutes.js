/**
 * routes/sedaRoutes.js
 *
 * SEDA registration API routes.
 *
 * Architecture:
 *   - Generic upload engine lives in src/core/upload/
 *   - This file contains only SEDA-specific field config, DB queries, and business rules
 *   - Uses the shared app pool (src/core/database/pool)
 *   - Auth is enforced BEFORE the upload engine runs, not inside it
 *   - Extraction reads from disk — no re-download/base64 cycle
 */

'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');

// ─── Core shared modules ──────────────────────────────────────────────────────
const pool              = require('../src/core/database/pool');
const { requireAuth }   = require('../src/core/middleware/auth');
const { resolveAgentBubbleId } = require('../src/core/auth/userIdentity');
const {
    createUploader,
    buildPublicUrl,
    resolveDiskPath,
    safeDelete,
    resolvedMime,
    validateFilename,
    validateSize,
    uploadSuccess,
    uploadError,
    ERROR_CODES,
    logUpload,
    mb,
    insertRecycleBinEntry,
    listRecycleBinEntries,
    getActiveRecycleBinEntry,
    markRecycleBinRestored,
} = require('../src/core/upload');

// ─── SEDA-specific modules ────────────────────────────────────────────────────
const sedaRepo          = require('../src/modules/Invoicing/services/sedaRepo');
const invoiceRepo       = require('../src/modules/Invoicing/services/invoiceRepo');
const extractionService = require('../src/modules/Invoicing/services/extractionService');

const router = express.Router();

// ─── SEDA field config ────────────────────────────────────────────────────────
// Maps fieldKey → DB column, accepted MIME types, size limit, and display label.
// This config stays in sedaRoutes — it is SEDA-specific, not generic upload logic.

const FILE_FIELDS = {
    mykad_front:    { label: 'MyKad Front',              accept: ['image/*'],                         maxMB: 20, column: 'ic_copy_front'            },
    mykad_back:     { label: 'MyKad Back',               accept: ['image/*'],                         maxMB: 20, column: 'ic_copy_back'             },
    mykad_pdf:      { label: 'MyKad PDF',                accept: ['application/pdf'],                 maxMB: 40, column: 'mykad_pdf'                },
    tnb_bill_1:     { label: 'TNB Bill Month 1',         accept: ['application/pdf', 'image/*'],      maxMB: 25, column: 'tnb_bill_1'               },
    tnb_bill_2:     { label: 'TNB Bill Month 2',         accept: ['application/pdf', 'image/*'],      maxMB: 25, column: 'tnb_bill_2'               },
    tnb_bill_3:     { label: 'TNB Bill Month 3',         accept: ['application/pdf', 'image/*'],      maxMB: 25, column: 'tnb_bill_3'               },
    property_proof: { label: 'Property Ownership Proof', accept: ['image/*'],                         maxMB: 25, column: 'property_ownership_prove'  },
    tnb_meter:      { label: 'TNB Meter Image',          accept: ['image/*'],                         maxMB: 20, column: 'tnb_meter'                },
};

// One multer uploader per field type avoids re-creating multer on each request.
// Each uploader is keyed by fieldKey and lazy-initialised on first use.
const _uploaders = {};
function getUploader(fieldKey) {
    if (_uploaders[fieldKey]) return _uploaders[fieldKey];
    const rule = FILE_FIELDS[fieldKey];
    _uploaders[fieldKey] = createUploader({
        storageSubdir:   'seda_registration',
        allowedMimes:    rule.accept,
        maxFileSizeMB:   Math.max(rule.maxMB, 30), // transport cap — per-field cap enforced below
        generateFilename: (req, file) => {
            const { fileExtension } = require('../src/core/upload');
            const id   = req.params.id || req.params.shareToken || 'unknown';
            const ts   = Date.now();
            const rand = require('crypto').randomBytes(4).toString('hex');
            return `${fieldKey}_${id}_${ts}_${rand}${fileExtension(file)}`;
        },
    });
    return _uploaders[fieldKey];
}

// ─── Cached reg_status column name ───────────────────────────────────────────
let _regStatusColumn = null;
async function getRegStatusColumn(client) {
    if (_regStatusColumn) return _regStatusColumn;
    const res = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'seda_registration'
           AND column_name IN ('mapper_status', 'reg_status')`
    );
    const cols = new Set(res.rows.map(r => r.column_name));
    _regStatusColumn = cols.has('mapper_status') ? 'mapper_status' : 'reg_status';
    return _regStatusColumn;
}

// ─── Ownership middleware ─────────────────────────────────────────────────────
// Confirms the authenticated agent owns or created the SEDA record.
// Attaches req.sedaRecord for downstream handlers.

async function requireSedaOwnership(req, res, next) {
    const { id } = req.params;
    const client = await pool.connect();
    try {
        const r = await client.query(
            'SELECT bubble_id, agent, created_by, linked_invoice FROM seda_registration WHERE bubble_id = $1',
            [id]
        );
        if (!r.rows.length) {
            return res.status(404).json(uploadError(ERROR_CODES.RECORD_NOT_FOUND, { error: 'SEDA registration not found.' }));
        }

        const record  = r.rows[0];
        const isAdmin = Array.isArray(req.user?.access_level) && req.user.access_level.includes('admin');
        const authUserId = String(req.user?.userId || req.user?.id || req.user?.bubbleId || req.user?.bubble_id || '').trim() || null;

        let linkedInvoiceAgent = null;
        const linkedInvoiceId = Array.isArray(record.linked_invoice) ? record.linked_invoice[0] : null;
        if (linkedInvoiceId) {
            const invoiceRes = await client.query(
                'SELECT linked_agent FROM invoice WHERE bubble_id = $1 LIMIT 1',
                [linkedInvoiceId]
            );
            linkedInvoiceAgent = invoiceRes.rows[0]?.linked_agent || null;
        }

        const resolvedLinkedAgent = record.agent || linkedInvoiceAgent || null;
        const isOwner = authUserId
            ? await invoiceRepo.verifyOwnership(client, authUserId, record.created_by, resolvedLinkedAgent)
            : false;

        if (!isAdmin && !isOwner) {
            return res.status(403).json(uploadError(ERROR_CODES.FORBIDDEN, { error: 'You do not have access to this SEDA record.' }));
        }

        req.sedaRecord = record;
        next();
    } catch (err) {
        console.error('[SEDA Ownership] Check failed:', err.message);
        return res.status(500).json({ success: false, error: 'Server error during access check.' });
    } finally {
        client.release();
    }
}

// ─── Core upload handler ──────────────────────────────────────────────────────
// Called identically from both public and authenticated upload routes.
// Auth and ownership checks happen in the router BEFORE this is called.

async function handleUpload(req, res, recordId) {
    try {
        const { field } = req.params;
        const rule = FILE_FIELDS[field];

        // Unknown field — rejected before multer runs
        if (!rule) {
            await drainRequest(req);
            logUpload({ route: req.path, field, recordId, result: 'rejected', code: ERROR_CODES.UNKNOWN_FIELD, error: 'Unknown field' });
            return res.status(400).json(uploadError(ERROR_CODES.UNKNOWN_FIELD, { field, error: `"${field}" is not a valid upload field.` }));
        }

        // Filename safety pre-check on originalname (before multer writes to disk)
        const rawName = req.headers['x-upload-filename'] || '';
        if (rawName) {
            const nameCheck = validateFilename(rawName);
            if (!nameCheck.ok) {
                await drainRequest(req);
                logUpload({ route: req.path, field, recordId, result: 'rejected', code: ERROR_CODES.UNSAFE_FILENAME, error: nameCheck.error });
                return res.status(400).json(uploadError(ERROR_CODES.UNSAFE_FILENAME, { field, error: `${rule.label}: ${nameCheck.error}` }));
            }
        }

        // Run multer
        const multerErr = await getUploader(field)(req, res);

        if (multerErr) {
            await drainRequest(req);
            
            const isSize = multerErr.code === 'LIMIT_FILE_SIZE';
            const code   = isSize ? ERROR_CODES.TOO_LARGE
                         : (multerErr.code === 'WRONG_TYPE' ? ERROR_CODES.WRONG_TYPE : ERROR_CODES.STORAGE_FAILED);
            const msg    = isSize
                ? `${rule.label}: File too large. Maximum is ${rule.maxMB} MB.`
                : (multerErr.message || 'Upload failed.');

            logUpload({ route: req.path, field, recordId, mime: resolvedMime(req.file || {}), result: 'rejected', code, error: msg });
            return res.status(400).json(uploadError(code, { field, error: msg }));
        }

        if (!req.file) {
            await drainRequest(req);
            logUpload({ route: req.path, field, recordId, result: 'rejected', code: ERROR_CODES.NO_FILE, error: 'No file received' });
            return res.status(400).json(uploadError(ERROR_CODES.NO_FILE, { field, error: `${rule.label}: No file received. Please select a file and try again.` }));
        }

        // Per-field size enforcement (stricter than transport cap)
        const sizeCheck = validateSize(req.file.size, rule.maxMB, rule.label);
        if (!sizeCheck.ok) {
            safeDelete(req.file.path);
            logUpload({ route: req.path, field, recordId, mime: req.file.mimetype, sizeBytes: req.file.size, result: 'rejected', code: ERROR_CODES.TOO_LARGE, error: sizeCheck.error });
            return res.status(413).json(uploadError(ERROR_CODES.TOO_LARGE, { field, error: sizeCheck.error }));
        }

        // Filename safety check on the actual originalname after multer runs
        const nameCheck = validateFilename(req.file.originalname || '');
        if (!nameCheck.ok) {
            safeDelete(req.file.path);
            return res.status(400).json(uploadError(ERROR_CODES.UNSAFE_FILENAME, { field, error: `${rule.label}: ${nameCheck.error}` }));
        }

        const mime    = resolvedMime(req.file);
        const fileUrl = buildPublicUrl(req, 'seda_registration', req.file.filename);

        // DB update — use finally to guarantee single client.release()
        let client;
        try {
            client = await pool.connect();
            await client.query(
                `UPDATE seda_registration
                 SET ${rule.column} = $1, modified_date = NOW(), updated_at = NOW()
                 WHERE bubble_id = $2`,
                [fileUrl, recordId]
            );
        } catch (dbErr) {
            console.error('[SEDA Upload] DB update failed — orphaned file:', req.file.path, dbErr.message);
            logUpload({ route: req.path, field, recordId, mime, sizeBytes: req.file.size, filename: req.file.filename, result: 'error', code: ERROR_CODES.DB_FAILED, error: dbErr.message });
            return res.status(500).json(uploadError(ERROR_CODES.DB_FAILED, { field, error: 'File saved but database update failed. Please try uploading again — the retry is safe.' }));
        } finally {
            if (client) client.release();
        }

        logUpload({ route: req.path, field, recordId, mime, sizeBytes: req.file.size, filename: req.file.filename, result: 'success' });
        return res.json(uploadSuccess({ field, url: fileUrl, filename: req.file.filename, mime, size: req.file.size }));
        
    } catch (err) {
        console.error('[SEDA Upload] Unhandled error:', err.message);
        await drainRequest(req);
        return res.status(500).json(uploadError(ERROR_CODES.STORAGE_FAILED, { field: req.params.field, error: 'Internal server error during upload.' }));
    }
}

function drainRequest(req) {
    if (!req || req.complete || req.readableEnded) return Promise.resolve();
    return new Promise(resolve => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            req.off('end', finish);
            req.off('close', finish);
            req.off('error', finish);
            resolve();
        };
        req.on('end', finish);
        req.on('close', finish);
        req.on('error', finish);
        req.resume();
    });
}

// ─── Extraction helpers ────────────────────────────────────────────────────────
// Reads from disk using resolveDiskPath — no download/base64 re-fetch cycle.

async function readFileFromStoredUrl(url) {
    const diskPath = resolveDiskPath(url, 'seda_registration');
    if (!diskPath) throw new Error('File not found on disk. It may have been moved or the URL is invalid.');
    const buffer = fs.readFileSync(diskPath);
    if (!buffer.length) throw new Error('File on disk is empty.');
    const ext = path.extname(url || '').toLowerCase();
    const mime = {
        '.pdf':  'application/pdf',
        '.jpg':  'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png':  'image/png',
        '.webp': 'image/webp',
        '.gif':  'image/gif',
        '.bmp':  'image/bmp',
        '.heic': 'image/heic',
        '.heif': 'image/heif',
    }[ext] || 'application/octet-stream';
    return { buffer, mime };
}

async function getSedaDeletedUploads(client, recordId) {
    return listRecycleBinEntries(client, {
        module: 'seda',
        linkedRecordType: 'seda_registration',
        linkedRecordId: recordId
    });
}

function getSedaActor(req, fallbackId) {
    return {
        id: req.user?.bubbleId || req.user?.bubble_id || req.user?.id || req.user?.userId || fallbackId || null,
        name: req.user?.name || req.user?.displayName || req.user?.email || null,
        role: Array.isArray(req.user?.access_level) ? req.user.access_level.join(', ') : (req.user ? 'authenticated' : 'public-share-token'),
    };
}

async function softDeleteSedaFile(req, res, recordId, source) {
    const { field } = req.params;
    const { url } = req.body || {};
    const rule = FILE_FIELDS[field];

    if (!rule) {
        return res.status(400).json(uploadError(ERROR_CODES.UNKNOWN_FIELD, { field, error: `"${field}" is not a valid upload field.` }));
    }

    if (!url) {
        return res.status(400).json({ success: false, error: 'URL required.' });
    }

    const client = await pool.connect();
    try {
        const existing = await client.query(
            `SELECT ${rule.column} AS current_value
             FROM seda_registration
             WHERE bubble_id = $1`,
            [recordId]
        );

        if (!existing.rows.length) {
            return res.status(404).json(uploadError(ERROR_CODES.RECORD_NOT_FOUND, { field, error: 'SEDA registration not found.' }));
        }

        if ((existing.rows[0]?.current_value || null) !== url) {
            return res.status(404).json({ success: false, error: 'File not found on the active SEDA record.' });
        }

        await client.query('BEGIN');
        await client.query(
            `UPDATE seda_registration
             SET ${rule.column} = NULL,
                 modified_date = NOW(),
                 updated_at = NOW()
             WHERE bubble_id = $1`,
            [recordId]
        );

        const actor = getSedaActor(req, recordId);
        await insertRecycleBinEntry(client, {
            module: 'seda',
            linkedRecordType: 'seda_registration',
            linkedRecordId: recordId,
            fieldKey: field,
            fileUrl: url,
            storageSubdir: 'seda_registration',
            deletedBy: actor.id,
            deletedByName: actor.name,
            deletedByRole: actor.role,
            metadataJson: {
                source,
            }
        });
        await client.query('COMMIT');

        return res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[SEDA Delete] Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
}

async function restoreSedaFile(req, res, recordId, source) {
    const { field } = req.params;
    const { recycleBinId } = req.body || {};
    const rule = FILE_FIELDS[field];

    if (!rule) {
        return res.status(400).json(uploadError(ERROR_CODES.UNKNOWN_FIELD, { field, error: `"${field}" is not a valid upload field.` }));
    }

    if (!recycleBinId) {
        return res.status(400).json({ success: false, error: 'recycleBinId required.' });
    }

    const client = await pool.connect();
    try {
        const recycleEntry = await getActiveRecycleBinEntry(client, recycleBinId, {
            module: 'seda',
            linkedRecordType: 'seda_registration',
            linkedRecordId: recordId,
            fieldKey: field
        });

        if (!recycleEntry) {
            return res.status(404).json({ success: false, error: 'Deleted file not found in recycle bin.' });
        }

        const existing = await client.query(
            `SELECT ${rule.column} AS current_value
             FROM seda_registration
             WHERE bubble_id = $1`,
            [recordId]
        );

        if (!existing.rows.length) {
            return res.status(404).json(uploadError(ERROR_CODES.RECORD_NOT_FOUND, { field, error: 'SEDA registration not found.' }));
        }

        if ((existing.rows[0]?.current_value || null) === recycleEntry.fileUrl) {
            return res.status(409).json({ success: false, error: 'This file is already active on the SEDA record.' });
        }

        await client.query('BEGIN');
        await client.query(
            `UPDATE seda_registration
             SET ${rule.column} = $1,
                 modified_date = NOW(),
                 updated_at = NOW()
             WHERE bubble_id = $2`,
            [recycleEntry.fileUrl, recordId]
        );

        const actor = getSedaActor(req, recordId);
        await markRecycleBinRestored(client, recycleEntry.recycleBinId, actor.id, actor.name);
        await client.query('COMMIT');

        return res.json({
            success: true,
            url: recycleEntry.fileUrl,
            metadata: { source }
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[SEDA Restore] Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES — customer access via shareToken
// Auth: shareToken only. Can only access their own record.
// ═════════════════════════════════════════════════════════════════════════════

router.get('/seda-public/:shareToken', async (req, res) => {
    const client = await pool.connect();
    try {
        const seda = await sedaRepo.getByShareToken(client, req.params.shareToken);
        if (!seda) return res.status(404).send('<h2>SEDA Registration Not Found or Expired</h2>');
        res.setHeader('Cache-Control', 'no-store');
        res.sendFile(path.join(__dirname, '../public/templates/seda_register.html'));
    } catch (err) {
        console.error('[SEDA Public] Serve error:', err.message);
        res.status(500).send('Error loading form.');
    } finally { client.release(); }
});

router.get('/api/v1/seda-public/:shareToken', async (req, res) => {
    const client = await pool.connect();
    try {
        const seda = await sedaRepo.getByShareToken(client, req.params.shareToken);
        if (!seda) return res.status(404).json({ success: false, error: 'Not found or expired.' });
        if (!seda.reg_status && seda.mapper_status) seda.reg_status = seda.mapper_status;

        let invoice = null;
        if (seda.linked_invoice?.length) {
            const r = await client.query(
                'SELECT bubble_id, customer_signature, share_token, invoice_number FROM invoice WHERE bubble_id = $1',
                [seda.linked_invoice[0]]
            );
            invoice = r.rows[0] || null;
        }

        res.json({
            success: true,
            data: {
                ...seda,
                customer_profile: { name: seda.customer_name, phone: seda.phone, email: seda.email, address: seda.address, city: seda.city, state: seda.state, postcode: seda.postcode },
                invoice_details: invoice,
                deleted_uploads: await getSedaDeletedUploads(client, seda.bubble_id)
            }
        });
    } catch (err) {
        console.error('[SEDA Public API] Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally { client.release(); }
});

router.post('/api/v1/seda-public/:shareToken', async (req, res) => {
    const client = await pool.connect();
    try {
        const seda = await sedaRepo.getByShareToken(client, req.params.shareToken);
        if (!seda) return res.status(404).json({ success: false, error: 'Not found or expired.' });

        const { installation_address, city, state, postcode, tnb_account_no, phase_type,
                e_contact_name, e_contact_relationship, e_contact_no, e_contact_mykad,
                ic_no, email, e_email } = req.body;

        await client.query(
            `UPDATE seda_registration
             SET installation_address = COALESCE($1, installation_address),
                 city = COALESCE($2, city), state = COALESCE($3, state), postcode = COALESCE($4, postcode),
                 tnb_account_no = COALESCE($5, tnb_account_no), phase_type = COALESCE($6, phase_type),
                 e_contact_name = COALESCE($7, e_contact_name), e_contact_relationship = COALESCE($8, e_contact_relationship),
                 e_contact_no = COALESCE($9, e_contact_no), e_contact_mykad = COALESCE($10, e_contact_mykad),
                 ic_no = COALESCE($11, ic_no), email = COALESCE($12, email), e_email = COALESCE($13, e_email),
                 modified_date = NOW(), updated_at = NOW()
             WHERE bubble_id = $14`,
            [installation_address, city, state, postcode, tnb_account_no, phase_type,
             e_contact_name, e_contact_relationship, e_contact_no, e_contact_mykad || null,
             ic_no, email || null, e_email || null, seda.bubble_id]
        );

        if (ic_no || email) {
            const r = await client.query('SELECT linked_customer FROM seda_registration WHERE bubble_id = $1', [seda.bubble_id]);
            const cid = r.rows[0]?.linked_customer;
            if (cid) await client.query(`UPDATE customer SET ic_number = COALESCE($1, ic_number), email = COALESCE($2, email), updated_at = NOW() WHERE customer_id = $3`, [ic_no || null, email || null, cid]);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('[SEDA Public Save] Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally { client.release(); }
});

// Public file upload — auth: shareToken (verified before multer runs)
router.post('/api/v1/seda-public/:shareToken/upload/:field', async (req, res) => {
    // Verify shareToken before invoking the upload engine
    const client = await pool.connect();
    let recordId;
    try {
        const seda = await sedaRepo.getByShareToken(client, req.params.shareToken);
        if (!seda) return res.status(404).json(uploadError(ERROR_CODES.RECORD_NOT_FOUND, { error: 'Registration not found or link has expired.' }));
        recordId = seda.bubble_id;
    } catch (err) {
        return res.status(500).json({ success: false, error: 'Failed to verify registration.' });
    } finally {
        client.release();
    }

    req.params.id = recordId;
    return handleUpload(req, res, recordId);
});

router.delete('/api/v1/seda-public/:shareToken/file/:field', async (req, res) => {
    const client = await pool.connect();
    let recordId;
    try {
        const seda = await sedaRepo.getByShareToken(client, req.params.shareToken);
        if (!seda) return res.status(404).json(uploadError(ERROR_CODES.RECORD_NOT_FOUND, { error: 'Registration not found or link has expired.' }));
        recordId = seda.bubble_id;
    } catch (err) {
        return res.status(500).json({ success: false, error: 'Failed to verify registration.' });
    } finally {
        client.release();
    }

    req.params.id = recordId;
    return softDeleteSedaFile(req, res, recordId, 'seda-public-delete');
});

router.post('/api/v1/seda-public/:shareToken/restore/:field', async (req, res) => {
    const client = await pool.connect();
    let recordId;
    try {
        const seda = await sedaRepo.getByShareToken(client, req.params.shareToken);
        if (!seda) return res.status(404).json(uploadError(ERROR_CODES.RECORD_NOT_FOUND, { error: 'Registration not found or link has expired.' }));
        recordId = seda.bubble_id;
    } catch (err) {
        return res.status(500).json({ success: false, error: 'Failed to verify registration.' });
    } finally {
        client.release();
    }

    req.params.id = recordId;
    return restoreSedaFile(req, res, recordId, 'seda-public-restore');
});

// ═════════════════════════════════════════════════════════════════════════════
// AUTHENTICATED ROUTES — agent / admin access
// Auth: requireAuth + requireSedaOwnership
// ═════════════════════════════════════════════════════════════════════════════

router.get('/api/v1/seda/my-seda', requireAuth, async (req, res) => {
    const client = await pool.connect();
    try {
        const agentId = await resolveAgentBubbleId(client, req);
        if (!agentId) return res.json({ success: true, data: [] });

        const regStatusCol = await getRegStatusColumn(client);
        const result = await client.query(
            `SELECT s.bubble_id, s.${regStatusCol} AS reg_status, s.seda_status, s.updated_at,
                    COALESCE(c.name, i.customer_name_snapshot, s.e_contact_name, 'Unnamed Customer') as customer_name,
                    i.invoice_number, COALESCE(i.paid, false) as invoice_paid,
                    COALESCE(i.total_amount, 0) as invoice_total, COALESCE(i.paid_amount, 0) as invoice_paid_amount,
                    (COALESCE(i.paid_amount, 0) > 0) as has_payment
             FROM seda_registration s
             LEFT JOIN customer c ON s.linked_customer = c.customer_id
             LEFT JOIN invoice i ON i.bubble_id = ANY(s.linked_invoice)
             WHERE (s.agent = $1 OR s.created_by = $1 OR i.linked_agent = $1)
               AND (s.seda_status IS NULL OR (s.seda_status NOT ILIKE 'Submitted%' AND s.seda_status NOT ILIKE 'Approved%'))
               AND (s.${regStatusCol} IS NULL OR (s.${regStatusCol} NOT ILIKE 'Submitted%' AND s.${regStatusCol} NOT ILIKE 'Approved%'))
             ORDER BY has_payment DESC, i.paid_amount DESC, s.updated_at DESC`,
            [agentId]
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('[My SEDA] Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally { client.release(); }
});

router.get('/seda-register', requireAuth, (req, res) => {
    if (!req.query.id) return res.status(400).send('Missing SEDA ID.');
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, '../public/templates/seda_register.html'));
});

router.get('/api/v1/seda/:id', requireAuth, requireSedaOwnership, async (req, res) => {
    const client = await pool.connect();
    try {
        const r = await client.query('SELECT * FROM seda_registration WHERE bubble_id = $1', [req.params.id]);
        if (!r.rows.length) return res.status(404).json({ success: false, error: 'Not found.' });

        const seda = r.rows[0];
        if (!seda.reg_status && seda.mapper_status) seda.reg_status = seda.mapper_status;

        let customer = {};
        if (seda.linked_customer) {
            const cr = await client.query('SELECT name, phone, email, address, city, state, postcode FROM customer WHERE customer_id = $1', [seda.linked_customer]);
            customer = cr.rows[0] || {};
        }

        let invoice = null;
        if (seda.linked_invoice?.length) {
            const ir = await client.query('SELECT bubble_id, customer_signature, share_token, invoice_number FROM invoice WHERE bubble_id = $1', [seda.linked_invoice[0]]);
            invoice = ir.rows[0] || null;
        }

        res.json({
            success: true,
            data: {
                ...seda,
                customer_profile: customer,
                invoice_details: invoice,
                deleted_uploads: await getSedaDeletedUploads(client, seda.bubble_id)
            }
        });
    } catch (err) {
        console.error('[SEDA GET] Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally { client.release(); }
});

// ═════════════════════════════════════════════════════════════════════════════
// EXTRACTION ROUTES — declared BEFORE POST /api/v1/seda/:id
// These literal paths must come first. If they fall after the generic /:id
// route, Express interprets e.g. "extract-tnb" as a record ID and shadows
// these handlers entirely.
// ═════════════════════════════════════════════════════════════════════════════

router.post('/api/v1/seda/extract-tnb', async (req, res) => {
    const { sedaId, fieldKey = 'tnb_bill_1' } = req.body;
    if (!sedaId) return res.status(400).json({ success: false, error: 'sedaId is required.' });

    const rule = FILE_FIELDS[fieldKey];
    if (!rule || !['tnb_bill_1', 'tnb_bill_2', 'tnb_bill_3'].includes(fieldKey)) {
        return res.status(400).json({ success: false, error: 'Invalid fieldKey for TNB extraction.' });
    }

    const client = await pool.connect();
    try {
        const r = await client.query(`SELECT ${rule.column} FROM seda_registration WHERE bubble_id = $1`, [sedaId]);
        const storedUrl = r.rows[0]?.[rule.column];
        if (!storedUrl) return res.status(400).json({ success: false, error: `No file uploaded for ${rule.label} yet.` });

        const { buffer, mime } = await readFileFromStoredUrl(storedUrl);
        const result = await extractionService.verifyTnbBill(buffer, mime);

        const log = `\n[${new Date().toISOString().split('T')[0]}] TNB BILL = ${result.tnb_account ? 'EXTRACTED' : 'FAILED'} (Account: ${result.tnb_account || 'N/A'})`;
        await client.query(
            `UPDATE seda_registration SET special_remark = COALESCE(special_remark,'') || $1, tnb_account_no = COALESCE($2, tnb_account_no), state = COALESCE($3, state) WHERE bubble_id = $4`,
            [log, result.tnb_account, result.state, sedaId]
        );

        res.json({ success: true, data: result });
    } catch (err) {
        console.error('[Extract TNB] Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally { client.release(); }
});

router.post('/api/v1/seda/extract-mykad', async (req, res) => {
    const { sedaId, fieldKey = 'mykad_front' } = req.body;
    if (!sedaId) return res.status(400).json({ success: false, error: 'sedaId is required.' });

    const rule = FILE_FIELDS[fieldKey];
    if (!rule || !['mykad_front', 'mykad_pdf'].includes(fieldKey)) {
        return res.status(400).json({ success: false, error: 'Invalid fieldKey for MyKad extraction.' });
    }

    const client = await pool.connect();
    try {
        const r = await client.query(`SELECT ${rule.column} FROM seda_registration WHERE bubble_id = $1`, [sedaId]);
        const storedUrl = r.rows[0]?.[rule.column];
        if (!storedUrl) return res.status(400).json({ success: false, error: `No file uploaded for ${rule.label} yet.` });

        const { buffer, mime } = await readFileFromStoredUrl(storedUrl);
        const result = await extractionService.verifyMykad(buffer, mime);

        const log = `\n[${new Date().toISOString().split('T')[0]}] MYKAD = ${result.quality_ok ? 'PASSED' : 'QUALITY WARNING'} (Name: ${result.customer_name})`;
        await client.query(
            result.quality_ok
                ? `UPDATE seda_registration SET special_remark = COALESCE(special_remark,'') || $1, check_mykad = $2, ic_no = COALESCE($3, ic_no) WHERE bubble_id = $4`
                : `UPDATE seda_registration SET special_remark = COALESCE(special_remark,'') || $1, check_mykad = $2 WHERE bubble_id = $3`,
            result.quality_ok ? [log, result.quality_ok, result.mykad_id, sedaId] : [log, result.quality_ok, sedaId]
        );

        res.json({ success: true, data: result });
    } catch (err) {
        console.error('[Extract MyKad] Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally { client.release(); }
});

router.post('/api/v1/seda/verify-meter', async (req, res) => {
    const { sedaId } = req.body;
    if (!sedaId) return res.status(400).json({ success: false, error: 'sedaId is required.' });

    const client = await pool.connect();
    try {
        const r = await client.query('SELECT tnb_meter FROM seda_registration WHERE bubble_id = $1', [sedaId]);
        const storedUrl = r.rows[0]?.tnb_meter;
        if (!storedUrl) return res.status(400).json({ success: false, error: 'No meter image uploaded yet.' });

        const { buffer, mime } = await readFileFromStoredUrl(storedUrl);
        const result = await extractionService.verifyTnbMeter(buffer, mime);

        const log = `\n[${new Date().toISOString().split('T')[0]}] METER = ${result.is_clear ? 'CLEAR' : 'BLURRY'} (${result.remark})`;
        await client.query(`UPDATE seda_registration SET special_remark = COALESCE(special_remark,'') || $1 WHERE bubble_id = $2`, [log, sedaId]);

        res.json({ success: true, data: result });
    } catch (err) {
        console.error('[Verify Meter] Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally { client.release(); }
});

router.post('/api/v1/seda/verify-ownership', async (req, res) => {
    const { sedaId, context } = req.body;
    if (!sedaId) return res.status(400).json({ success: false, error: 'sedaId is required.' });

    const client = await pool.connect();
    try {
        const r = await client.query(
            'SELECT property_ownership_prove, installation_address FROM seda_registration WHERE bubble_id = $1',
            [sedaId]
        );
        const storedUrl = r.rows[0]?.property_ownership_prove;
        if (!storedUrl) return res.status(400).json({ success: false, error: 'No ownership document uploaded yet.' });

        const { buffer, mime } = await readFileFromStoredUrl(storedUrl);
        const ctx = context || { name: 'Unknown', address: r.rows[0]?.installation_address || 'Unknown' };
        const result = await extractionService.verifyOwnership(buffer, mime, ctx);

        const passed = result.name_match && result.address_match;
        const log = `\n[${new Date().toISOString().split('T')[0]}] OWNERSHIP = ${passed ? 'PASSED' : 'FAILED'} (Owner: ${result.owner_name})`;
        await client.query(`UPDATE seda_registration SET special_remark = COALESCE(special_remark,'') || $1, check_ownership = $2 WHERE bubble_id = $3`, [log, passed, sedaId]);

        res.json({ success: true, data: result });
    } catch (err) {
        console.error('[Verify Ownership] Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally { client.release(); }
});

// ─── Generic record save — must come AFTER all literal /seda/* action routes ──
router.post('/api/v1/seda/:id', requireAuth, requireSedaOwnership, async (req, res) => {
    const { installation_address, city, state, postcode, tnb_account_no, phase_type,
            e_contact_name, e_contact_relationship, e_contact_no, e_contact_mykad,
            ic_no, email, e_email } = req.body;

    const client = await pool.connect();
    try {
        await client.query(
            `UPDATE seda_registration
             SET installation_address = COALESCE($1, installation_address),
                 city = COALESCE($2, city), state = COALESCE($3, state), postcode = COALESCE($4, postcode),
                 tnb_account_no = COALESCE($5, tnb_account_no), phase_type = COALESCE($6, phase_type),
                 e_contact_name = COALESCE($7, e_contact_name), e_contact_relationship = COALESCE($8, e_contact_relationship),
                 e_contact_no = COALESCE($9, e_contact_no), e_contact_mykad = COALESCE($10, e_contact_mykad),
                 ic_no = COALESCE($11, ic_no), email = COALESCE($12, email), e_email = COALESCE($13, e_email),
                 modified_date = NOW(), updated_at = NOW()
             WHERE bubble_id = $14`,
            [installation_address, city, state, postcode, tnb_account_no, phase_type,
             e_contact_name, e_contact_relationship, e_contact_no, e_contact_mykad || null,
             ic_no, email || null, e_email || null, req.params.id]
        );

        if (ic_no || email) {
            const r = await client.query('SELECT linked_customer FROM seda_registration WHERE bubble_id = $1', [req.params.id]);
            const cid = r.rows[0]?.linked_customer;
            if (cid) await client.query(`UPDATE customer SET ic_number = COALESCE($1, ic_number), email = COALESCE($2, email), updated_at = NOW() WHERE customer_id = $3`, [ic_no || null, email || null, cid]);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('[SEDA Save] Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally { client.release(); }
});

// Authenticated file upload — requireAuth + requireSedaOwnership runs first
router.post('/api/v1/seda/:id/upload/:field', requireAuth, requireSedaOwnership, (req, res) => {
    return handleUpload(req, res, req.params.id);
});

router.delete('/api/v1/seda/:id/file/:field', requireAuth, requireSedaOwnership, (req, res) => {
    return softDeleteSedaFile(req, res, req.params.id, 'seda-delete');
});

router.post('/api/v1/seda/:id/restore/:field', requireAuth, requireSedaOwnership, (req, res) => {
    return restoreSedaFile(req, res, req.params.id, 'seda-restore');
});

router.patch('/api/v1/seda/:id/status', requireAuth, requireSedaOwnership, async (req, res) => {
    const { reg_status, seda_status } = req.body;
    const client = await pool.connect();
    try {
        const regStatusCol = await getRegStatusColumn(client);
        const sets = [], vals = [req.params.id];

        if (reg_status)  { vals.push(reg_status);  sets.push(`${regStatusCol} = $${vals.length}`); }
        if (seda_status) { vals.push(seda_status);  sets.push(`seda_status = $${vals.length}`); }
        if (!sets.length) return res.status(400).json({ success: false, error: 'No status provided.' });

        await client.query(`UPDATE seda_registration SET ${sets.join(', ')}, updated_at = NOW() WHERE bubble_id = $1`, vals);
        res.json({ success: true });
    } catch (err) {
        console.error('[SEDA Status] Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally { client.release(); }
});

// Extraction routes have been moved above POST /api/v1/seda/:id — see above.

// ─── Check SEDA page + proxy ──────────────────────────────────────────────────

router.get('/check-seda', requireAuth, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, '../public/templates/check_seda.html'));
});

const SEDA_MANAGER_URL = 'https://seda-manager-production.up.railway.app';
router.get('/api/v1/seda-proxy/*', requireAuth, async (req, res) => {
    const sub   = req.params[0];
    const query = new URLSearchParams(req.query).toString();
    const url   = `${SEDA_MANAGER_URL}/api/v1/${sub}${query ? '?' + query : ''}`;
    try {
        const r = await fetch(url);
        res.json({ success: true, data: await r.json() });
    } catch (err) {
        console.error('[SEDA Proxy] Error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to reach SEDA Manager.' });
    }
});

module.exports = router;
