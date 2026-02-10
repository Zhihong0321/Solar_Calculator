const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Pool } = require('pg');
const { requireAuth } = require('../middleware/auth');
const sedaRepo = require('../src/modules/Invoicing/services/sedaRepo');
const extractionService = require('../src/modules/Invoicing/services/extractionService');

// Get database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const router = express.Router();

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

        // Fetch invoice details for signature status and share link
        let invoice = null;
        if (seda.linked_invoice && seda.linked_invoice.length > 0) {
            const invRes = await client.query(
                'SELECT customer_signature, share_token, invoice_number FROM invoice WHERE bubble_id = $1',
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
        e_contact_name, e_contact_relationship, e_contact_no,
        ic_no, email,
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

        // Helper to save file
        const saveFile = (base64String, prefix) => {
            if (!base64String) return null;
            if (base64String.startsWith('http')) return base64String;

            const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const mimeType = matches[1];
                const buffer = Buffer.from(matches[2], 'base64');
                const ext = mimeType === 'application/pdf' ? '.pdf' : '.jpg';
                const filename = `${prefix}_${id}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
                fs.writeFileSync(path.join(uploadDir, filename), buffer);

                const protocol = req.headers['x-forwarded-proto'] || req.protocol;
                const host = req.get('host');
                return `${protocol}://${host}/seda-files/${filename}`;
            }
            return null;
        };

        const processFile = (input, prefix) => {
            if (input === undefined) return undefined;
            if (input === null || input === '') return null;
            return saveFile(input, prefix);
        };

        const url_mykad_front = processFile(mykad_front, 'mykad_front');
        const url_mykad_back = processFile(mykad_back, 'mykad_back');
        const url_mykad_pdf = processFile(mykad_pdf, 'mykad_pdf');
        const url_tnb_1 = processFile(tnb_bill_1, 'tnb_bill_1');
        const url_tnb_2 = processFile(tnb_bill_2, 'tnb_bill_2');
        const url_tnb_3 = processFile(tnb_bill_3, 'tnb_bill_3');
        const url_property_proof = processFile(property_proof, 'property_proof');
        const url_tnb_meter = processFile(tnb_meter, 'tnb_meter');

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
                 ic_no = COALESCE($10, ic_no),
                 ic_copy_front = COALESCE($11, ic_copy_front),
                 ic_copy_back = COALESCE($12, ic_copy_back),
                 mykad_pdf = COALESCE($13, mykad_pdf),
                 tnb_bill_1 = COALESCE($14, tnb_bill_1),
                 tnb_bill_2 = COALESCE($15, tnb_bill_2),
                 tnb_bill_3 = COALESCE($16, tnb_bill_3),
                 property_ownership_prove = COALESCE($17, property_ownership_prove),
                 tnb_meter = COALESCE($18, tnb_meter),
                 modified_date = NOW(),
                 updated_at = NOW()
             WHERE bubble_id = $19`,
            [
                installation_address, city, state, postcode, tnb_account_no, phase_type,
                e_contact_name, e_contact_relationship, e_contact_no, ic_no,
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
        const query = `
            SELECT 
                s.bubble_id,
                s.reg_status,
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
                s.reg_status IS NULL
                OR (
                    s.reg_status NOT ILIKE 'Submitted%'
                    AND s.reg_status NOT ILIKE 'Approved%'
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

        if (reg_status) {
            if (!sedaRepo.SedaStatus.REG.includes(reg_status.toLowerCase())) {
                return res.status(400).json({ 
                    success: false, 
                    error: `Invalid reg_status. Allowed: ${sedaRepo.SedaStatus.REG.join(', ')}` 
                });
            }
            params.push(reg_status);
            updates.push(`reg_status = $${params.length}`);
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
        if (!fileData) return res.status(400).json({ error: 'No file data provided' });

        const matches = fileData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) return res.status(400).json({ error: 'Invalid file format' });
        
        const mimeType = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        
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
        if (!fileData) return res.status(400).json({ error: 'No file data provided' });

        const matches = fileData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) return res.status(400).json({ error: 'Invalid file format' });

        const mimeType = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        
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
                         customer_name = COALESCE($3, customer_name),
                         ic_no = COALESCE($4, ic_no)
                     WHERE bubble_id = $5`,
                    [logEntry, result.quality_ok, result.customer_name, result.mykad_id, sedaId]
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
        if (!fileData) return res.status(400).json({ error: 'No file data provided' });

        const matches = fileData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) return res.status(400).json({ error: 'Invalid file format' });

        const mimeType = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        
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
        if (!fileData) return res.status(400).json({ error: 'No file data provided' });

        const matches = fileData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) return res.status(400).json({ error: 'Invalid file format' });

        const mimeType = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        
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
                'SELECT customer_signature, share_token, invoice_number FROM invoice WHERE bubble_id = $1',
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
        e_contact_name, e_contact_relationship, e_contact_no,
        ic_no, email,
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

        // Helper to save file
        const saveFile = (base64String, prefix) => {
            if (!base64String) return null;
            // Check if it's already a URL (existing file not changed)
            if (base64String.startsWith('http')) return base64String;

            const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const mimeType = matches[1];
                const buffer = Buffer.from(matches[2], 'base64');
                const ext = mimeType === 'application/pdf' ? '.pdf' : '.jpg'; // Simple ext deduction
                const filename = `${prefix}_${id}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
                fs.writeFileSync(path.join(uploadDir, filename), buffer);
                
                // Return URL
                const protocol = req.headers['x-forwarded-proto'] || req.protocol;
                const host = req.get('host');
                return `${protocol}://${host}/seda-files/${filename}`;
            }
            return null;
        };

        // Process Files
        let url_mykad_front, url_mykad_back, url_mykad_pdf;
        let url_tnb_1, url_tnb_2, url_tnb_3;
        let url_property_proof, url_tnb_meter;

        const processFile = (input, prefix) => {
            if (input === undefined) return undefined; // Keep existing
            if (input === null || input === '') return null; // Clear file
            return saveFile(input, prefix); // Save new or return existing URL
        };

        url_mykad_front = processFile(mykad_front, 'mykad_front');
        url_mykad_back = processFile(mykad_back, 'mykad_back');
        url_mykad_pdf = processFile(mykad_pdf, 'mykad_pdf');
        url_tnb_1 = processFile(tnb_bill_1, 'tnb_bill_1');
        url_tnb_2 = processFile(tnb_bill_2, 'tnb_bill_2');
        url_tnb_3 = processFile(tnb_bill_3, 'tnb_bill_3');
        url_property_proof = processFile(property_proof, 'property_proof');
        url_tnb_meter = processFile(tnb_meter, 'tnb_meter');

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
                 ic_no = COALESCE($10, ic_no),
                 ic_copy_front = COALESCE($11, ic_copy_front),
                 ic_copy_back = COALESCE($12, ic_copy_back),
                 mykad_pdf = COALESCE($13, mykad_pdf),
                 tnb_bill_1 = COALESCE($14, tnb_bill_1),
                 tnb_bill_2 = COALESCE($15, tnb_bill_2),
                 tnb_bill_3 = COALESCE($16, tnb_bill_3),
                 property_ownership_prove = COALESCE($17, property_ownership_prove),
                 tnb_meter = COALESCE($18, tnb_meter),
                 modified_date = NOW(),
                 updated_at = NOW()
             WHERE bubble_id = $19`,
            [
                installation_address, city, state, postcode, tnb_account_no, phase_type,
                e_contact_name, e_contact_relationship, e_contact_no, ic_no,
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
    const targetUrl = `${SEDA_MANAGER_URL}/api/v1/${subPath}${query ? '?' + query : ''}`;
    
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