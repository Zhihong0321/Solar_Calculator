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

/**
 * GET /seda-register
 * Render the SEDA Registration Form
 * Query Params: ?id=SEDA_BUBBLE_ID
 */
router.get('/seda-register', requireAuth, (req, res) => {
    // Check if ID is provided
    if (!req.query.id) {
        return res.status(400).send('Missing SEDA Registration ID');
    }
    const templatePath = path.join(__dirname, '..', 'public', 'templates', 'seda_register.html');
    res.sendFile(templatePath);
});

/**
 * GET /api/v1/seda/:id
 * Get SEDA Registration details + Linked Customer
 */
router.get('/api/v1/seda/:id', requireAuth, async (req, res) => {
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

        res.json({ 
            success: true, 
            data: {
                ...seda,
                customer_profile: customer // Attach customer data
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
router.post('/api/v1/seda/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    const { 
        installation_address, city, state, tnb_account_no, phase_type,
        e_contact_name, e_contact_relationship, e_contact_no,
        // Files (Base64)
        mykad_front, mykad_back, mykad_pdf,
        tnb_bill_1, tnb_bill_2, tnb_bill_3
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
        // Only update if a new file is provided (Base64) or keep existing if not (we handle this via COALESCE if undefined, but if passed as null/empty string, we might clear it.
        // For now, let's assume the frontend sends the URL back if unchanged, or null if cleared. 
        // If frontend sends nothing (undefined), COALESCE keeps DB value.
        
        let url_mykad_front, url_mykad_back, url_mykad_pdf;
        let url_tnb_1, url_tnb_2, url_tnb_3;

        // Note: Logic here: 
        // If `mykad_front` is provided (string), try save. If save returns null (e.g. invalid base64), treat as keeping existing if undefined?
        // Let's rely on COALESCE in SQL. We pass `undefined` to SQL params if we want to skip update.
        
        const process = (input, prefix) => {
            if (input === undefined) return undefined; // Keep existing
            if (input === null || input === '') return null; // Clear file
            return saveFile(input, prefix); // Save new or return existing URL
        };

        url_mykad_front = process(mykad_front, 'mykad_front');
        url_mykad_back = process(mykad_back, 'mykad_back');
        url_mykad_pdf = process(mykad_pdf, 'mykad_pdf');
        url_tnb_1 = process(tnb_bill_1, 'tnb_bill_1');
        url_tnb_2 = process(tnb_bill_2, 'tnb_bill_2');
        url_tnb_3 = process(tnb_bill_3, 'tnb_bill_3');

        // Update DB
        await client.query(
            `UPDATE seda_registration 
             SET installation_address = COALESCE($1, installation_address),
                 city = COALESCE($2, city),
                 state = COALESCE($3, state),
                 tnb_account_no = COALESCE($4, tnb_account_no),
                 phase_type = COALESCE($5, phase_type),
                 e_contact_name = COALESCE($6, e_contact_name),
                 e_contact_relationship = COALESCE($7, e_contact_relationship),
                 e_contact_no = COALESCE($8, e_contact_no),
                 ic_copy_front = COALESCE($9, ic_copy_front),
                 ic_copy_back = COALESCE($10, ic_copy_back),
                 mykad_pdf = COALESCE($11, mykad_pdf),
                 tnb_bill_1 = COALESCE($12, tnb_bill_1),
                 tnb_bill_2 = COALESCE($13, tnb_bill_2),
                 tnb_bill_3 = COALESCE($14, tnb_bill_3),
                 modified_date = NOW(),
                 updated_at = NOW()
             WHERE bubble_id = $15`,
            [
                installation_address, city, state, tnb_account_no, phase_type,
                e_contact_name, e_contact_relationship, e_contact_no,
                url_mykad_front, url_mykad_back, url_mykad_pdf,
                url_tnb_1, url_tnb_2, url_tnb_3,
                id
            ]
        );

        res.json({ success: true, message: 'Saved successfully' });

    } catch (err) {
        console.error('Error saving SEDA:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

/**
 * POST /api/v1/seda/extract-tnb
 * Extract data from TNB Bill
 */
router.post('/api/v1/seda/extract-tnb', requireAuth, async (req, res) => {
    try {
        console.log(`[SEDA Route] Extract TNB request received. Payload size: ${JSON.stringify(req.body).length} bytes`);
        const { fileData, filename } = req.body;
        if (!fileData) return res.status(400).json({ error: 'No file data provided' });

        const matches = fileData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            console.error('[SEDA Route] Invalid base64 data format');
            return res.status(400).json({ error: 'Invalid base64 data' });
        }

        console.log(`[SEDA Route] Converting base64 to buffer for file: ${filename}`);
        const buffer = Buffer.from(matches[2], 'base64');
        
        console.log('[SEDA Route] Calling extractionService.extractTnb...');
        const data = await extractionService.extractTnb(buffer, filename || 'tnb_bill.pdf');
        
        console.log('[SEDA Route] Extraction successful');
        res.json({ success: true, data });
    } catch (err) {
        console.error('[SEDA Route] Extraction Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/v1/seda/extract-mykad
 * Extract data from MyKad
 */
router.post('/api/v1/seda/extract-mykad', requireAuth, async (req, res) => {
    try {
        console.log(`[SEDA Route] Extract MyKad request received. Payload size: ${JSON.stringify(req.body).length} bytes`);
        const { fileData, filename } = req.body;
        if (!fileData) return res.status(400).json({ error: 'No file data provided' });

        const matches = fileData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            console.error('[SEDA Route] Invalid base64 data format');
            return res.status(400).json({ error: 'Invalid base64 data' });
        }

        console.log(`[SEDA Route] Converting base64 to buffer for file: ${filename}`);
        const buffer = Buffer.from(matches[2], 'base64');
        
        console.log('[SEDA Route] Calling extractionService.extractMykad...');
        const data = await extractionService.extractMykad(buffer, filename || 'mykad.jpg');
        
        console.log('[SEDA Route] Extraction successful');
        res.json({ success: true, data });
    } catch (err) {
        console.error('[SEDA Route] Extraction Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;