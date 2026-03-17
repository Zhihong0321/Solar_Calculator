const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pool = require('../src/core/database/pool');
const { requireAuth } = require('../middleware/auth');
const sedaRepo = require('../src/modules/Invoicing/services/sedaRepo');
const extractionService = require('../src/modules/Invoicing/services/extractionService');

const router = express.Router();
const KEEP_FILE_VALUE = '__KEEP__';
let cachedRegStatusColumn = null;

const FILE_FIELD_RULES = {
    mykad_front: { label: 'MyKad Front', allowed: ['image/*'], maxBytes: 8 * 1024 * 1024 },
    mykad_back: { label: 'MyKad Back', allowed: ['image/*'], maxBytes: 8 * 1024 * 1024 },
    mykad_pdf: { label: 'MyKad PDF', allowed: ['application/pdf'], maxBytes: 15 * 1024 * 1024 },
    tnb_bill_1: { label: 'TNB Bill Month 1', allowed: ['application/pdf'], maxBytes: 15 * 1024 * 1024 },
    tnb_bill_2: { label: 'TNB Bill Month 2', allowed: ['application/pdf'], maxBytes: 15 * 1024 * 1024 },
    tnb_bill_3: { label: 'TNB Bill Month 3', allowed: ['application/pdf'], maxBytes: 15 * 1024 * 1024 },
    property_proof: { label: 'Property Ownership Proof', allowed: ['application/pdf', 'image/*'], maxBytes: 15 * 1024 * 1024 },
    tnb_meter: { label: 'TNB Meter Image', allowed: ['image/*'], maxBytes: 8 * 1024 * 1024 }
};

function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function isMimeAllowed(mimeType, allowed = []) {
    return allowed.some(rule => {
        if (rule.endsWith('/*')) return mimeType.startsWith(rule.replace('/*', '/'));
        return mimeType === rule;
    });
}

function parseDataUrlFile(fileData) {
    const matches = typeof fileData === 'string'
        ? fileData.match(/^data:([A-Za-z0-9.+/-]+);base64,([\s\S]+)$/)
        : null;
    if (!matches || matches.length !== 3) {
        return { error: 'Invalid base64 data URL format.' };
    }

    const mimeType = matches[1];
    let buffer;
    try {
        buffer = Buffer.from(matches[2], 'base64');
    } catch (err) {
        return { error: 'Failed to decode base64 file payload.' };
    }
    if (!buffer || buffer.length === 0) {
        return { error: 'File payload is empty after decoding.' };
    }

    return { mimeType, buffer };
}

function validateSingleFileField(field, rawValue) {
    const rules = FILE_FIELD_RULES[field] || { label: field, allowed: ['application/pdf', 'image/*'], maxBytes: 10 * 1024 * 1024 };
    const label = rules.label;

    if (rawValue === undefined) return { state: 'keep' };
    if (rawValue === null || rawValue === '') return { state: 'clear' };
    if (typeof rawValue === 'string' && rawValue.startsWith('http')) return { state: 'set', preExistingUrl: rawValue };

    const parsed = parseDataUrlFile(rawValue);
    if (parsed.error) {
        return {
            state: 'error',
            error: {
                field,
                label,
                code: 'INVALID_FILE_FORMAT',
                message: `${label}: ${parsed.error}`,
                expected: `Allowed: ${rules.allowed.join(', ')}, Max: ${formatBytes(rules.maxBytes)}`
            }
        };
    }

    if (!isMimeAllowed(parsed.mimeType, rules.allowed)) {
        return {
            state: 'error',
            error: {
                field,
                label,
                code: 'UNSUPPORTED_MIME_TYPE',
                message: `${label}: Unsupported file type ${parsed.mimeType}.`,
                mimeType: parsed.mimeType,
                expected: rules.allowed
            }
        };
    }

    if (parsed.buffer.length > rules.maxBytes) {
        return {
            state: 'error',
            error: {
                field,
                label,
                code: 'FILE_TOO_LARGE',
                message: `${label}: File size ${formatBytes(parsed.buffer.length)} exceeds limit ${formatBytes(rules.maxBytes)}.`,
                sizeBytes: parsed.buffer.length,
                maxBytes: rules.maxBytes
            }
        };
    }

    return { state: 'set', mimeType: parsed.mimeType, buffer: parsed.buffer };
}

function persistValidatedFile(req, uploadDir, id, prefix, validationResult) {
    if (validationResult.state === 'keep') return KEEP_FILE_VALUE;
    if (validationResult.state === 'clear') return null;
    if (validationResult.preExistingUrl) return validationResult.preExistingUrl;

    const ext = validationResult.mimeType === 'application/pdf' ? '.pdf' : '.jpg';
    const filename = `${prefix}_${id}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
    fs.writeFileSync(path.join(uploadDir, filename), validationResult.buffer);

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    return `${protocol}://${host}/seda-files/${filename}`;
}

function validateExtractionPayload(fileData, options = {}) {
    const { label = 'Document', allowed = ['application/pdf', 'image/*'], maxBytes = 20 * 1024 * 1024 } = options;
    const parsed = parseDataUrlFile(fileData);
    if (parsed.error) {
        return {
            ok: false,
            status: 400,
            payload: {
                success: false,
                error: `${label}: ${parsed.error}`,
                code: 'INVALID_FILE_FORMAT',
                details: [{ label, expected: `Allowed: ${allowed.join(', ')}, Max: ${formatBytes(maxBytes)}` }]
            }
        };
    }
    if (!isMimeAllowed(parsed.mimeType, allowed)) {
        return {
            ok: false,
            status: 400,
            payload: {
                success: false,
                error: `${label}: Unsupported file type ${parsed.mimeType}.`,
                code: 'UNSUPPORTED_MIME_TYPE',
                details: [{ label, mimeType: parsed.mimeType, allowed }]
            }
        };
    }
    if (parsed.buffer.length > maxBytes) {
        return {
            ok: false,
            status: 400,
            payload: {
                success: false,
                error: `${label}: File size ${formatBytes(parsed.buffer.length)} exceeds limit ${formatBytes(maxBytes)}.`,
                code: 'FILE_TOO_LARGE',
                details: [{ label, sizeBytes: parsed.buffer.length, maxBytes }]
            }
        };
    }
    return { ok: true, mimeType: parsed.mimeType, buffer: parsed.buffer };
}

async function getRegStatusColumn(client) {
    if (cachedRegStatusColumn) return cachedRegStatusColumn;
    const colRes = await client.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_name = 'seda_registration'
           AND column_name IN ('mapper_status', 'reg_status')`
    );
    const cols = new Set(colRes.rows.map(r => r.column_name));
    if (cols.has('mapper_status')) {
        cachedRegStatusColumn = 'mapper_status';
    } else if (cols.has('reg_status')) {
        cachedRegStatusColumn = 'reg_status';
    } else {
        cachedRegStatusColumn = 'reg_status';
    }
    return cachedRegStatusColumn;
}

// ============================================================
// PUBLIC ROUTES (No Auth Required) - Share Token Access
// ============================================================

/**
 * GET /seda-public/:shareToken
 * Public SEDA Registration Form (NO AUTH - Share Token Access)
 */
router.get('/seda-public/:shareToken', async (req, res) => {
    const { shareToken } = req.params;
    const client = await pool.connect();

    try {
        const seda = await sedaRepo.getByShareToken(client, shareToken);

        if (!seda) {
            return res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>SEDA Registration Not Found</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <script src="https://cdn.tailwindcss.com"></script>
                </head>
                <body class="bg-gray-100 flex items-center justify-center min-h-screen">
                    <div class="max-w-2xl mx-auto bg-white rounded-lg shadow p-6 text-center">
                        <h1 class="text-2xl font-bold text-red-600 mb-4">SEDA Registration Not Found</h1>
                        <p class="text-gray-700">The registration form you're looking for doesn't exist or has expired.</p>
                        <p class="text-gray-600 text-sm mt-2">Please contact support for a new link.</p>
                    </div>
                </body>
                </html>
            `);
        }

        console.log(`[SEDA Public] Serving registration via share token: ${shareToken.substring(0, 8)}...`);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        const templatePath = path.join(__dirname, '..', 'public', 'templates', 'seda_register.html');
        res.sendFile(templatePath);
    } catch (err) {
        console.error('[SEDA Public] Error:', err);
        res.status(500).send('Error loading registration form');
    } finally {
        client.release();
    }
});

/**
 * GET /api/v1/seda-public/:shareToken
 * Get SEDA Registration details by share token (public API)
 */
router.get('/api/v1/seda-public/:shareToken', async (req, res) => {
    const { shareToken } = req.params;
    const client = await pool.connect();

    try {
        const seda = await sedaRepo.getByShareToken(client, shareToken);

        if (!seda) {
            return res.status(404).json({ success: false, error: 'Registration not found or expired' });
        }

        if (!seda.reg_status && seda.mapper_status) {
            seda.reg_status = seda.mapper_status;
        }

        // Fetch invoice details for signature status and share link
        let invoice = null;
        if (seda.linked_invoice && seda.linked_invoice.length > 0) {
            const invRes = await client.query(
                'SELECT bubble_id, customer_signature, share_token, invoice_number FROM invoice WHERE bubble_id = $1',
                [seda.linked_invoice[0]]
            );
            if (invRes.rows.length > 0) {
                invoice = invRes.rows[0];
            }
        }

        res.json({
            success: true,
            data: {
                ...seda,
                customer_profile: {
                    name: seda.customer_name,
                    phone: seda.phone,
                    email: seda.email,
                    address: seda.address,
                    city: seda.city,
                    state: seda.state,
                    postcode: seda.postcode
                },
                invoice_details: invoice
            }
        });
    } catch (err) {
        console.error('Error fetching SEDA by share token:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

/**
 * POST /api/v1/seda-public/:shareToken
 * Update SEDA Registration by share token (public API)
 */
router.post('/api/v1/seda-public/:shareToken', async (req, res) => {
    const { shareToken } = req.params;
    const {
        installation_address, city, state, postcode, tnb_account_no, phase_type,
        e_contact_name, e_contact_relationship, e_contact_no, e_contact_mykad,
        ic_no, email, e_email,
        mykad_front, mykad_back, mykad_pdf,
        tnb_bill_1, tnb_bill_2, tnb_bill_3,
        property_proof, tnb_meter
    } = req.body;

    const client = await pool.connect();

    try {
        // First, get the SEDA record by share token to get bubble_id
        const seda = await sedaRepo.getByShareToken(client, shareToken);
        if (!seda) {
            return res.status(404).json({ success: false, error: 'Registration not found or expired' });
        }

        const id = seda.bubble_id;

        // Storage setup
        const storageRoot = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '../storage');
        const uploadDir = path.join(storageRoot, 'seda_registration');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const fileFieldPayloads = {
            mykad_front,
            mykad_back,
            mykad_pdf,
            tnb_bill_1,
            tnb_bill_2,
            tnb_bill_3,
            property_proof,
            tnb_meter
        };

        const fileFieldPrefixes = {
            mykad_front: 'mykad_front',
            mykad_back: 'mykad_back',
            mykad_pdf: 'mykad_pdf',
            tnb_bill_1: 'tnb_bill_1',
            tnb_bill_2: 'tnb_bill_2',
            tnb_bill_3: 'tnb_bill_3',
            property_proof: 'property_proof',
            tnb_meter: 'tnb_meter'
        };

        const fileErrors = [];
        const fileUrls = {};
        for (const [field, inputValue] of Object.entries(fileFieldPayloads)) {
            const check = validateSingleFileField(field, inputValue);
            if (check.state === 'error') {
                fileErrors.push(check.error);
                continue;
            }
            fileUrls[field] = persistValidatedFile(req, uploadDir, id, fileFieldPrefixes[field], check);
        }

        if (fileErrors.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'File validation failed.',
                code: 'FILE_VALIDATION_FAILED',
                details: fileErrors
            });
        }

        const url_mykad_front = fileUrls.mykad_front;
        const url_mykad_back = fileUrls.mykad_back;
        const url_mykad_pdf = fileUrls.mykad_pdf;
        const url_tnb_1 = fileUrls.tnb_bill_1;
        const url_tnb_2 = fileUrls.tnb_bill_2;
        const url_tnb_3 = fileUrls.tnb_bill_3;
        const url_property_proof = fileUrls.property_proof;
        const url_tnb_meter = fileUrls.tnb_meter;

        // Update DB
        await client.query(
            `UPDATE seda_registration
             SET installation_address = COALESCE($1, installation_address),
                 city = COALESCE($2, city),
                 state = COALESCE($3, state),
                 postcode = COALESCE($4, postcode),
                 tnb_account_no = COALESCE($5, tnb_account_no),
                 phase_type = COALESCE($6, phase_type),
                 e_contact_name = COALESCE($7, e_contact_name),
                 e_contact_relationship = COALESCE($8, e_contact_relationship),
                 e_contact_no = COALESCE($9, e_contact_no),
                 e_contact_mykad = COALESCE($10, e_contact_mykad),
                 ic_no = COALESCE($11, ic_no),
                 email = COALESCE($12, email),
                 e_email = COALESCE($13, e_email),
                 ic_copy_front = CASE WHEN $14 = '${KEEP_FILE_VALUE}' THEN ic_copy_front ELSE $14 END,
                 ic_copy_back = CASE WHEN $15 = '${KEEP_FILE_VALUE}' THEN ic_copy_back ELSE $15 END,
                 mykad_pdf = CASE WHEN $16 = '${KEEP_FILE_VALUE}' THEN mykad_pdf ELSE $16 END,
                 tnb_bill_1 = CASE WHEN $17 = '${KEEP_FILE_VALUE}' THEN tnb_bill_1 ELSE $17 END,
                 tnb_bill_2 = CASE WHEN $18 = '${KEEP_FILE_VALUE}' THEN tnb_bill_2 ELSE $18 END,
                 tnb_bill_3 = CASE WHEN $19 = '${KEEP_FILE_VALUE}' THEN tnb_bill_3 ELSE $19 END,
                 property_ownership_prove = CASE WHEN $20 = '${KEEP_FILE_VALUE}' THEN property_ownership_prove ELSE $20 END,
                 tnb_meter = CASE WHEN $21 = '${KEEP_FILE_VALUE}' THEN tnb_meter ELSE $21 END,
                 modified_date = NOW(),
                 updated_at = NOW()
             WHERE bubble_id = $22`,
            [
                installation_address, city, state, postcode, tnb_account_no, phase_type,
                e_contact_name, e_contact_relationship, e_contact_no, e_contact_mykad || null, ic_no, email || null, e_email || null,
                url_mykad_front, url_mykad_back, url_mykad_pdf,
                url_tnb_1, url_tnb_2, url_tnb_3,
                url_property_proof, url_tnb_meter,
                id
            ]
        );

        // Update linked customer with IC No and Email if provided
        if (ic_no || email) {
            const sedaRes = await client.query(
                'SELECT linked_customer FROM seda_registration WHERE bubble_id = $1',
                [id]
            );
            if (sedaRes.rows.length > 0 && sedaRes.rows[0].linked_customer) {
                const customerId = sedaRes.rows[0].linked_customer;
                await client.query(
                    `UPDATE customer 
                     SET ic_number = COALESCE($1, ic_number),
                         email = COALESCE($2, email),
                         updated_at = NOW()
                     WHERE customer_id = $3`,
                    [ic_no || null, email || null, customerId]
                );
            }
        }

        res.json({ success: true, message: 'Saved successfully' });

    } catch (err) {
        console.error('Error saving SEDA (public):', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

// ============================================================
// PROTECTED ROUTES (Auth Required)
// ============================================================

/**
 * GET /api/v1/seda/my-seda
 * Get SEDA Registrations for the current logged-in agent
 * Prioritizes invoices with payment and filters out completed/pending statuses
 */
router.get('/api/v1/seda/my-seda', requireAuth, async (req, res) => {
    const userId = req.user.userId || req.user.id;
    const client = await pool.connect();

    try {
        // 1. Resolve Agent Profile from the 'agent' table linked to current user
        let agentProfileId = null;
        const userRes = await client.query(`
            SELECT a.bubble_id 
            FROM "user" u
            JOIN agent a ON u.linked_agent_profile = a.bubble_id
            WHERE u.id::text = $1 OR u.bubble_id = $1
        `, [String(userId)]);

        if (userRes.rows.length > 0) {
            agentProfileId = userRes.rows[0].bubble_id;
        }

        if (!agentProfileId) {
            return res.json({ success: true, data: [] });
        }

        // 2. Query SEDA registrations
        // Use LEFT JOIN for invoice to show SEDA even if linked_invoice is missing or empty
        // Use COALESCE/MAX to handle cases where one SEDA might be linked to multiple invoices (though rare)
        const regStatusCol = await getRegStatusColumn(client);
        const query = `
            SELECT 
                s.bubble_id,
                s.${regStatusCol} AS reg_status,
                s.seda_status,
                s.updated_at,
                COALESCE(c.name, i.customer_name_snapshot, s.e_contact_name, 'Unnamed Customer') as customer_name,
                i.invoice_number,
                COALESCE(i.paid, false) as invoice_paid,
                COALESCE(i.total_amount, 0) as invoice_total,
                COALESCE(i.paid_amount, 0) as invoice_paid_amount,
                (COALESCE(i.paid_amount, 0) > 0) as has_payment
            FROM seda_registration s
            LEFT JOIN customer c ON s.linked_customer = c.customer_id
            LEFT JOIN invoice i ON i.bubble_id = ANY(s.linked_invoice)
            WHERE (s.agent = $1 OR s.created_by = $1 OR i.linked_agent = $1)
              AND (
                s.seda_status IS NULL 
                OR (
                    s.seda_status NOT ILIKE 'Submitted%' 
                    AND s.seda_status NOT ILIKE 'Approved%'
                )
              )
              AND (
                s.${regStatusCol} IS NULL
                OR (
                    s.${regStatusCol} NOT ILIKE 'Submitted%'
                    AND s.${regStatusCol} NOT ILIKE 'Approved%'
                )
              )
            ORDER BY has_payment DESC, i.paid_amount DESC, s.updated_at DESC
        `;

        const result = await client.query(query, [agentProfileId]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('[My SEDA] Error:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

/**
 * PATCH /api/v1/seda/:id/status
 * Update SEDA registration status (Internal/Admin)
 */
router.patch('/api/v1/seda/:id/status', requireAuth, async (req, res) => {
    const { id } = req.params;
    const { reg_status, seda_status } = req.body;
    const client = await pool.connect();

    try {
        const updates = [];
        const params = [id];
        const regStatusCol = await getRegStatusColumn(client);

        if (reg_status) {
            if (!sedaRepo.SedaStatus.REG.includes(reg_status.toLowerCase())) {
                return res.status(400).json({
                    success: false,
                    error: `Invalid reg_status. Allowed: ${sedaRepo.SedaStatus.REG.join(', ')}`
                });
            }
            params.push(reg_status);
            updates.push(`${regStatusCol} = $${params.length}`);
        }

        if (seda_status) {
            if (!sedaRepo.SedaStatus.ADMIN.includes(seda_status.toLowerCase())) {
                return res.status(400).json({
                    success: false,
                    error: `Invalid seda_status. Allowed: ${sedaRepo.SedaStatus.ADMIN.join(', ')}`
                });
            }
            params.push(seda_status);
            updates.push(`seda_status = $${params.length}`);
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'No status provided' });
        }

        await client.query(
            `UPDATE seda_registration SET ${updates.join(', ')}, updated_at = NOW() WHERE bubble_id = $1`,
            params
        );

        res.json({ success: true, message: 'Status updated' });
    } catch (err) {
        console.error('Error updating SEDA status:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

/**
 * GET /seda-register
 * Render the SEDA Registration Form
 * Query Params: ?id=SEDA_BUBBLE_ID
 */
router.get('/seda-register', (req, res) => {
    console.log('Serving SEDA Register Page V2 - No Cache');
    // Check if ID is provided
    if (!req.query.id) {
        return res.status(400).send('Missing SEDA Registration ID');
    }
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const templatePath = path.join(__dirname, '..', 'public', 'templates', 'seda_register.html');
    res.sendFile(templatePath);
});

// --- EXTRACTION ROUTES (Must be BEFORE parameterized :id routes) ---

/**
 * POST /api/v1/seda/extract-tnb
 * Extract and Verify TNB Bill
 */
router.post('/api/v1/seda/extract-tnb', async (req, res) => {
    const client = await pool.connect();
    try {
        const { fileData, filename, sedaId } = req.body;
        if (!fileData) return res.status(400).json({ success: false, error: 'No file data provided', code: 'MISSING_FILE_DATA' });
        const fileCheck = validateExtractionPayload(fileData, {
            label: 'TNB Bill',
            allowed: ['application/pdf', 'image/*'],
            maxBytes: 20 * 1024 * 1024
        });
        if (!fileCheck.ok) return res.status(fileCheck.status).json(fileCheck.payload);
        const { mimeType, buffer } = fileCheck;

        const result = await extractionService.verifyTnbBill(buffer, mimeType);

        if (sedaId) {
            const statusText = result.tnb_account ? 'EXTRACTED' : 'FAILED EXTRACTION';
            const logEntry = `\n[${new Date().toISOString().split('T')[0]}] TNB BILL upload = ${statusText} (Account: ${result.tnb_account || 'N/A'}, State: ${result.state || 'N/A'})`;

            await client.query(
                `UPDATE seda_registration 
                 SET special_remark = COALESCE(special_remark, '') || $1,
                     tnb_account_no = COALESCE($2, tnb_account_no),
                     state = COALESCE($3, state)
                 WHERE bubble_id = $4`,
                [logEntry, result.tnb_account, result.state, sedaId]
            );
        }

        res.json({ success: true, data: result });
    } catch (err) {
        console.error('[SEDA Route] TNB Extraction Error:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

/**
 * POST /api/v1/seda/extract-mykad
 * Extract and Verify MyKad
 */
router.post('/api/v1/seda/extract-mykad', async (req, res) => {
    const client = await pool.connect();
    try {
        const { fileData, filename, sedaId } = req.body;
        if (!fileData) return res.status(400).json({ success: false, error: 'No file data provided', code: 'MISSING_FILE_DATA' });
        const fileCheck = validateExtractionPayload(fileData, {
            label: 'MyKad Document',
            allowed: ['application/pdf', 'image/*'],
            maxBytes: 20 * 1024 * 1024
        });
        if (!fileCheck.ok) return res.status(fileCheck.status).json(fileCheck.payload);
        const { mimeType, buffer } = fileCheck;

        const result = await extractionService.verifyMykad(buffer, mimeType);

        if (sedaId) {
            const statusText = result.quality_ok ? 'PASSED CHECK' : 'QUALITY WARNING';
            const logEntry = `\n[${new Date().toISOString().split('T')[0]}] MYKAD Upload = ${statusText} (Name: ${result.customer_name})`;

            // If quality passes, auto-populate name and IC number into form
            if (result.quality_ok) {
                await client.query(
                    `UPDATE seda_registration 
                     SET special_remark = COALESCE(special_remark, '') || $1,
                         check_mykad = $2,
                         ic_no = COALESCE($3, ic_no)
                     WHERE bubble_id = $4`,
                    [logEntry, result.quality_ok, result.mykad_id, sedaId]
                );
            } else {
                // Quality failed - only log, don't populate
                await client.query(
                    `UPDATE seda_registration 
                     SET special_remark = COALESCE(special_remark, '') || $1,
                         check_mykad = $2
                     WHERE bubble_id = $3`,
                    [logEntry, result.quality_ok, sedaId]
                );
            }
        }

        res.json({ success: true, data: result });
    } catch (err) {
        console.error('[SEDA Route] MyKad Extraction Error:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

/**
 * POST /api/v1/seda/verify-meter
 * Verify TNB Meter Photo Clarity
 */
router.post('/api/v1/seda/verify-meter', async (req, res) => {
    const client = await pool.connect();
    try {
        const { fileData, filename, sedaId } = req.body;
        if (!fileData) return res.status(400).json({ success: false, error: 'No file data provided', code: 'MISSING_FILE_DATA' });
        const fileCheck = validateExtractionPayload(fileData, {
            label: 'TNB Meter Photo',
            allowed: ['image/*'],
            maxBytes: 12 * 1024 * 1024
        });
        if (!fileCheck.ok) return res.status(fileCheck.status).json(fileCheck.payload);
        const { mimeType, buffer } = fileCheck;

        const result = await extractionService.verifyTnbMeter(buffer, mimeType);

        if (sedaId) {
            const statusText = result.is_clear ? 'PASSED CHECK' : 'BLURRY/UNCLEAR';
            const logEntry = `\n[${new Date().toISOString().split('T')[0]}] TNB METER photo = ${statusText} (${result.remark})`;

            await client.query(
                `UPDATE seda_registration 
                 SET special_remark = COALESCE(special_remark, '') || $1
                 WHERE bubble_id = $2`,
                [logEntry, sedaId]
            );
        }

        res.json({ success: true, data: result });
    } catch (err) {
        console.error('[SEDA Route] Meter Verification Error:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

/**
 * POST /api/v1/seda/verify-ownership
 * Cross-check Ownership document with Applicant Name and Address
 */
router.post('/api/v1/seda/verify-ownership', async (req, res) => {
    const client = await pool.connect();
    try {
        const { fileData, filename, sedaId, context } = req.body;
        if (!fileData) return res.status(400).json({ success: false, error: 'No file data provided', code: 'MISSING_FILE_DATA' });
        const fileCheck = validateExtractionPayload(fileData, {
            label: 'Ownership Document',
            allowed: ['application/pdf', 'image/*'],
            maxBytes: 20 * 1024 * 1024
        });
        if (!fileCheck.ok) return res.status(fileCheck.status).json(fileCheck.payload);
        const { mimeType, buffer } = fileCheck;

        const result = await extractionService.verifyOwnership(buffer, mimeType, context || { name: 'Unknown', address: 'Unknown' });

        if (sedaId) {
            const statusText = (result.name_match && result.address_match) ? 'PASSED CHECK' : 'MATCH FAILED';
            const logEntry = `\n[${new Date().toISOString().split('T')[0]}] OWNERSHIP Doc = ${statusText} (Owner: ${result.owner_name})`;

            await client.query(
                `UPDATE seda_registration 
                 SET special_remark = COALESCE(special_remark, '') || $1,
    check_ownership = $2
                 WHERE bubble_id = $3`,
                [logEntry, (result.name_match && result.address_match), sedaId]
            );
        }

        res.json({ success: true, data: result });
    } catch (err) {
        console.error('[SEDA Route] Ownership Verification Error:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

// --- PARAMETERIZED ROUTES ---

/**
 * GET /api/v1/seda/:id
 * Get SEDA Registration details + Linked Customer
 */
router.get('/api/v1/seda/:id', async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
        const result = await client.query('SELECT * FROM seda_registration WHERE bubble_id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Registration not found' });
        }

        const seda = result.rows[0];
        if (!seda.reg_status && seda.mapper_status) {
            seda.reg_status = seda.mapper_status;
        }
        let customer = {};

        if (seda.linked_customer) {
            const custRes = await client.query(
                'SELECT name, phone, email, address, city, state, postcode FROM customer WHERE customer_id = $1',
                [seda.linked_customer]
            );
            if (custRes.rows.length > 0) {
                customer = custRes.rows[0];
            }
        }

        // Fetch invoice details for signature status and share link
        let invoice = null;
        if (seda.linked_invoice && seda.linked_invoice.length > 0) {
            const invRes = await client.query(
                'SELECT bubble_id, customer_signature, share_token, invoice_number FROM invoice WHERE bubble_id = $1',
                [seda.linked_invoice[0]]
            );
            if (invRes.rows.length > 0) {
                invoice = invRes.rows[0];
            }
        }

        res.json({
            success: true,
            data: {
                ...seda,
                customer_profile: customer, // Attach customer data
                invoice_details: invoice
            }
        });
    } catch (err) {
        console.error('Error fetching SEDA registration:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

/**
 * POST /api/v1/seda/:id
 * Update SEDA Registration
 */
router.post('/api/v1/seda/:id', async (req, res) => {
    const { id } = req.params;
    const {
        installation_address, city, state, postcode, tnb_account_no, phase_type,
        e_contact_name, e_contact_relationship, e_contact_no, e_contact_mykad,
        ic_no, email, e_email,
        // Files (Base64)
        mykad_front, mykad_back, mykad_pdf,
        tnb_bill_1, tnb_bill_2, tnb_bill_3,
        property_proof, tnb_meter
    } = req.body;

    const client = await pool.connect();
    try {
        // Storage setup
        const storageRoot = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '../storage');
        const uploadDir = path.join(storageRoot, 'seda_registration');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const fileFieldPayloads = {
            mykad_front,
            mykad_back,
            mykad_pdf,
            tnb_bill_1,
            tnb_bill_2,
            tnb_bill_3,
            property_proof,
            tnb_meter
        };

        const fileFieldPrefixes = {
            mykad_front: 'mykad_front',
            mykad_back: 'mykad_back',
            mykad_pdf: 'mykad_pdf',
            tnb_bill_1: 'tnb_bill_1',
            tnb_bill_2: 'tnb_bill_2',
            tnb_bill_3: 'tnb_bill_3',
            property_proof: 'property_proof',
            tnb_meter: 'tnb_meter'
        };

        const fileErrors = [];
        const fileUrls = {};
        for (const [field, inputValue] of Object.entries(fileFieldPayloads)) {
            const check = validateSingleFileField(field, inputValue);
            if (check.state === 'error') {
                fileErrors.push(check.error);
                continue;
            }
            fileUrls[field] = persistValidatedFile(req, uploadDir, id, fileFieldPrefixes[field], check);
        }

        if (fileErrors.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'File validation failed.',
                code: 'FILE_VALIDATION_FAILED',
                details: fileErrors
            });
        }

        const url_mykad_front = fileUrls.mykad_front;
        const url_mykad_back = fileUrls.mykad_back;
        const url_mykad_pdf = fileUrls.mykad_pdf;
        const url_tnb_1 = fileUrls.tnb_bill_1;
        const url_tnb_2 = fileUrls.tnb_bill_2;
        const url_tnb_3 = fileUrls.tnb_bill_3;
        const url_property_proof = fileUrls.property_proof;
        const url_tnb_meter = fileUrls.tnb_meter;

        // Update DB
        await client.query(
            `UPDATE seda_registration 
             SET installation_address = COALESCE($1, installation_address),
    city = COALESCE($2, city),
    state = COALESCE($3, state),
    postcode = COALESCE($4, postcode),
    tnb_account_no = COALESCE($5, tnb_account_no),
    phase_type = COALESCE($6, phase_type),
    e_contact_name = COALESCE($7, e_contact_name),
    e_contact_relationship = COALESCE($8, e_contact_relationship),
    e_contact_no = COALESCE($9, e_contact_no),
    e_contact_mykad = COALESCE($10, e_contact_mykad),
    ic_no = COALESCE($11, ic_no),
    email = COALESCE($12, email),
    e_email = COALESCE($13, e_email),
    ic_copy_front = CASE WHEN $14 = '${KEEP_FILE_VALUE}' THEN ic_copy_front ELSE $14 END,
        ic_copy_back = CASE WHEN $15 = '${KEEP_FILE_VALUE}' THEN ic_copy_back ELSE $15 END,
            mykad_pdf = CASE WHEN $16 = '${KEEP_FILE_VALUE}' THEN mykad_pdf ELSE $16 END,
                tnb_bill_1 = CASE WHEN $17 = '${KEEP_FILE_VALUE}' THEN tnb_bill_1 ELSE $17 END,
                    tnb_bill_2 = CASE WHEN $18 = '${KEEP_FILE_VALUE}' THEN tnb_bill_2 ELSE $18 END,
                        tnb_bill_3 = CASE WHEN $19 = '${KEEP_FILE_VALUE}' THEN tnb_bill_3 ELSE $19 END,
                            property_ownership_prove = CASE WHEN $20 = '${KEEP_FILE_VALUE}' THEN property_ownership_prove ELSE $20 END,
                                tnb_meter = CASE WHEN $21 = '${KEEP_FILE_VALUE}' THEN tnb_meter ELSE $21 END,
                                    modified_date = NOW(),
                                    updated_at = NOW()
             WHERE bubble_id = $22`,
            [
                installation_address, city, state, postcode, tnb_account_no, phase_type,
                e_contact_name, e_contact_relationship, e_contact_no, e_contact_mykad || null, ic_no, email || null, e_email || null,
                url_mykad_front, url_mykad_back, url_mykad_pdf,
                url_tnb_1, url_tnb_2, url_tnb_3,
                url_property_proof, url_tnb_meter,
                id
            ]
        );

        // Update linked customer with IC No and Email if provided
        if (ic_no || email) {
            const sedaRes = await client.query(
                'SELECT linked_customer FROM seda_registration WHERE bubble_id = $1',
                [id]
            );
            if (sedaRes.rows.length > 0 && sedaRes.rows[0].linked_customer) {
                const customerId = sedaRes.rows[0].linked_customer;
                await client.query(
                    `UPDATE customer 
                     SET ic_number = COALESCE($1, ic_number),
    email = COALESCE($2, email),
    updated_at = NOW()
                     WHERE customer_id = $3`,
                    [ic_no || null, email || null, customerId]
                );
            }
        }

        res.json({ success: true, message: 'Saved successfully' });

    } catch (err) {
        console.error('Error saving SEDA:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

/**
 * GET /check-seda
 * Render the Check SEDA page
 */
router.get('/check-seda', requireAuth, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const templatePath = path.join(__dirname, '..', 'public', 'templates', 'check_seda.html');
    res.sendFile(templatePath);
});

/**
 * PROXY ROUTES for SEDA Manager API
 * This avoids CORS issues and keeps the external URL central.
 */
const SEDA_MANAGER_URL = 'https://seda-manager-production.up.railway.app';

router.get('/api/v1/seda-proxy/*', requireAuth, async (req, res) => {
    const subPath = req.params[0];
    const query = new URLSearchParams(req.query).toString();
    const targetUrl = `${SEDA_MANAGER_URL} /api/v1 / ${subPath}${query ? '?' + query : ''} `;

    try {
        const response = await fetch(targetUrl);
        const data = await response.json();
        res.json({ success: true, data });
    } catch (err) {
        console.error('[SEDA Proxy] Error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch from SEDA Manager' });
    }
});

module.exports = router;
