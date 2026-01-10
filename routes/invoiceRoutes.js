/**
 * Invoice Routes Module
 * Handles all invoice-related endpoints
 */
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const { requireAuth } = require('../middleware/auth');
const invoiceRepo = require('../services/invoiceRepo');
const invoiceService = require('../services/invoiceService');
const invoiceHtmlGenerator = require('../services/invoiceHtmlGenerator');
const externalPdfService = require('../services/externalPdfService');

// Get database pool from environment or create new one
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway',
  ssl: { rejectUnauthorized: false }
});

const router = express.Router();

/**
 * GET /api/user/me
 * Get current user profile
 * Protected: Requires authentication
 */
router.get('/api/user/me', requireAuth, (req, res) => {
    res.json({
        success: true,
        user: req.user
    });
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
    const templatePath = path.join(__dirname, '..', 'public', 'templates', 'create_invoice.html');
    res.sendFile(templatePath);
});

/**
 * GET /my-invoice
 * User's invoice management page - DIRECT POSTGRESQL ACCESS
 * Protected: Requires authentication
 */
router.get('/my-invoice', requireAuth, (req, res) => {
  const templatePath = path.join(__dirname, '..', 'public', 'templates', 'my_invoice.html');
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

    console.log('[MY-INVOICES API] userId from JWT:', userId, 'type:', typeof userId);

    // DIRECT POSTGRESQL QUERY - No external API calls
    client = await pool.connect();
    const result = await invoiceRepo.getInvoicesByUserId(client, userId, { limit, offset });
    
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
    const {
      package_id,
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
      packageId: package_id,
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
 * GET /view/:shareToken
 * Public invoice view via share link (HTML for browsers, JSON for others)
 */
router.get('/view/:shareToken', async (req, res) => {
  try {
    const { shareToken } = req.params;

    // Get invoice by share token
    const client = await pool.connect();
    let invoice = null;
    try {
      invoice = await invoiceRepo.getInvoiceByShareToken(client, shareToken);
    } finally {
      client.release();
    }

    if (!invoice) {
      // Not found or expired
      return res.status(404).send(`
        <html>
        <head><title>Invoice Not Found</title>
        <script src="https://cdn.tailwindcss.com"></script></head>
        <body class="p-8 bg-gray-100">
          <div class="max-w-2xl mx-auto bg-white rounded-lg shadow p-6 text-center">
            <h1 class="text-2xl font-bold text-red-600 mb-4">❌ Invoice Not Found</h1>
            <p class="text-gray-700">The invoice you're looking for doesn't exist or has expired.</p>
            <p class="text-gray-600 text-sm mt-2">Share Token: ${shareToken}</p>
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

    // Check accept header - default to HTML for browsers
    const accept = req.get('accept') || '';
    const userAgent = req.get('user-agent') || '';
    const isBrowser = userAgent.includes('Mozilla') || userAgent.includes('Chrome') || userAgent.includes('Safari') || userAgent.includes('Firefox');
    const wantsJSON = accept.includes('application/json') && !accept.includes('text/html');
    
    if (wantsJSON) {
      // Return JSON for API clients that explicitly want JSON
      const protocol = req.protocol;
      const host = req.get('host');
      const shareUrl = `${protocol}://${host}/view/${shareToken}`;
      res.json({
        success: true,
        invoice_link: shareUrl,
        invoice_number: invoice.invoice_number,
        bubble_id: invoice.bubble_id,
        total_amount: invoice.total_amount
      });
    } else {
      // Default to HTML for browsers (even if Accept header doesn't include text/html)
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
    console.error('Error in /view/:shareToken route:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to load invoice: ' + err.message
    });
  }
});

/**
 * GET /view/:shareToken/pdf
 * Generate PDF and return download URL (JSON response)
 */
router.get('/view/:shareToken/pdf', async (req, res) => {
  try {
    const { shareToken } = req.params;

    // Debug: Log what Express captured
    console.log('[PDF Route] Express req.params.shareToken:', shareToken);
    console.log('[PDF Route] Share token length:', shareToken.length);
    console.log('[PDF Route] Full URL:', req.originalUrl);

    // Get invoice by share token
    const client = await pool.connect();
    let invoice = null;
    try {
      invoice = await invoiceRepo.getInvoiceByShareToken(client, shareToken);
    } finally {
      client.release();
    }

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found or has expired'
      });
    }

    // Generate HTML with forPdf option (removes download button)
    const html = invoiceHtmlGenerator.generateInvoiceHtml(invoice, invoice.template, { forPdf: true });

    // Generate PDF using external API with baseUrl for resolving relative image paths
    const pdfResult = await externalPdfService.generatePdfWithRetry(html, {
      format: 'A4',
      printBackground: true,
      margin: {
        top: '1cm',
        right: '1cm',
        bottom: '1cm',
        left: '1cm'
      }
    }, 'https://calculator.atap.solar'); // Always use https://calculator.atap.solar as baseUrl

    // Return JSON with download URL (instead of redirect)
    console.log(`[PDF Route] Generated PDF: ${pdfResult.pdfId}`);
    console.log(`[PDF Route] Download URL: ${pdfResult.downloadUrl}`);

    return res.json({
      success: true,
      pdfId: pdfResult.pdfId,
      downloadUrl: pdfResult.downloadUrl,
      expiresAt: pdfResult.expiresAt
    });

  } catch (err) {
    console.error('Error in /view/:shareToken/pdf route:', err);
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
    // Fetch user name who created the invoice
    let createdBy = 'System';
    if (invoice.created_by) {
      try {
        const userResult = await client.query(
            `SELECT a.name 
             FROM "user" u 
             JOIN agent a ON u.linked_agent_profile = a.bubble_id 
             WHERE u.id = $1 
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

    // Read proposal template
    const templatePath = path.join(__dirname, '..', 'portable-proposal', 'index.html');
    const fs = require('fs');
    let proposalHtml = fs.readFileSync(templatePath, 'utf8');

    // Prepare data for proposal
    const customerName = invoice.customer_name_snapshot || 'Valued Customer';
    const customerAddress = invoice.customer_address_snapshot || 'Malaysia';
    const systemSize = invoice.system_size_kwp
      ? `${invoice.system_size_kwp.toFixed(1)} kWp System`
      : 'Solar System';

    // Get template data
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

    // Calculate totals
    const subtotal = parseFloat(invoice.subtotal) || 0;
    const sstAmount = parseFloat(invoice.sst_amount) || 0;
    const totalAmount = parseFloat(invoice.total_amount) || 0;
    const sstRate = parseFloat(invoice.sst_rate) || 0;

    // Generate items HTML
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

    // Replace all placeholders
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
    proposalHtml = proposalHtml.replace(/{{CUSTOMER_PHONE}}/g, invoice.customer_phone_snapshot || '');
    proposalHtml = proposalHtml.replace(/{{CUSTOMER_EMAIL}}/g, invoice.customer_email_snapshot || '');
    proposalHtml = proposalHtml.replace(/{{INVOICE_ITEMS}}/g, itemsHtml);
    proposalHtml = proposalHtml.replace(/{{SUBTOTAL}}/g, subtotal.toFixed(2));
    proposalHtml = proposalHtml.replace(/{{SST_RATE}}/g, sstRate.toFixed(0));
    proposalHtml = proposalHtml.replace(/{{SST_AMOUNT}}/g, sstAmount.toFixed(2));
    proposalHtml = proposalHtml.replace(/{{TOTAL_AMOUNT}}/g, totalAmount.toFixed(2));
    proposalHtml = proposalHtml.replace(/{{BANK_NAME}}/g, bankName);
    proposalHtml = proposalHtml.replace(/{{BANK_ACCOUNT}}/g, bankAccountNo);
    proposalHtml = proposalHtml.replace(/{{BANK_ACCOUNT_NAME}}/g, bankAccountName);
    proposalHtml = proposalHtml.replace(/{{CREATED_BY}}/g, createdBy);

    // Replace terms
    if (termsAndConditions) {
        proposalHtml = proposalHtml.replace(/{{TERMS_AND_CONDITIONS}}/g,
            termsAndConditions.replace(/\n/g, '<br>'));
    } else {
        proposalHtml = proposalHtml.replace(/{{TERMS_AND_CONDITIONS}}/g, '');
    }

    // Replace overlay variables
    proposalHtml = proposalHtml.replace(
      /var CUSTOMER_NAME\s*=\s*"[^"]*";/,
      `var CUSTOMER_NAME = "${customerName}";`
    );

    proposalHtml = proposalHtml.replace(
      /var CUSTOMER_ADDRESS\s*=\s*"[^"]*";/,
      `var CUSTOMER_ADDRESS = "${customerAddress}";`
    );

    proposalHtml = proposalHtml.replace(
      /var SYSTEM_SIZE\s*=\s*"[^"]*";/,
      `var SYSTEM_SIZE = "${systemSize}";`
    );

    proposalHtml = proposalHtml.replace(
      /var OVERLAY_POSITION_TOP\s*=\s*"[^"]*";/,
      `var OVERLAY_POSITION_TOP = "28%";`
    );

    // Inject PDF-specific styles/scripts if needed
    if (forPdf) {
        // Hide elements with 'no-print' class or id 'downloadPdfBtn'
        proposalHtml = proposalHtml.replace(
            '</head>',
            '<style>.no-print, #downloadPdfBtn { display: none !important; }</style></head>'
        );
        // Also ensure images are loaded? The PDF generator waits for network idle usually.
    }

    return proposalHtml;
}

/**
 * GET /proposal/:shareToken
 * View proposal with customer data and invoice HTML embedded
 */
router.get('/proposal/:shareToken', async (req, res) => {
  try {
    const { shareToken } = req.params;

    // Get invoice by share token
    const client = await pool.connect();
    let invoice = null;
    try {
      invoice = await invoiceRepo.getInvoiceByShareToken(client, shareToken);
    } finally {
      client.release();
    }

    if (!invoice) {
      return res.status(404).send(`
        <html>
        <head><title>Proposal Not Found</title>
        <script src="https://cdn.tailwindcss.com"></script></head>
        <body class="p-8 bg-gray-100">
          <div class="max-w-2xl mx-auto bg-white rounded-lg shadow p-6 text-center">
            <h1 class="text-2xl font-bold text-red-600 mb-4">❌ Proposal Not Found</h1>
            <p class="text-gray-700">The invoice for this proposal doesn't exist or has expired.</p>
          </div>
        </body>
        </html>
      `);
    }

    const html = await generateProposalHtml(client, invoice, req, false);

    // Send the combined HTML
    res.header('Content-Type', 'text/html; charset=utf-8');
    res.send(html);

  } catch (err) {
    console.error('Error in /proposal/:shareToken route:', err);
    res.status(500).send(`
      <html>
      <head><title>Error</title></head>
      <body style="font-family: sans-serif; padding: 2rem;">
        <h1>Error Loading Proposal</h1>
        <p>Failed to generate proposal: ${err.message}</p>
      </body>
      </html>
    `);
  }
});

/**
 * GET /proposal/:shareToken/pdf
 * Generate PDF of the proposal
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
      return res.status(404).json({
        success: false,
        error: 'Invoice not found or has expired'
      });
    }

    // Generate HTML for PDF (hides buttons)
    const html = await generateProposalHtml(client, invoice, req, true);

    // Generate PDF using external API
    // Use the same baseUrl as the invoice PDF
    const pdfResult = await externalPdfService.generatePdfWithRetry(html, {
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0cm', // Proposal usually needs full bleed or custom margins
        right: '0cm',
        bottom: '0cm',
        left: '0cm'
      }
    }, 'https://calculator.atap.solar');

    return res.json({
      success: true,
      pdfId: pdfResult.pdfId,
      downloadUrl: pdfResult.downloadUrl,
      expiresAt: pdfResult.expiresAt
    });

  } catch (err) {
    console.error('Error in /proposal/:shareToken/pdf route:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to generate PDF'
    });
  }
});

module.exports = router;
