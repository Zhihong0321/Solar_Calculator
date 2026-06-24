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
const crypto  = require('crypto');

// ─── Core shared modules ──────────────────────────────────────────────────────
const pool              = require('../src/core/database/pool');
const { requireAuth }   = require('../src/core/middleware/auth');
const { getCanonicalUserIdentity } = require('../src/core/auth/userIdentity');
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
const extractionService = require('../src/modules/Invoicing/services/extractionService');
const { writeInvoiceAuditEntry } = require('../src/modules/Invoicing/services/auditWriter');

const router = express.Router();

async function getLinkedInvoiceBubbleId(client, sedaId) {
    try {
        const r = await client.query(
            'SELECT linked_invoice FROM seda_registration WHERE bubble_id = $1 LIMIT 1',
            [sedaId]
        );
        const linked = r.rows[0]?.linked_invoice;
        if (Array.isArray(linked) && linked.length > 0) return linked[0];
        if (typeof linked === 'string' && linked.trim()) return linked.trim();
    } catch (_) {}
    return null;
}

let _customerColumns = null;
let _invoiceColumns = null;
let _sedaColumns = null;

async function getTableColumns(client, tableName, cacheKey) {
    const cache = cacheKey === 'customer' ? _customerColumns : (cacheKey === 'seda' ? _sedaColumns : _invoiceColumns);
    if (cache) return cache;

    const result = await client.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_name = $1`,
        [tableName]
    );
    const columns = new Set(result.rows.map(row => row.column_name));
    if (cacheKey === 'customer') _customerColumns = columns;
    if (cacheKey === 'seda') _sedaColumns = columns;
    if (cacheKey === 'invoice') _invoiceColumns = columns;
    return columns;
}

function getLinkedInvoiceIds(linkedInvoice) {
    if (Array.isArray(linkedInvoice)) {
        return linkedInvoice.map(normalizeOptionalText).filter(Boolean);
    }
    const normalized = normalizeOptionalText(linkedInvoice);
    return normalized ? [normalized] : [];
}

async function resolveCustomerOwnerForSeda(client, snapshot, actorIdentity) {
    const candidates = [
        actorIdentity,
        snapshot.created_by,
        snapshot.agent
    ];

    const linkedInvoiceIds = getLinkedInvoiceIds(snapshot.linked_invoice);
    if (linkedInvoiceIds.length) {
        const invoiceResult = await client.query(
            `SELECT created_by, linked_agent
             FROM invoice
             WHERE bubble_id = $1
             LIMIT 1`,
            [linkedInvoiceIds[0]]
        );
        candidates.push(invoiceResult.rows[0]?.created_by, invoiceResult.rows[0]?.linked_agent);
    }

    for (const candidate of candidates) {
        const normalized = normalizeOptionalText(candidate);
        if (!normalized) continue;
        const resolved = await sedaRepo.resolveUserBubbleId(client, normalized);
        return resolved || normalized;
    }

    return 'seda-form';
}

function pushOptionalInsertField(columns, insert, column, value) {
    if (!columns.has(column) || value === undefined) return;
    insert.columns.push(column);
    insert.values.push(value);
    insert.placeholders.push(`$${insert.values.length}`);
}

async function createAndLinkCustomerForUnlinkedSeda(client, snapshot, formValues, actorIdentity) {
    if (snapshot.linked_customer) return snapshot.linked_customer;

    const customerName = normalizeOptionalText(formValues.customer_name);
    if (!customerName) return null;

    const customerColumns = await getTableColumns(client, 'customer', 'customer');
    const invoiceColumns = await getTableColumns(client, 'invoice', 'invoice');
    const customerBubbleId = `cust_${crypto.randomBytes(4).toString('hex')}`;
    const ownerId = await resolveCustomerOwnerForSeda(client, snapshot, actorIdentity);
    const linkedInvoiceIds = getLinkedInvoiceIds(snapshot.linked_invoice);

    const insert = {
        columns: ['customer_id', 'name', 'created_by', 'created_at', 'updated_at'],
        values: [customerBubbleId, customerName, String(ownerId)],
        placeholders: ['$1', '$2', '$3', 'NOW()', 'NOW()']
    };

    pushOptionalInsertField(customerColumns, insert, 'phone', normalizeOptionalText(formValues.phone));
    pushOptionalInsertField(customerColumns, insert, 'email', normalizeOptionalText(formValues.email));
    pushOptionalInsertField(customerColumns, insert, 'address', normalizeOptionalText(formValues.registered_address));
    pushOptionalInsertField(customerColumns, insert, 'city', normalizeOptionalText(formValues.city));
    pushOptionalInsertField(customerColumns, insert, 'state', normalizeOptionalText(formValues.state));
    pushOptionalInsertField(customerColumns, insert, 'postcode', normalizeOptionalText(formValues.postcode));
    pushOptionalInsertField(customerColumns, insert, 'ic_number', normalizeOptionalText(formValues.ic_no));
    pushOptionalInsertField(customerColumns, insert, 'linked_seda_registration', snapshot.bubble_id);

    await client.query(
        `INSERT INTO customer (${insert.columns.join(', ')})
         VALUES (${insert.placeholders.join(', ')})`,
        insert.values
    );

    await client.query(
        `UPDATE seda_registration
         SET linked_customer = $1,
             updated_at = NOW(),
             modified_date = NOW()
         WHERE bubble_id = $2`,
        [customerBubbleId, snapshot.bubble_id]
    );

    if (customerColumns.has('linked_seda_registration')) {
        await client.query(
            `UPDATE customer
             SET linked_seda_registration = $1,
                 updated_at = NOW()
             WHERE customer_id = $2`,
            [snapshot.bubble_id, customerBubbleId]
        );
    }

    if (linkedInvoiceIds.length && invoiceColumns.has('linked_customer')) {
        const invoiceSets = ['linked_customer = $1', 'updated_at = NOW()'];
        const invoiceValues = [customerBubbleId];
        let param = 2;

        if (invoiceColumns.has('linked_seda_registration')) {
            invoiceSets.push(`linked_seda_registration = COALESCE(linked_seda_registration, $${param++})`);
            invoiceValues.push(snapshot.bubble_id);
        }
        if (invoiceColumns.has('customer_name_snapshot')) {
            invoiceSets.push(`customer_name_snapshot = COALESCE($${param++}, customer_name_snapshot)`);
            invoiceValues.push(customerName);
        }
        if (invoiceColumns.has('customer_phone_snapshot')) {
            invoiceSets.push(`customer_phone_snapshot = COALESCE($${param++}, customer_phone_snapshot)`);
            invoiceValues.push(normalizeOptionalText(formValues.phone));
        }
        if (invoiceColumns.has('customer_email_snapshot')) {
            invoiceSets.push(`customer_email_snapshot = COALESCE($${param++}, customer_email_snapshot)`);
            invoiceValues.push(normalizeOptionalText(formValues.email));
        }
        if (invoiceColumns.has('customer_address_snapshot')) {
            invoiceSets.push(`customer_address_snapshot = COALESCE($${param++}, customer_address_snapshot)`);
            invoiceValues.push(normalizeOptionalText(formValues.registered_address));
        }

        invoiceValues.push(linkedInvoiceIds);
        await client.query(
            `UPDATE invoice
             SET ${invoiceSets.join(', ')}
             WHERE bubble_id = ANY($${param}::text[])`,
            invoiceValues
        );
    }

    return customerBubbleId;
}

/**
 * Update linked customer profile from SEDA form values
 * @param {object} client - Database client
 * @param {string} customerBubbleId - Customer bubble ID
 * @param {object} formValues - Form values from SEDA save
 */
async function updateLinkedCustomerFromSeda(client, customerBubbleId, formValues) {
    if (!customerBubbleId) return;

    const customerColumns = await getTableColumns(client, 'customer', 'customer');
    const assignments = ['updated_at = NOW()'];
    const values = [];
    let param = 1;

    function addUpdate(column, value) {
        if (!customerColumns.has(column)) return;
        if (value === null || value === undefined) return;
        values.push(value);
        assignments.push(`${column} = $${param++}`);
    }

    addUpdate('name', formValues.customer_name);
    addUpdate('phone', formValues.phone);
    addUpdate('email', formValues.email);
    addUpdate('address', formValues.registered_address);
    addUpdate('city', formValues.city);
    addUpdate('state', formValues.state);
    addUpdate('postcode', formValues.postcode);
    addUpdate('ic_number', formValues.ic_no);

    if (values.length === 0) return;

    values.push(customerBubbleId);
    await client.query(
        `UPDATE customer SET ${assignments.join(', ')} WHERE customer_id = $${param}`,
        values
    );
}

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
    tnb_bills_12_months: { label: 'TNB Bills Up to 12 Months', accept: ['application/pdf', 'image/*'], maxMB: 25, column: 'tnb_bills_12_months', isArray: true, maxItems: 12 },
    property_proof: { label: 'Property Ownership Proof', accept: ['application/pdf', 'image/*'],      maxMB: 25, column: 'property_ownership_prove'  },
    tnb_meter:      { label: 'TNB Meter Image',          accept: ['image/*'],                         maxMB: 20, column: 'tnb_meter'                },
    tax_document:   { label: 'Tax Document',            accept: ['application/pdf', 'image/*'],      maxMB: 25, column: 'tax_document'              },
    ssm_registration: { label: 'SSM Registration',      accept: ['application/pdf', 'image/*'],      maxMB: 25, column: 'ssm_registration'          },
    ssm_form_9:     { label: 'SSM Form 9',              accept: ['application/pdf', 'image/*'],      maxMB: 25, column: 'ssm_form_9'                },
    ssm_form_49:    { label: 'SSM Form 49',             accept: ['application/pdf', 'image/*'],      maxMB: 25, column: 'ssm_form_49'               },
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

async function requireSedaOwnershipForId(req, res, next, id) {
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
        const authUserId = getCanonicalUserIdentity(req);
        const authUserBubbleId = authUserId
            ? await sedaRepo.resolveUserBubbleId(client, authUserId)
            : null;

        let linkedInvoiceAgent = null;
        let linkedInvoiceCreatedBy = null;
        const linkedInvoiceId = Array.isArray(record.linked_invoice) ? record.linked_invoice[0] : null;
        if (linkedInvoiceId) {
            const invoiceRes = await client.query(
                'SELECT linked_agent, created_by FROM invoice WHERE bubble_id = $1 LIMIT 1',
                [linkedInvoiceId]
            );
            linkedInvoiceAgent = invoiceRes.rows[0]?.linked_agent || null;
            linkedInvoiceCreatedBy = invoiceRes.rows[0]?.created_by || null;
        }

        const ownerCandidates = await Promise.all([
            record.agent,
            record.created_by,
            linkedInvoiceAgent,
            linkedInvoiceCreatedBy
        ].map((identity) => sedaRepo.resolveUserBubbleId(client, identity)));
        const ownerIds = new Set(ownerCandidates.filter(Boolean).map(String));
        const isOwner = authUserBubbleId ? ownerIds.has(String(authUserBubbleId)) : false;

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

function requireSedaOwnership(req, res, next) {
    return requireSedaOwnershipForId(req, res, next, req.params.id);
}

function requireSedaBodyOwnership(req, res, next) {
    const sedaId = req.body?.sedaId;
    if (!sedaId) return res.status(400).json({ success: false, error: 'sedaId is required.' });
    return requireSedaOwnershipForId(req, res, next, sedaId);
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
            if (rule.isArray) {
                const updateResult = await client.query(
                    `UPDATE seda_registration
                     SET ${rule.column} = array_append(COALESCE(${rule.column}, ARRAY[]::text[]), $1),
                         modified_date = NOW(),
                         updated_at = NOW()
                     WHERE bubble_id = $2
                       AND COALESCE(array_length(${rule.column}, 1), 0) < $3`,
                    [fileUrl, recordId, rule.maxItems || 12]
                );
                if (!updateResult.rowCount) {
                    safeDelete(req.file.path);
                    return res.status(409).json(uploadError(ERROR_CODES.DB_FAILED, { field, error: `${rule.label}: maximum ${rule.maxItems || 12} files already uploaded.` }));
                }
            } else {
                await client.query(
                    `UPDATE seda_registration
                     SET ${rule.column} = $1, modified_date = NOW(), updated_at = NOW()
                     WHERE bubble_id = $2`,
                    [fileUrl, recordId]
                );
            }
            const _auditInvoiceId = await getLinkedInvoiceBubbleId(client, recordId);
            const _auditActor = getSedaActor(req, recordId);
            await writeInvoiceAuditEntry(client, {
                invoiceBubbleId: _auditInvoiceId,
                entityType: 'seda_upload',
                actionType: 'ADDED',
                changes: [{ field: rule.label, after: fileUrl }],
                actorName: _auditActor.name,
                actorRole: _auditActor.role,
            });
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

function normalizeOptionalText(value) {
    if (value === undefined || value === null) return null;
    return String(value).trim();
}

function comparableAuditText(value) {
    const normalized = normalizeOptionalText(value);
    return normalized === '' ? null : normalized;
}

function sameAuditValue(before, after) {
    return comparableAuditText(before) === comparableAuditText(after);
}

function addAuditChange(changes, field, before, after) {
    const normalizedAfter = normalizeOptionalText(after);
    if (normalizedAfter === null || sameAuditValue(before, normalizedAfter)) return;
    changes.push({
        field,
        before: normalizeOptionalText(before),
        after: normalizedAfter
    });
}

async function getSedaEditableSnapshot(client, sedaId) {
    const sedaColumns = await getTableColumns(client, 'seda_registration', 'seda');
    const applicantNameSelect = sedaColumns.has('applicant_name') ? 's.applicant_name' : 'NULL::text AS applicant_name';
    const applicantPhoneSelect = sedaColumns.has('applicant_phone') ? 's.applicant_phone' : 'NULL::text AS applicant_phone';
    const applicantEmailSelect = sedaColumns.has('applicant_email') ? 's.applicant_email' : 'NULL::text AS applicant_email';
    const applicantIcSelect = sedaColumns.has('applicant_ic') ? 's.applicant_ic' : 'NULL::text AS applicant_ic';
    const applicantTinSelect = sedaColumns.has('applicant_tin') ? 's.applicant_tin' : 'NULL::text AS applicant_tin';

    const result = await client.query(
        `SELECT
             s.bubble_id, s.linked_customer, s.linked_invoice, s.created_by, s.agent,
             ${applicantNameSelect}, ${applicantPhoneSelect}, ${applicantEmailSelect}, ${applicantIcSelect}, ${applicantTinSelect},
             s.installation_address, s.city, s.state, s.postcode, s.tnb_account_no, s.phase_type,
             s.e_contact_name, s.e_contact_relationship, s.e_contact_no, s.e_contact_mykad,
             s.ic_no, s.email, s.e_email,
             c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email,
             c.ic_number AS customer_ic_number, c.address AS customer_address
         FROM seda_registration s
         LEFT JOIN customer c ON s.linked_customer = c.customer_id
         WHERE s.bubble_id = $1
         LIMIT 1`,
        [sedaId]
    );
    return result.rows[0] || null;
}

function buildSedaFormAuditChanges(snapshot, payload) {
    const changes = [];
    addAuditChange(changes, 'Applicant Name', snapshot.applicant_name || snapshot.customer_name, payload.customer_name);
    addAuditChange(changes, 'Applicant Phone', snapshot.applicant_phone || snapshot.customer_phone, payload.phone);
    if (!snapshot.linked_customer) {
        addAuditChange(changes, 'Registered Address', null, payload.registered_address);
    }
    addAuditChange(changes, 'Applicant Email', snapshot.applicant_email || snapshot.email || snapshot.customer_email, payload.email);
    addAuditChange(changes, 'IC Number', snapshot.applicant_ic || snapshot.ic_no || snapshot.customer_ic_number, payload.ic_no);
    addAuditChange(changes, 'TIN', snapshot.applicant_tin, payload.tin);
    addAuditChange(changes, 'Installation Address', snapshot.installation_address, payload.installation_address);
    addAuditChange(changes, 'City', snapshot.city, payload.city);
    addAuditChange(changes, 'State', snapshot.state, payload.state);
    addAuditChange(changes, 'Postcode', snapshot.postcode, payload.postcode);
    addAuditChange(changes, 'TNB Account No', snapshot.tnb_account_no, payload.tnb_account_no);
    addAuditChange(changes, 'Phase Type', snapshot.phase_type, payload.phase_type);
    addAuditChange(changes, 'Emergency Contact Name', snapshot.e_contact_name, payload.e_contact_name);
    addAuditChange(changes, 'Emergency Contact Relationship', snapshot.e_contact_relationship, payload.e_contact_relationship);
    addAuditChange(changes, 'Emergency Contact Phone', snapshot.e_contact_no, payload.e_contact_no);
    addAuditChange(changes, 'Emergency Contact Email', snapshot.e_email, payload.e_email);
    addAuditChange(changes, 'Emergency Contact MyKad', snapshot.e_contact_mykad, payload.e_contact_mykad);
    return changes;
}

function buildSedaTextUpdate(recordId, formValues, sedaColumns) {
    const assignments = [];
    const values = [];

    function addColumn(column, value) {
        if (!sedaColumns.has(column)) return;
        values.push(value);
        assignments.push(`${column} = COALESCE($${values.length}, ${column})`);
    }

    addColumn('applicant_name', formValues.customer_name);
    addColumn('applicant_phone', formValues.phone);
    addColumn('applicant_email', formValues.email);
    addColumn('applicant_ic', formValues.ic_no);
    addColumn('applicant_tin', formValues.tin);
    addColumn('installation_address', formValues.installation_address);
    addColumn('city', formValues.city);
    addColumn('state', formValues.state);
    addColumn('postcode', formValues.postcode);
    addColumn('tnb_account_no', formValues.tnb_account_no);
    addColumn('phase_type', formValues.phase_type);
    addColumn('e_contact_name', formValues.e_contact_name);
    addColumn('e_contact_relationship', formValues.e_contact_relationship);
    addColumn('e_contact_no', formValues.e_contact_no);
    addColumn('e_contact_mykad', formValues.e_contact_mykad);
    addColumn('ic_no', formValues.ic_no);
    addColumn('email', formValues.email);
    addColumn('e_email', formValues.e_email);

    assignments.push('modified_date = NOW()', 'updated_at = NOW()');
    values.push(recordId);

    return {
        sql: `UPDATE seda_registration
              SET ${assignments.join(', ')}
              WHERE bubble_id = $${values.length}`,
        values
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

        const currentValue = existing.rows[0]?.current_value;
        const currentList = Array.isArray(currentValue) ? currentValue : [];
        const activeFileFound = rule.isArray
            ? currentList.includes(url)
            : (currentValue || null) === url;

        if (!activeFileFound) {
            return res.status(404).json({ success: false, error: 'File not found on the active SEDA record.' });
        }

        await client.query('BEGIN');
        if (rule.isArray) {
            await client.query(
                `UPDATE seda_registration
                 SET ${rule.column} = array_remove(COALESCE(${rule.column}, ARRAY[]::text[]), $1),
                     modified_date = NOW(),
                     updated_at = NOW()
                 WHERE bubble_id = $2`,
                [url, recordId]
            );
        } else {
            await client.query(
                `UPDATE seda_registration
                 SET ${rule.column} = NULL,
                     modified_date = NOW(),
                     updated_at = NOW()
                 WHERE bubble_id = $1`,
                [recordId]
            );
        }

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
        const _deleteInvoiceId = await getLinkedInvoiceBubbleId(client, recordId);
        await writeInvoiceAuditEntry(client, {
            invoiceBubbleId: _deleteInvoiceId,
            entityType: 'seda_upload',
            actionType: 'DELETED',
            changes: [{ field: rule.label, before: url }],
            actorName: actor.name,
            actorRole: actor.role,
        });

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

        const currentValue = existing.rows[0]?.current_value;
        const currentList = Array.isArray(currentValue) ? currentValue : [];
        const fileAlreadyActive = rule.isArray
            ? currentList.includes(recycleEntry.fileUrl)
            : (currentValue || null) === recycleEntry.fileUrl;

        if (fileAlreadyActive) {
            return res.status(409).json({ success: false, error: 'This file is already active on the SEDA record.' });
        }

        await client.query('BEGIN');
        if (rule.isArray) {
            const restoreResult = await client.query(
                `UPDATE seda_registration
                 SET ${rule.column} = array_append(COALESCE(${rule.column}, ARRAY[]::text[]), $1),
                     modified_date = NOW(),
                     updated_at = NOW()
                 WHERE bubble_id = $2
                   AND COALESCE(array_length(${rule.column}, 1), 0) < $3`,
                [recycleEntry.fileUrl, recordId, rule.maxItems || 12]
            );
            if (!restoreResult.rowCount) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, error: `${rule.label}: maximum ${rule.maxItems || 12} files already uploaded.` });
            }
        } else {
            await client.query(
                `UPDATE seda_registration
                 SET ${rule.column} = $1,
                     modified_date = NOW(),
                     updated_at = NOW()
                 WHERE bubble_id = $2`,
                [recycleEntry.fileUrl, recordId]
            );
        }

        const actor = getSedaActor(req, recordId);
        await markRecycleBinRestored(client, recycleEntry.recycleBinId, actor.id, actor.name);
        await client.query('COMMIT');
        const _restoreInvoiceId = await getLinkedInvoiceBubbleId(client, recordId);
        await writeInvoiceAuditEntry(client, {
            invoiceBubbleId: _restoreInvoiceId,
            entityType: 'seda_upload',
            actionType: 'ADDED',
            changes: [{ field: rule.label, after: recycleEntry.fileUrl }],
            actorName: actor.name,
            actorRole: actor.role,
        });

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
                customer_profile: {
                    name: seda.customer_profile_name,
                    phone: seda.customer_phone,
                    email: seda.customer_email,
                    address: seda.customer_address,
                    city: seda.customer_city,
                    state: seda.customer_state,
                    postcode: seda.customer_postcode
                },
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

        const { customer_name, phone, registered_address,
                installation_address, city, state, postcode, tnb_account_no, phase_type,
                e_contact_name, e_contact_relationship, e_contact_no, e_contact_mykad,
                ic_no, email, e_email, tin } = req.body;
        const snapshot = await getSedaEditableSnapshot(client, seda.bubble_id);
        if (!snapshot) return res.status(404).json({ success: false, error: 'Not found or expired.' });
        const formValues = {
            customer_name: normalizeOptionalText(customer_name),
            phone: normalizeOptionalText(phone),
            registered_address: normalizeOptionalText(registered_address),
            installation_address: normalizeOptionalText(installation_address),
            city: normalizeOptionalText(city),
            state: normalizeOptionalText(state),
            postcode: normalizeOptionalText(postcode),
            tnb_account_no: normalizeOptionalText(tnb_account_no),
            phase_type: normalizeOptionalText(phase_type),
            e_contact_name: normalizeOptionalText(e_contact_name),
            e_contact_relationship: normalizeOptionalText(e_contact_relationship),
            e_contact_no: normalizeOptionalText(e_contact_no),
            e_contact_mykad: normalizeOptionalText(e_contact_mykad),
            ic_no: normalizeOptionalText(ic_no),
            email: normalizeOptionalText(email),
            e_email: normalizeOptionalText(e_email),
            tin: normalizeOptionalText(tin)
        };
        const auditChanges = buildSedaFormAuditChanges(snapshot, formValues);

        await client.query('BEGIN');
        const textUpdate = buildSedaTextUpdate(seda.bubble_id, formValues, await getTableColumns(client, 'seda_registration', 'seda'));
        await client.query(textUpdate.sql, textUpdate.values);

        if (!snapshot.linked_customer) {
            await createAndLinkCustomerForUnlinkedSeda(client, snapshot, formValues, null);
        }

        const _pubInvoiceId = await getLinkedInvoiceBubbleId(client, seda.bubble_id);
        if (auditChanges.length) {
            await writeInvoiceAuditEntry(client, {
                invoiceBubbleId: _pubInvoiceId,
                entityType: 'seda_registration',
                actionType: 'UPDATED',
                entityId: seda.bubble_id,
                changes: auditChanges,
                actorName: 'Customer (public form)',
                actorRole: 'customer',
            });
        }

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
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
        const userBubbleId = await sedaRepo.resolveUserBubbleId(client, getCanonicalUserIdentity(req));
        if (!userBubbleId) return res.json({ success: true, data: [] });

        const regStatusCol = await getRegStatusColumn(client);
        const sedaColumns = await getTableColumns(client, 'seda_registration', 'seda');
        const applicantNameExpr = sedaColumns.has('applicant_name')
            ? "NULLIF(TRIM(s.applicant_name), '')"
            : 'NULL::text';
        const result = await client.query(
            `SELECT s.bubble_id, s.${regStatusCol} AS reg_status, s.seda_status, s.updated_at,
                    COALESCE(${applicantNameExpr}, c.name, i.customer_name_snapshot, s.e_contact_name, 'Unnamed Customer') as customer_name,
                    i.invoice_number, COALESCE(i.paid, false) as invoice_paid,
                    COALESCE(i.total_amount, 0) as invoice_total, COALESCE(i.paid_amount, 0) as invoice_paid_amount,
                    (COALESCE(i.paid_amount, 0) > 0) as has_payment
             FROM seda_registration s
             LEFT JOIN customer c ON s.linked_customer = c.customer_id
             LEFT JOIN invoice i ON i.bubble_id = ANY(s.linked_invoice)
             LEFT JOIN agent seda_agent ON seda_agent.bubble_id = s.agent
             LEFT JOIN agent invoice_agent ON invoice_agent.bubble_id = i.linked_agent
             WHERE (
                    s.agent = $1
                 OR s.created_by = $1
                 OR i.created_by = $1
                 OR seda_agent.linked_user_login = $1
                 OR seda_agent.created_by = $1
                 OR invoice_agent.linked_user_login = $1
                 OR invoice_agent.created_by = $1
             )
               AND (s.seda_status IS NULL OR (s.seda_status NOT ILIKE 'Submitted%' AND s.seda_status NOT ILIKE 'Approved%'))
               AND (s.${regStatusCol} IS NULL OR (s.${regStatusCol} NOT ILIKE 'Submitted%' AND s.${regStatusCol} NOT ILIKE 'Approved%'))
             ORDER BY has_payment DESC, i.paid_amount DESC, s.updated_at DESC`,
            [userBubbleId]
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

router.post('/api/v1/seda/extract-tnb', requireAuth, requireSedaBodyOwnership, async (req, res) => {
    const { sedaId, fieldKey = 'tnb_bill_1' } = req.body;
    if (!sedaId) return res.status(400).json({ success: false, error: 'sedaId is required.' });

    const rule = FILE_FIELDS[fieldKey];
    if (!rule || !/^tnb_bill_[1-3]$/.test(fieldKey)) {
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

router.post('/api/v1/seda/extract-mykad', requireAuth, requireSedaBodyOwnership, async (req, res) => {
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

router.post('/api/v1/seda/verify-meter', requireAuth, requireSedaBodyOwnership, async (req, res) => {
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

router.post('/api/v1/seda/verify-ownership', requireAuth, requireSedaBodyOwnership, async (req, res) => {
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
    const { customer_name, phone, registered_address,
            installation_address, city, state, postcode, tnb_account_no, phase_type,
            e_contact_name, e_contact_relationship, e_contact_no, e_contact_mykad,
            ic_no, email, e_email, tin } = req.body;

    const client = await pool.connect();
    try {
        const snapshot = await getSedaEditableSnapshot(client, req.params.id);
        if (!snapshot) return res.status(404).json({ success: false, error: 'Not found.' });
        const formValues = {
            customer_name: normalizeOptionalText(customer_name),
            phone: normalizeOptionalText(phone),
            registered_address: normalizeOptionalText(registered_address),
            installation_address: normalizeOptionalText(installation_address),
            city: normalizeOptionalText(city),
            state: normalizeOptionalText(state),
            postcode: normalizeOptionalText(postcode),
            tnb_account_no: normalizeOptionalText(tnb_account_no),
            phase_type: normalizeOptionalText(phase_type),
            e_contact_name: normalizeOptionalText(e_contact_name),
            e_contact_relationship: normalizeOptionalText(e_contact_relationship),
            e_contact_no: normalizeOptionalText(e_contact_no),
            e_contact_mykad: normalizeOptionalText(e_contact_mykad),
            ic_no: normalizeOptionalText(ic_no),
            email: normalizeOptionalText(email),
            e_email: normalizeOptionalText(e_email),
            tin: normalizeOptionalText(tin)
        };
        const auditChanges = buildSedaFormAuditChanges(snapshot, formValues);

        await client.query('BEGIN');
        const textUpdate = buildSedaTextUpdate(req.params.id, formValues, await getTableColumns(client, 'seda_registration', 'seda'));
        await client.query(textUpdate.sql, textUpdate.values);

        if (!snapshot.linked_customer) {
            await createAndLinkCustomerForUnlinkedSeda(client, snapshot, formValues, getCanonicalUserIdentity(req));
        } else {
            // Update linked customer profile with form values
            await updateLinkedCustomerFromSeda(client, snapshot.linked_customer, formValues);
        }

        const _saveInvoiceId = await getLinkedInvoiceBubbleId(client, req.params.id);
        const _saveActor = getSedaActor(req, req.params.id);
        if (auditChanges.length) {
            await writeInvoiceAuditEntry(client, {
                invoiceBubbleId: _saveInvoiceId,
                entityType: 'seda_registration',
                actionType: 'UPDATED',
                entityId: req.params.id,
                changes: auditChanges,
                actorName: _saveActor.name,
                actorRole: _saveActor.role,
                actorUserId: _saveActor.id,
            });
        }

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
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
        const _statusInvoiceId = await getLinkedInvoiceBubbleId(client, req.params.id);
        const _statusActor = getSedaActor(req, req.params.id);
        const _statusChanges = [
            reg_status  && { field: 'SEDA Status',  after: reg_status  },
            seda_status && { field: 'Admin Status', after: seda_status },
        ].filter(Boolean);
        await writeInvoiceAuditEntry(client, {
            invoiceBubbleId: _statusInvoiceId,
            entityType: 'seda_registration',
            actionType: 'UPDATED',
            changes: _statusChanges,
            actorName: _statusActor.name,
            actorRole: _statusActor.role,
        });
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
