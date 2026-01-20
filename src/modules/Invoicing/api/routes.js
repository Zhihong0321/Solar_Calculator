/**
 * Invoice Routes Module
 * Handles all invoice-related endpoints
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../../../core/database/pool');
const { requireAuth } = require('../../../core/middleware/auth');
const invoiceRepo = require('../services/invoiceRepo');
const invoiceService = require('../services/invoiceService');
const invoiceHtmlGenerator = require('../services/invoiceHtmlGenerator');
const externalPdfService = require('../services/externalPdfService');

const router = express.Router();

/**
 * GET /api/user/me
 * Get current user profile with agent details
 * Protected: Requires authentication
 */
router.get('/api/user/me', requireAuth, async (req, res) => {
    let client = null;
    try {
        const userId = req.user.userId || req.user.id;
        client = await pool.connect();
        
        // Fetch agent details linked to this user
        const query = `
            SELECT a.name, a.contact, u.email
            FROM "user" u
            LEFT JOIN agent a ON u.linked_agent_profile = a.bubble_id
            WHERE u.id::text = $1 OR u.bubble_id = $1
            LIMIT 1
        `;
        const result = await client.query(query, [String(userId)]);
        
        const dbUser = result.rows[0] || {};

        res.json({
            success: true,
            user: {
                ...req.user,
                name: dbUser.name || req.user.name,
                contact: dbUser.contact || req.user.contact,
                email: dbUser.email || req.user.email
            }
        });
    } catch (err) {
        console.error('Error in /api/user/me:', err);
        res.json({
            success: true,
            user: req.user // Fallback to JWT payload
        });
    } finally {
        if (client) client.release();
    }
});

/**
 * GET /api/package/:id
 * Get package details by ID
 */
router.get('/api/package/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const client = await pool.connect();
    try {
      const pkg = await invoiceRepo.getPackageById(client, id);
      if (pkg) {
        res.json({
          success: true,
          package: pkg
        });
      } else {
        res.status(404).json({
          success: false,
          error: `Package with ID '${id}' not found`
        });
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error fetching package:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/vouchers
 * Get list of public active vouchers
 * Protected: Requires authentication
 */
router.get('/api/vouchers', requireAuth, async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      const vouchers = await invoiceRepo.getPublicVouchers(client);
      
      // Filter out expired vouchers if available_until is set
      const now = new Date();
      const validVouchers = vouchers.filter(v => {
        if (!v.available_until) return true;
        
        // Try to parse date
        try {
            const expiryDate = new Date(v.available_until);
            // Check if valid date
            if (isNaN(expiryDate.getTime())) return true; // Keep if invalid date string (assume valid) 
            
            // Set end of day for expiry
            expiryDate.setHours(23, 59, 59, 999);
            return now <= expiryDate;
        } catch (e) {
            return true; // Keep on error
        }
      });

      res.json({
        success: true,
        vouchers: validVouchers
      });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error fetching vouchers:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /create-invoice
 * Invoice creation page - shows form
 * Protected: Requires authentication
 */
router.get('/create-invoice', requireAuth, (req, res) => {
    const templatePath = path.join(__dirname, '../../../../public/templates/create_invoice.html');
    res.sendFile(templatePath);
});

/**
 * GET /edit-invoice
 * Invoice edit page - loads existing invoice for editing
 * Protected: Requires authentication
 */
router.get('/edit-invoice', requireAuth, (req, res) => {
    const templatePath = path.join(__dirname, '../../../../public/templates/edit_invoice.html');
    res.sendFile(templatePath);
});

/**
 * GET /invoice-office
 * Invoice Office dashboard - digital office for a specific invoice
 * Protected: Requires authentication
 */
router.get('/invoice-office', requireAuth, (req, res) => {
    const templatePath = path.join(__dirname, '../../../../public/templates/invoice_office.html');
    res.sendFile(templatePath);
});

/**
 * GET /api/v1/invoice-office/:bubbleId
 * Aggregate all data for the Invoice Office dashboard
 * Protected: Requires authentication
 */
router.get('/api/v1/invoice-office/:bubbleId', requireAuth, async (req, res) => {
    let client = null;
    try {
        const { bubbleId } = req.params;
        const userId = req.user.userId;

        client = await pool.connect();
        
        // 1. Fetch Invoice with Live Joins
        const invoice = await invoiceRepo.getInvoiceByBubbleId(client, bubbleId);

        if (!invoice) {
            return res.status(404).json({ success: false, error: 'Invoice not found' });
        }

        // Security check: Match User ID, Creator ID, OR Linked Agent
        const isOwner = await invoiceRepo.verifyOwnership(client, userId, invoice.created_by, invoice.linked_agent);
        if (!isOwner) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        // 2. Fetch Payments (Combine submitted_payment AND legacy/synced payment)
        const [submittedRes, legacyRes] = await Promise.all([
            client.query(
                'SELECT * FROM submitted_payment WHERE linked_invoice = $1 ORDER BY created_at DESC',
                [bubbleId]
            ),
            client.query(
                'SELECT * FROM payment WHERE linked_invoice = $1 ORDER BY created_at DESC',
                [bubbleId]
            )
        ]);

        // Map legacy payments to match structure and set status='verified'
        const legacyPayments = legacyRes.rows.map(p => ({
            ...p,
            status: 'verified', // Synced payments are considered verified
            attachment: p.attachment || [] // Ensure array
        }));

        const allPayments = [...submittedRes.rows, ...legacyPayments];

        // Calculate total paid amount (verified only)
        const paidAmount = allPayments
            .filter(p => p.status === 'verified')
            .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        
        // Attach to invoice object for frontend
        invoice.paid_amount = paidAmount;

        // 3. Fetch Items (Enhanced Retrieval)
        // We fetch items that point to this invoice OR are in the invoice's linked_invoice_item array
        const itemIds = Array.isArray(invoice.linked_invoice_item) ? invoice.linked_invoice_item : [];
        const itemsRes = await client.query(
            `SELECT 
                ii.bubble_id,
                ii.linked_invoice as invoice_id,
                ii.description,
                ii.qty,
                ii.unit_price,
                ii.amount as total_price,
                ii.inv_item_type as item_type,
                ii.sort as sort_order,
                ii.created_at,
                ii.is_a_package,
                ii.linked_package as product_id,
                COALESCE(pkg.package_name, INITCAP(REPLACE(ii.inv_item_type, '_', ' ')), 'Item') as product_name_snapshot
             FROM invoice_item ii
             LEFT JOIN package pkg ON ii.linked_package = pkg.bubble_id
             WHERE ii.linked_invoice = $1 
                OR ii.bubble_id = ANY($2::text[])
             ORDER BY ii.sort ASC, ii.created_at ASC`,
            [bubbleId, itemIds]
        );

        // 4. Fetch SEDA Registration
        let seda = null;
        if (invoice.linked_seda_registration) {
            const sedaRes = await client.query(
                'SELECT * FROM seda_registration WHERE bubble_id = $1',
                [invoice.linked_seda_registration]
            );
            seda = sedaRes.rows[0];
        }

        // FALLBACK: If not found via direct link, check if any SEDA record points to this invoice
        if (!seda) {
            const fallbackSedaRes = await client.query(
                'SELECT * FROM seda_registration WHERE $1 = ANY(linked_invoice) LIMIT 1',
                [bubbleId]
            );
            seda = fallbackSedaRes.rows[0];
            
            // If we found it via fallback, we should ideally update the invoice record 
            // so future loads are faster, but for now we just return it to fix the UI.
            if (seda) {
                invoice.linked_seda_registration = seda.bubble_id;
            }
        }

        res.json({
            success: true,
            data: {
                invoice,
                payments: allPayments,
                items: itemsRes.rows,
                seda
            }
        });
    } catch (err) {
        console.error('Error fetching invoice office data:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * POST /api/v1/invoice-office/:bubbleId/roof-images
 * Batch upload roof images (Base64)
 * Protected: Requires authentication
 */
router.post('/api/v1/invoice-office/:bubbleId/roof-images', requireAuth, async (req, res) => {
    const { bubbleId } = req.params;
    const { images } = req.body; // Array of { name, data (base64) }
    const userId = req.user.userId;

    if (!images || !Array.isArray(images)) {
        return res.status(400).json({ success: false, error: 'No images provided' });
    }

    let client = null;
    try {
        client = await pool.connect();
        
        // Ownership check
        const invCheck = await client.query('SELECT created_by, linked_roof_image FROM invoice WHERE bubble_id = $1', [bubbleId]);
        if (invCheck.rows.length === 0) return res.status(404).json({ success: false, error: 'Invoice not found' });
        
        const isOwner = await invoiceRepo.verifyOwnership(client, userId, invCheck.rows[0].created_by);
        if (!isOwner) return res.status(403).json({ success: false, error: 'Unauthorized' });

        const storageRoot = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '../../../../storage');
        const uploadDir = path.join(storageRoot, 'roof_images');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        const uploadedUrls = [];
        const MAX_SIZE = 1.5 * 1024 * 1024; // 1.5MB

        for (const img of images) {
            const matches = img.data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) continue;

            const buffer = Buffer.from(matches[2], 'base64');
            if (buffer.length > MAX_SIZE) {
                console.warn(`File ${img.name} skipped: Too large (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
                continue;
            }

            const fileExt = img.name ? path.extname(img.name) : '.jpg';
            const filename = `roof_${bubbleId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${fileExt}`;
            const filePath = path.join(uploadDir, filename);
            fs.writeFileSync(filePath, buffer);

            const protocol = req.headers['x-forwarded-proto'] || req.protocol;
            const host = req.get('host');
            const url = `${protocol}://${host}/uploads/roof_images/${filename}`;
            uploadedUrls.push(url);
        }

        if (uploadedUrls.length > 0) {
            // Update Postgres array
            await client.query(
                'UPDATE invoice SET linked_roof_image = array_cat(COALESCE(linked_roof_image, ARRAY[]::text[]), $1), updated_at = NOW() WHERE bubble_id = $2',
                [uploadedUrls, bubbleId]
            );
        }

        res.json({ success: true, uploadedCount: uploadedUrls.length, urls: uploadedUrls });

    } catch (err) {
        console.error('Roof image upload error:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * DELETE /api/v1/invoice-office/:bubbleId/roof-image
 * Remove a roof image reference
 * Protected: Requires authentication
 */
router.delete('/api/v1/invoice-office/:bubbleId/roof-image', requireAuth, async (req, res) => {
    const { bubbleId } = req.params;
    const { url } = req.body;
    const userId = req.user.userId;

    if (!url) return res.status(400).json({ success: false, error: 'URL required' });

    let client = null;
    try {
        client = await pool.connect();
        
        // Ownership check
        const invCheck = await client.query('SELECT created_by FROM invoice WHERE bubble_id = $1', [bubbleId]);
        if (invCheck.rows.length === 0) return res.status(404).json({ success: false, error: 'Invoice not found' });
        
        const isOwner = await invoiceRepo.verifyOwnership(client, userId, invCheck.rows[0].created_by);
        if (!isOwner) return res.status(403).json({ success: false, error: 'Unauthorized' });

        await client.query(
            'UPDATE invoice SET linked_roof_image = array_remove(linked_roof_image, $1), updated_at = NOW() WHERE bubble_id = $2',
            [url, bubbleId]
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * GET /my-invoice
 * User's invoice management page - DIRECT POSTGRESQL ACCESS
 * Protected: Requires authentication
 */
router.get('/my-invoice', requireAuth, (req, res) => {
  const templatePath = path.join(__dirname, '../../../../public/templates/my_invoice.html');
  res.sendFile(templatePath, (err) => {
    if (err) {
      console.error('Error serving my-invoice page:', err);
      res.status(500).send('Error loading page');
    }
  });
});

/**
 * GET /api/v1/invoices/my-invoices
 * Get all invoices created by the logged-in user - DIRECT POSTGRESQL QUERY
 * Protected: Requires authentication
 */
router.get('/api/v1/invoices/my-invoices', requireAuth, async (req, res) => {
  let client = null;
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication failed'
      });
    }

    const userId = req.user.userId;
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const status = req.query.status;
    const includeDeleted = req.query.include_deleted === 'true';
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const paymentStatus = req.query.paymentStatus;

    console.log('[MY-INVOICES API] userId from JWT:', userId, 'type:', typeof userId);

    // DIRECT POSTGRESQL QUERY - No external API calls
    client = await pool.connect();
    const result = await invoiceRepo.getInvoicesByUserId(client, userId, { 
        limit, offset, status, includeDeleted, startDate, endDate, paymentStatus 
    });
    
    console.log('[MY-INVOICES API] Found', result.invoices.length, 'invoices out of', result.total, 'total');

    // Build URLs
    const protocol = req.protocol;
    const host = req.get('host');
    const invoices = result.invoices.map(inv => ({
      ...inv,
      share_url: inv.share_token && inv.share_enabled ? `${protocol}://${host}/view/${inv.share_token}` : null,
      pdf_url: inv.share_token && inv.share_enabled ? `${protocol}://${host}/view/${inv.share_token}/pdf` : null
    }));

    res.json({
      success: true,
      data: {
        invoices,
        total: result.total,
        limit: result.limit,
        offset: result.offset
      }
    });
  } catch (err) {
    console.error('Error fetching user invoices:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch invoices'
    });
  } finally {
    if (client) client.release();
  }
});

/**
 * DELETE /api/v1/invoices/:bubbleId
 * Soft delete an invoice (status='deleted', approved_toberemove=true)
 * Protected: Requires authentication and ownership
 */
router.delete('/api/v1/invoices/:bubbleId', requireAuth, async (req, res) => {
    let client = null;
    try {
        const { bubbleId } = req.params;
        const userId = req.user.userId;

        client = await pool.connect();
        
        // Ownership check
        const invCheck = await client.query('SELECT created_by, linked_agent FROM invoice WHERE bubble_id = $1', [bubbleId]);
        if (invCheck.rows.length === 0) return res.status(404).json({ success: false, error: 'Invoice not found' });
        
        // Ensure user owns or is assigned to the invoice
        const isOwner = await invoiceRepo.verifyOwnership(client, userId, invCheck.rows[0].created_by, invCheck.rows[0].linked_agent);
        if (!isOwner) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        // Soft Delete
        await client.query(
            "UPDATE invoice SET status = 'deleted', approved_toberemove = true, updated_at = NOW() WHERE bubble_id = $1",
            [bubbleId]
        );

        // Log Action
        await invoiceRepo.logInvoiceAction(client, bubbleId, 'INVOICE_DELETED', String(userId), { description: 'Soft deleted by user' });

        res.json({ success: true, message: 'Invoice deleted successfully' });

    } catch (err) {
        console.error('Error deleting invoice:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * GET /api/v1/invoices/:bubbleId
 * Get single invoice details with items
 * Protected: Requires authentication
 */
router.get('/api/v1/invoices/:bubbleId', requireAuth, async (req, res) => {
  let client = null;
  try {
    const { bubbleId } = req.params;
    const userId = req.user.userId;

    client = await pool.connect();
    const invoice = await invoiceRepo.getInvoiceByBubbleId(client, bubbleId);

    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    // Security: Check ownership or assigned agent
    const isOwner = await invoiceRepo.verifyOwnership(client, userId, invoice.created_by, invoice.linked_agent);
    if (!isOwner) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, data: invoice });
  } catch (err) {
    console.error('Error fetching single invoice:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * POST /api/v1/invoices/on-the-fly
 * Create invoice on the fly and return shareable link
 * Protected: Requires authentication - only registered users can create invoices
 */
router.post('/api/v1/invoices/on-the-fly', requireAuth, async (req, res) => {
  try {
    // Validate user is authenticated (requireAuth ensures this, but double-check userId exists)
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication failed: User ID not found. Please login again.'
      });
    }

    const userId = req.user.userId;
    console.log('[API] Creating invoice. Body:', JSON.stringify(req.body));
    const {
      linked_package,
      discount_fixed,
      discount_percent,
      discount_given,
      apply_sst,
      template_id,
      voucher_code,
      voucher_codes,
      agent_markup,
      customer_name,
      customer_phone,
      customer_address,
      epp_fee_amount,
      epp_fee_description,
      payment_structure,
      extra_items
    } = req.body;

    // Create invoice with userId
    const result = await invoiceService.createInvoice(pool, {
      userId: userId,
      packageId: linked_package,
      discountFixed: discount_fixed,
      discountPercent: discount_percent,
      discountGiven: discount_given,
      applySst: apply_sst || false,
      templateId: template_id,
      voucherCode: voucher_code,
      voucherCodes: voucher_codes,
      agentMarkup: agent_markup,
      customerName: customer_name,
      customerPhone: customer_phone,
      customerAddress: customer_address,
      eppFeeAmount: epp_fee_amount,
      eppFeeDescription: epp_fee_description,
      paymentStructure: payment_structure,
      extraItems: extra_items
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    // Build share URL
    const protocol = req.protocol;
    const host = req.get('host');
    const shareUrl = `${protocol}://${host}/view/${result.data.shareToken}`;

    res.json({
      success: true,
      invoice_link: shareUrl,
      invoice_number: result.data.invoiceNumber,
      bubble_id: result.data.bubbleId,
      total_amount: result.data.totalAmount
    });
  } catch (err) {
    console.error('Error in /api/v1/invoices/on-the-fly route:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to create invoice: ' + err.message
    });
  }
});

/**
 * POST /api/v1/invoices/:bubbleId/version
 * Create a new version of an existing invoice
 * Protected: Requires authentication
 */
router.post('/api/v1/invoices/:bubbleId/version', requireAuth, async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication failed'
      });
    }

    const { bubbleId } = req.params;
    const userId = req.user.userId;
    console.log('[API] Creating version for:', bubbleId, 'Body:', JSON.stringify(req.body));
    
    // Extract editable fields
    const {
      discount_fixed,
      discount_percent,
      discount_given,
      apply_sst,
      voucher_code,
      voucher_codes,
      agent_markup,
      epp_fee_amount,
      epp_fee_description,
      payment_structure,
      extra_items,
      // We can also allow updating customer details if needed
      customer_name,
      customer_phone,
      customer_address
    } = req.body;

    const result = await invoiceService.createInvoiceVersion(pool, bubbleId, {
      userId: userId,
      discountFixed: discount_fixed,
      discountPercent: discount_percent,
      discountGiven: discount_given,
      applySst: apply_sst,
      voucherCode: voucher_code,
      voucherCodes: voucher_codes,
      agentMarkup: agent_markup,
      eppFeeAmount: epp_fee_amount,
      eppFeeDescription: epp_fee_description,
      paymentStructure: payment_structure,
      extraItems: extra_items,
      customerName: customer_name,
      customerPhone: customer_phone,
      customerAddress: customer_address
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    // Build share URL
    const protocol = req.protocol;
    const host = req.get('host');
    const shareUrl = `${protocol}://${host}/view/${result.data.shareToken}`;

    res.json({
      success: true,
      invoice_link: shareUrl,
      invoice_number: result.data.invoiceNumber,
      bubble_id: result.data.bubbleId,
      total_amount: result.data.totalAmount
    });

  } catch (err) {
    console.error('Error creating invoice version:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to update invoice: ' + err.message
    });
  }
});

// GET /submit-payment
// Serve the submit payment page
router.get('/submit-payment', (req, res) => {
    res.sendFile(path.join(__dirname, '../../../../public/templates/submit_payment.html'));
});

/**
 * POST /api/v1/invoices/:bubbleId/payment
 * Submit payment details
 */
 router.post('/api/v1/invoices/:bubbleId/payment', requireAuth, async (req, res) => {
    const { bubbleId } = req.params;
    const { method, date, referenceNo, notes, proof, epp, paymentBank, paymentId } = req.body;
    const userId = req.user.userId; // Fixed: Matches jwt payload structure

    if (!method || !date) {
        return res.status(400).json({ success: false, error: 'Payment method and date are required.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Verify invoice exists
        const invoiceCheck = await client.query(
            'SELECT * FROM invoice WHERE bubble_id = $1',
            [bubbleId]
        );

        if (invoiceCheck.rows.length === 0) {
            throw new Error('Invoice not found');
        }
        const invoice = invoiceCheck.rows[0];

        // 2. Fetch User's Linked Agent
        const userCheck = await client.query('SELECT linked_agent_profile FROM "user" WHERE id = $1', [userId]);

        let linkedAgent = null;
        if (userCheck.rows.length > 0) {
            linkedAgent = userCheck.rows[0].linked_agent_profile;
        }

        // Use linked_customer from invoice directly as it is the Bubble ID
        let linkedCustomerBubbleId = invoice.linked_customer;

        // Map Method to Standard Strings
        let standardMethod = 'CASH';
        if (method === 'credit_card') standardMethod = 'CREDIT CARD';
        if (method === 'epp') standardMethod = 'EPP';

        // Prepare Remark
        const remark = `${notes || ''} [Ref: ${referenceNo || 'N/A'}]`.trim();

        // Handle Proof File Upload (Save to Disk)
        let attachmentUrl = null;
        if (proof && proof.data) {
            try {
                const storageRoot = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '../../../../storage');
                const uploadDir = path.join(storageRoot, 'uploaded_payment');
                
                if (!fs.existsSync(uploadDir)) {
                    fs.mkdirSync(uploadDir, { recursive: true });
                }

                const matches = proof.data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                if (matches && matches.length === 3) {
                    const fileExt = proof.name ? path.extname(proof.name) : '.jpg';
                    const buffer = Buffer.from(matches[2], 'base64');
                    const filename = `payment_${bubbleId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${fileExt}`;
                    const filePath = path.join(uploadDir, filename);
                    fs.writeFileSync(filePath, buffer);
                    
                    // Generate Full Absolute URL
                    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
                    const host = req.get('host');
                    attachmentUrl = `${protocol}://${host}/uploads/uploaded_payment/${filename}`;
                }
            } catch (fileErr) {
                console.error('[Payment] File save error:', fileErr);
                throw new Error('Failed to save proof of payment file.');
            }
        }

        // UPDATE or INSERT
        if (paymentId) {
            // Update Existing Payment
            if (attachmentUrl) {
                // If new file, update it
                await client.query(
                    `UPDATE submitted_payment 
                     SET payment_method = $1, payment_method_v2 = $1, amount = $2, payment_date = $3, 
                         remark = $4, issuer_bank = $5, epp_month = $6, epp_type = $7,
                         attachment = $8, modified_date = NOW(), updated_at = NOW()
                     WHERE bubble_id = $9 AND created_by = $10`,
                    [
                        standardMethod,
                        invoice.total_amount,
                        date,
                        remark,
                        paymentBank || (epp ? epp.bank : null),
                        epp ? parseInt(epp.tenure) : null,
                        epp ? 'EPP' : null,
                        [attachmentUrl], // New file URL
                        paymentId,
                        String(userId)
                    ]
                );
            } else {
                // No new file, keep existing
                await client.query(
                    `UPDATE submitted_payment 
                     SET payment_method = $1, payment_method_v2 = $1, amount = $2, payment_date = $3, 
                         remark = $4, issuer_bank = $5, epp_month = $6, epp_type = $7,
                         modified_date = NOW(), updated_at = NOW()
                     WHERE bubble_id = $8 AND created_by = $9`,
                    [
                        standardMethod,
                        invoice.total_amount,
                        date,
                        remark,
                        paymentBank || (epp ? epp.bank : null),
                        epp ? parseInt(epp.tenure) : null,
                        epp ? 'EPP' : null,
                        paymentId,
                        String(userId)
                    ]
                );
            }

            // Log Action
            await invoiceRepo.logInvoiceAction(client, bubbleId, 'PAYMENT_UPDATED', String(userId), {
                paymentId, amount: invoice.total_amount, method: standardMethod
            });

        } else {
            // Insert New Payment
            const newPaymentId = `pay_${crypto.randomBytes(8).toString('hex')}`;
            const attachmentData = attachmentUrl ? [attachmentUrl] : null;

            await client.query(
                `INSERT INTO submitted_payment 
                (
                    bubble_id, 
                    created_at, updated_at, created_date, modified_date,
                    payment_method, payment_method_v2,
                    amount, 
                    payment_date, 
                    linked_invoice, linked_customer, linked_agent, created_by,
                    remark, 
                    issuer_bank, epp_month, epp_type,
                    attachment,
                    terminal,
                    status
                )
                VALUES ($1, NOW(), NOW(), NOW(), NOW(), $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending')`,
                [
                    newPaymentId,
                    standardMethod,
                    invoice.total_amount,
                    date,
                    bubbleId,
                    linkedCustomerBubbleId,
                    linkedAgent,
                    String(userId),
                    remark,
                    paymentBank || (epp ? epp.bank : null),
                    epp ? parseInt(epp.tenure) : null,
                    epp ? 'EPP' : null,
                    attachmentData,
                    null
                ]
            );

            // Update Invoice Status only on new creation
            await client.query(
                "UPDATE invoice SET status = 'payment_submitted', updated_at = NOW() WHERE bubble_id = $1",
                [bubbleId]
            );

            // Log Action
            await invoiceRepo.logInvoiceAction(client, bubbleId, 'PAYMENT_SUBMITTED', String(userId), {
                paymentId: newPaymentId, amount: invoice.total_amount, method: standardMethod
            });
        }

        await client.query('COMMIT');
        res.json({ success: true, message: paymentId ? 'Payment updated successfully' : 'Payment submitted successfully' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Payment submission error:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});
// GET /api/v1/invoices/:bubbleId/history
router.get('/api/v1/invoices/:bubbleId/history', requireAuth, async (req, res) => {
  let client = null;
  try {
    const { bubbleId } = req.params;
    client = await pool.connect();
    
    const invoice = await invoiceRepo.getInvoiceByBubbleId(client, bubbleId);
    if (!invoice) {
        return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    
    // Security check: match Creator OR Linked Agent
    const isOwner = await invoiceRepo.verifyOwnership(client, req.user.userId, invoice.created_by, invoice.linked_agent);
    if (!isOwner) {
        return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const history = await invoiceRepo.getInvoiceHistory(client, bubbleId);
    
    res.json({
      success: true,
      data: history
    });
  } catch (err) {
    console.error('Error fetching invoice history:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * GET /api/v1/invoices/actions/:actionId/snapshot
 * View invoice snapshot from history
 * Protected: Requires authentication
 */
router.get('/api/v1/invoices/actions/:actionId/snapshot', requireAuth, async (req, res) => {
  let client = null;
  try {
    const { actionId } = req.params;
    client = await pool.connect();

    const action = await invoiceRepo.getInvoiceActionById(client, actionId);
    if (!action) {
      return res.status(404).send('Action record not found');
    }

    // Check ownership of the created_by on the action OR the linked invoice
    const isOwner = await invoiceRepo.verifyOwnership(client, req.user.userId, action.created_by);
    if (!isOwner) {
         return res.status(403).send('Access denied');
    }

    const details = action.details || {};
    const invoiceSnapshot = details.snapshot;

    if (!invoiceSnapshot) {
      return res.status(404).send('No snapshot available for this action');
    }

    // Determine output format
    const accept = req.get('accept') || '';
    const wantsJSON = accept.includes('application/json');

    if (wantsJSON) {
      return res.json({ success: true, data: invoiceSnapshot });
    }

    // Render HTML
    let template = invoiceSnapshot.template;
    if (!template) {
        template = await invoiceRepo.getDefaultTemplate(client);
    }

    const html = invoiceHtmlGenerator.generateInvoiceHtmlSync(invoiceSnapshot, template);
    res.header('Content-Type', 'text/html; charset=utf-8');
    res.send(html);

  } catch (err) {
    console.error('Error fetching invoice snapshot:', err);
    res.status(500).send('Error loading snapshot');
  } finally {
    if (client) client.release();
  }
});

/**
 * GET /view/:tokenOrId
 * Public invoice view via share link OR Bubble ID (HTML for browsers, JSON for others)
 */
router.get('/view/:tokenOrId', async (req, res) => {
  try {
    const { tokenOrId } = req.params;

    // Get invoice by share token OR bubble_id
    const client = await pool.connect();
    let invoice = null;
    try {
      invoice = await invoiceRepo.getPublicInvoice(client, tokenOrId);
    } finally {
      client.release();
    }

    if (!invoice) {
      return res.status(404).send(`
        <html>
        <head><title>Invoice Not Found</title>
        <script src="https://cdn.tailwindcss.com"></script></head>
        <body class="p-8 bg-gray-100">
          <div class="max-w-2xl mx-auto bg-white rounded-lg shadow p-6 text-center">
            <h1 class="text-2xl font-bold text-red-600 mb-4">❌ Invoice Not Found</h1>
            <p class="text-gray-700">The invoice you're looking for doesn't exist, is invalid, or has expired.</p>
            <p class="text-gray-600 text-sm mt-2">ID/Token: ${tokenOrId}</p>
          </div>
        </body>
        </html>
      `);
    }

    // Record view
    const recordClient = await pool.connect();
    try {
      await invoiceRepo.recordInvoiceView(recordClient, invoice.bubble_id);
    } finally {
      recordClient.release();
    }

    // Allow Embedding (remove X-Frame-Options if set, though Express default is usually open)
    res.removeHeader('X-Frame-Options');

    const accept = req.get('accept') || '';
    const wantsJSON = accept.includes('application/json') && !accept.includes('text/html');
    
    if (wantsJSON) {
      const protocol = req.protocol;
      const host = req.get('host');
      // Prefer share_token for the canonical link if available
      const linkId = invoice.share_token || invoice.bubble_id;
      const shareUrl = `${protocol}://${host}/view/${linkId}`;
      
      res.json({
        success: true,
        invoice_link: shareUrl,
        invoice_number: invoice.invoice_number,
        bubble_id: invoice.bubble_id,
        share_token: invoice.share_token,
        total_amount: invoice.total_amount,
        status: invoice.status,
        date: invoice.invoice_date,
        customer_name: invoice.customer_name,
        // Include minimal details useful for previews
        items_count: invoice.items ? invoice.items.length : 0
      });
    } else {
      try {
        const html = invoiceHtmlGenerator.generateInvoiceHtmlSync(invoice, invoice.template);
        res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.header('Pragma', 'no-cache');
        res.header('Expires', '0');
        res.header('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
      } catch (err) {
        console.error('Error generating HTML:', err);
        res.status(500).send(`
          <html>
          <head><title>Error</title></head>
          <body style="font-family: sans-serif; padding: 2rem;">
            <h1>Error Loading Invoice</h1>
            <p>Failed to generate invoice HTML: ${err.message}</p>
          </body>
          </html>
        `);
      }
    }
  } catch (err) {
    console.error('Error in /view/:tokenOrId route:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to load invoice: ' + err.message
    });
  }
});

/**
 * GET /view/:tokenOrId/pdf
 * Generate PDF and return download URL (JSON response)
 */
router.get('/view/:tokenOrId/pdf', async (req, res) => {
  try {
    const { tokenOrId } = req.params;
    const client = await pool.connect();
    let invoice = null;
    try {
      invoice = await invoiceRepo.getPublicInvoice(client, tokenOrId);
    } finally {
      client.release();
    }

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found or has expired'
      });
    }

    const html = invoiceHtmlGenerator.generateInvoiceHtml(invoice, invoice.template, { forPdf: true });
    const pdfResult = await externalPdfService.generatePdfWithRetry(html, {
      format: 'A4',
      printBackground: true,
      margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' }
    }, 'https://calculator.atap.solar');

    return res.json({
      success: true,
      pdfId: pdfResult.pdfId,
      downloadUrl: pdfResult.downloadUrl,
      expiresAt: pdfResult.expiresAt
    });

  } catch (err) {
    console.error('Error in /view/:tokenOrId/pdf route:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to generate PDF'
    });
  }
});

/**
 * Helper to generate Proposal HTML
 */
async function generateProposalHtml(client, invoice, req, forPdf = false) {
    let createdBy = 'System';
    if (invoice.created_by) {
      try {
        const userResult = await client.query(
            `SELECT a.name 
             FROM "user" u 
             JOIN agent a ON u.linked_agent_profile = a.bubble_id 
             WHERE u.bubble_id = $1 
             LIMIT 1`,
            [invoice.created_by]
        );
        if (userResult.rows.length > 0) {
            createdBy = userResult.rows[0].name;
        }
      } catch (err) {
        console.warn('Could not fetch user name for proposal:', err.message);
      }
    }

    const templatePath = path.join(__dirname, '../../../../portable-proposal/index.html');
    let proposalHtml = fs.readFileSync(templatePath, 'utf8');

    const customerName = invoice.customer_name || 'Valued Customer';
    const customerAddress = invoice.customer_address || 'Malaysia';
    const systemSize = invoice.system_size_kwp
      ? `${invoice.system_size_kwp.toFixed(1)} kWp System`
      : 'Solar System';

    const templateData = invoice.template || {};
    const companyName = templateData.company_name || 'Atap Solar';
    const companyAddress = templateData.company_address || '';
    const companyPhone = templateData.company_phone || '';
    const companyEmail = templateData.company_email || '';
    const bankName = templateData.bank_name || '';
    const bankAccountNo = templateData.bank_account_no || '';
    const bankAccountName = templateData.bank_account_name || '';
    const termsAndConditions = templateData.terms_and_conditions || '';
    const items = invoice.items || [];

    const subtotal = parseFloat(invoice.subtotal) || 0;
    const sstAmount = parseFloat(invoice.sst_amount) || 0;
    const totalAmount = parseFloat(invoice.total_amount) || 0;
    const sstRate = parseFloat(invoice.sst_rate) || 0;

    let itemsHtml = '';
    items.forEach(item => {
      const isDiscount = item.item_type === 'discount' || item.item_type === 'voucher';
      const priceClass = isDiscount ? 'text-red-600' : 'text-slate-900';
      const displayPrice = isDiscount ? '-' : '';
      const qty = item.qty ? parseFloat(item.qty) : 1;

      itemsHtml += `
        <div class="px-3 py-3 flex gap-3 items-start">
            <div class="flex-1">
                <p class="text-sm font-medium text-slate-900 leading-snug">${item.description}</p>
                ${!isDiscount && item.qty ? `<p class="text-[10px] text-slate-400 mt-0.5">Qty: ${qty.toFixed(2)}</p>` : ''}
            </div>
            <div class="text-right w-24">
                <p class="text-sm font-semibold ${priceClass}">${displayPrice}RM ${Math.abs(parseFloat(item.total_price)).toFixed(2)}</p>
            </div>
        </div>
      `;
    });

    const protocol = req.protocol;
    const host = req.get('host');
    const proposalUrl = `${protocol}://${host}/proposal/${invoice.share_token}`;

    proposalHtml = proposalHtml.replace(/{{PROPOSAL_URL}}/g, proposalUrl);
    proposalHtml = proposalHtml.replace(/{{COMPANY_NAME}}/g, companyName);
    proposalHtml = proposalHtml.replace(/{{COMPANY_ADDRESS}}/g, companyAddress);
    proposalHtml = proposalHtml.replace(/{{COMPANY_PHONE}}/g, companyPhone);
    proposalHtml = proposalHtml.replace(/{{COMPANY_EMAIL}}/g, companyEmail);
    proposalHtml = proposalHtml.replace(/{{INVOICE_NUMBER}}/g, invoice.invoice_number);
    proposalHtml = proposalHtml.replace(/{{INVOICE_STATUS}}/g, invoice.status);
    proposalHtml = proposalHtml.replace(/{{INVOICE_DATE}}/g, invoice.invoice_date);
    proposalHtml = proposalHtml.replace(/{{CUSTOMER_NAME}}/g, customerName);
    proposalHtml = proposalHtml.replace(/{{CUSTOMER_ADDRESS}}/g, customerAddress);
    proposalHtml = proposalHtml.replace(/{{CUSTOMER_PHONE}}/g, invoice.customer_phone || '');
    proposalHtml = proposalHtml.replace(/{{CUSTOMER_EMAIL}}/g, invoice.customer_email || '');
    proposalHtml = proposalHtml.replace(/{{INVOICE_ITEMS}}/g, itemsHtml);
    proposalHtml = proposalHtml.replace(/{{SUBTOTAL}}/g, subtotal.toFixed(2));
    proposalHtml = proposalHtml.replace(/{{SST_RATE}}/g, sstRate.toFixed(0));
    proposalHtml = proposalHtml.replace(/{{SST_AMOUNT}}/g, sstAmount.toFixed(2));
    proposalHtml = proposalHtml.replace(/{{TOTAL_AMOUNT}}/g, totalAmount.toFixed(2));
    proposalHtml = proposalHtml.replace(/{{BANK_NAME}}/g, bankName);
    proposalHtml = proposalHtml.replace(/{{BANK_ACCOUNT}}/g, bankAccountNo);
    proposalHtml = proposalHtml.replace(/{{BANK_ACCOUNT_NAME}}/g, bankAccountName);
    proposalHtml = proposalHtml.replace(/{{CREATED_BY}}/g, createdBy);

    if (termsAndConditions) {
        proposalHtml = proposalHtml.replace(/{{TERMS_AND_CONDITIONS}}/g,
            termsAndConditions.replace(/\n/g, '<br>'));
    } else {
        proposalHtml = proposalHtml.replace(/{{TERMS_AND_CONDITIONS}}/g, '');
    }

    proposalHtml = proposalHtml.replace(/var CUSTOMER_NAME\s*=\s*"[^"]*";/, `var CUSTOMER_NAME = "${customerName}";`);
    proposalHtml = proposalHtml.replace(/var CUSTOMER_ADDRESS\s*=\s*"[^"]*";/, `var CUSTOMER_ADDRESS = "${customerAddress}";`);
    proposalHtml = proposalHtml.replace(/var SYSTEM_SIZE\s*=\s*"[^"]*";/, `var SYSTEM_SIZE = "${systemSize}";`);
    proposalHtml = proposalHtml.replace(/var OVERLAY_POSITION_TOP\s*=\s*"[^"]*";/, `var OVERLAY_POSITION_TOP = "28%";`);

    if (forPdf) {
        proposalHtml = proposalHtml.replace('</head>', '<style>.no-print, #downloadPdfBtn { display: none !important; }</style></head>');
    }

    return proposalHtml;
}

/**
 * GET /proposal/:shareToken
 */
router.get('/proposal/:shareToken', async (req, res) => {
  try {
    const { shareToken } = req.params;
    const client = await pool.connect();
    let invoice = null;
    try {
      invoice = await invoiceRepo.getInvoiceByShareToken(client, shareToken);
    } finally {
      client.release();
    }

    if (!invoice) {
      return res.status(404).send('Proposal Not Found');
    }

    const html = await generateProposalHtml(null, invoice, req, false); // Client used internally if needed
    res.header('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('Error in /proposal/:shareToken route:', err);
    res.status(500).send('Error Loading Proposal');
  }
});

/**
 * GET /proposal/:shareToken/pdf
 */
router.get('/proposal/:shareToken/pdf', async (req, res) => {
  try {
    const { shareToken } = req.params;
    const client = await pool.connect();
    let invoice = null;
    try {
      invoice = await invoiceRepo.getInvoiceByShareToken(client, shareToken);
    } finally {
      client.release();
    }

    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    const html = await generateProposalHtml(client, invoice, req, true);
    const pdfResult = await externalPdfService.generatePdfWithRetry(html, {
      format: 'A4',
      printBackground: true,
      margin: { top: '0cm', right: '0cm', bottom: '0cm', left: '0cm' }
    }, 'https://calculator.atap.solar');

    return res.json({
      success: true,
      pdfId: pdfResult.pdfId,
      downloadUrl: pdfResult.downloadUrl,
      expiresAt: pdfResult.expiresAt
    });
  } catch (err) {
    console.error('Error in /proposal/:shareToken/pdf route:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/v1/submitted-payments/:bubbleId
 */
router.get('/api/v1/submitted-payments/:bubbleId', requireAuth, async (req, res) => {
    const { bubbleId } = req.params;
    const userId = req.user.userId;
    const client = await pool.connect();
    try {
        const result = await client.query(`SELECT * FROM submitted_payment WHERE bubble_id = $1`, [bubbleId]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Payment record not found' });
        const payment = result.rows[0];
        const isOwner = await invoiceRepo.verifyOwnership(client, userId, payment.created_by);
        if (!isOwner) return res.status(403).json({ success: false, error: 'Unauthorized' });
        res.json({ success: true, data: payment });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

/**
 * POST /api/v1/invoices/:bubbleId/snapshot
 * Explicitly capture a snapshot of the current invoice state.
 * Useful for Admin Apps before applying manual overrides.
 * Protected: Requires authentication
 */
router.post('/api/v1/invoices/:bubbleId/snapshot', requireAuth, async (req, res) => {
    let client = null;
    try {
        const { bubbleId } = req.params;
        const { actionType, description } = req.body;
        const userId = req.user.userId;

        client = await pool.connect();
        
        // 1. Fetch current full data
        const fullInvoiceData = await invoiceRepo.getInvoiceByBubbleId(client, bubbleId);
        if (!fullInvoiceData) {
            return res.status(404).json({ success: false, error: 'Invoice not found' });
        }

        // 2. Ownership check: match Creator OR Linked Agent
        const isOwner = await invoiceRepo.verifyOwnership(client, userId, fullInvoiceData.created_by, fullInvoiceData.linked_agent);
        if (!isOwner) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        // 3. Capture Snapshot
        // Trigger DB snapshot by touching the record
        // The DB trigger 'trg_auto_snapshot_invoice' will catch this UPDATE and create the snapshot
        await client.query(
            "UPDATE invoice SET updated_at = NOW() WHERE bubble_id = $1",
            [bubbleId]
        );
        
        // We return a placeholder actionId since the DB handles it internally now
        const actionId = 'db_auto_trigger';

        res.json({ success: true, actionId });
    } catch (err) {
        console.error('Error capturing manual snapshot:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * DELETE /api/v1/invoices/cleanup-samples
 */
router.delete('/api/v1/invoices/cleanup-samples', requireAuth, async (req, res) => {
  let client = null;
  try {
    const userId = req.user.userId;
    client = await pool.connect();
    const count = await invoiceRepo.deleteSampleInvoices(client, userId);
    res.json({ success: true, message: `Successfully deleted ${count} sample invoice(s).`, count });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * DEBUG ROUTES
 * Protected by Passkey '012784'
 */

// Middleware for debug passkey
const requireDebugPasskey = (req, res, next) => {
    const passkey = req.headers['x-debug-passkey'];
    if (passkey !== '012784') {
        return res.status(403).json({ success: false, error: 'Invalid debug passkey' });
    }
    next();
};

/**
 * GET /api/debug/users
 * List users for testing purposes
 */
router.get('/api/debug/users', requireDebugPasskey, async (req, res) => {
    let client = null;
    try {
        client = await pool.connect();
        
        // Fetch users with agent details and invoice counts
        const query = `
            SELECT 
                u.id, 
                u.email, 
                u.created_at, 
                a.name as agent_name,
                (SELECT COUNT(*) FROM invoice i WHERE i.created_by = u.id::text) as invoice_count
            FROM "user" u
            LEFT JOIN agent a ON u.linked_agent_profile = a.bubble_id
            ORDER BY u.created_at DESC
            LIMIT 100
        `;
        
        const result = await client.query(query);
        res.json({ success: true, users: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

/**
 * POST /api/debug/login-as
 * Impersonate a user
 */
router.post('/api/debug/login-as', requireDebugPasskey, async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'User ID required' });

    try {
        // Generate JWT
        const token = jwt.sign(
            { userId: String(userId), role: 'user' }, // Payload
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Aggressively clear existing cookies to prevent conflicts
        res.clearCookie('auth_token');
        res.clearCookie('auth_token', { path: '/' });
        res.clearCookie('auth_token', { path: '/', domain: '.atap.solar' });

        // Set Cookie
        const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
        
        res.cookie('auth_token', token, {
            httpOnly: true,
            secure: isSecure,
            path: '/',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.json({ success: true, message: 'Impersonation active. Reloading...' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/debug/recompile-snapshots
 * Batch update missing invoice snapshots from linked customer data
 */
router.post('/api/debug/recompile-snapshots', requireDebugPasskey, async (req, res) => {
    let client = null;
    try {
        client = await pool.connect();
        
        // This tool is now primarily for fixing legacy invoices that might not have a customer_id link
        // but have snapshot data, or vice versa.
        
        // 1. If customer_id exists but snapshots are empty, we don't strictly need to backfill snapshots 
        // anymore since the APP uses JOINS. But we can do it for data consistency.
        const customerResult = await client.query(`
            UPDATE invoice
            SET 
                customer_name_snapshot = c.name,
                customer_address_snapshot = c.address,
                customer_phone_snapshot = c.phone,
                customer_email_snapshot = c.email,
                updated_at = NOW()
            FROM customer c
            WHERE invoice.linked_customer = c.customer_id
            AND (invoice.customer_name_snapshot IS NULL OR invoice.customer_name_snapshot = '')
        `);

        // Update Package Details (if missing)
        const packageResult = await client.query(`
            UPDATE invoice
            SET 
                package_name_snapshot = p.package_name,
                updated_at = NOW()
            FROM package p
            WHERE invoice.linked_package = p.bubble_id
            AND (invoice.package_name_snapshot IS NULL OR invoice.package_name_snapshot = '')
        `);

        res.json({ 
            success: true, 
            message: `Recompilation Complete. Updated ${customerResult.rowCount} customer snapshots and ${packageResult.rowCount} package snapshots.` 
        });

    } catch (err) {
        console.error('Snapshot Recompile Error:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;