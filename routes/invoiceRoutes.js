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
const invoicePdfGenerator = require('../services/invoicePdfGenerator');

// Get database pool from environment or create new one
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:tkaYtCcfkqfsWKjQguFMqIcANbJNcNZA@shinkansen.proxy.rlwy.net:34999/railway',
  ssl: { rejectUnauthorized: false }
});

const router = express.Router();

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

    // DIRECT POSTGRESQL QUERY - No external API calls
    client = await pool.connect();
    const result = await invoiceRepo.getInvoicesByUserId(client, userId, { limit, offset });

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
      agent_markup,
      customer_name,
      customer_phone,
      customer_address,
      epp_fee_amount,
      epp_fee_description
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
      agentMarkup: agent_markup,
      customerName: customer_name,
      customerPhone: customer_phone,
      customerAddress: customer_address,
      eppFeeAmount: epp_fee_amount,
      eppFeeDescription: epp_fee_description
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

    // Check accept header for HTML
    const accept = req.get('accept') || '';
    if (accept.includes('text/html')) {
      // Return HTML (use sync version for web display)
      const html = invoiceHtmlGenerator.generateInvoiceHtmlSync(invoice, invoice.template);
      res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.header('Pragma', 'no-cache');
      res.header('Expires', '0');
      res.send(html);
    } else {
      // Return JSON for API clients
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
 * Download invoice as PDF
 */
router.get('/view/:shareToken/pdf', async (req, res) => {
  const startTime = Date.now();
  let client = null;
  
  try {
    const { shareToken } = req.params;

    // Validate share token
    if (!shareToken || shareToken.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid share token provided'
      });
    }

    // Get invoice by share token
    client = await pool.connect();
    let invoice = null;
    try {
      invoice = await invoiceRepo.getInvoiceByShareToken(client, shareToken);
    } catch (dbError) {
      console.error('Database error fetching invoice:', dbError);
      return res.status(500).json({
        success: false,
        error: 'Database error while fetching invoice'
      });
    } finally {
      if (client) {
        client.release();
        client = null;
      }
    }

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found or expired'
      });
    }

    // Validate invoice has required data
    if (!invoice.invoice_number) {
      return res.status(500).json({
        success: false,
        error: 'Invoice data is incomplete'
      });
    }

    // Generate HTML optimized for PDF (with embedded resources)
    let html;
    try {
      html = await invoiceHtmlGenerator.generateInvoiceHtml(invoice, invoice.template, { forPdf: true });
    } catch (htmlError) {
      console.error('Error generating HTML for PDF:', htmlError);
      return res.status(500).json({
        success: false,
        error: 'Failed to generate invoice HTML: ' + htmlError.message
      });
    }

    if (!html || html.trim().length === 0) {
      return res.status(500).json({
        success: false,
        error: 'Generated HTML is empty'
      });
    }

    // Generate PDF with timeout
    let pdfBuffer;
    try {
      pdfBuffer = await invoicePdfGenerator.generateInvoicePdf(html);
    } catch (pdfError) {
      console.error('Error generating PDF:', pdfError);
      
      // Provide user-friendly error message
      let errorMessage = 'Failed to generate PDF';
      if (pdfError.message.includes('timeout')) {
        errorMessage = 'PDF generation timed out. Please try again.';
      } else if (pdfError.message.includes('Browser')) {
        errorMessage = 'PDF service temporarily unavailable. Please try again later.';
      } else {
        errorMessage = 'Failed to generate PDF: ' + pdfError.message;
      }
      
      return res.status(500).json({
        success: false,
        error: errorMessage
      });
    }

    if (!pdfBuffer || pdfBuffer.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'Generated PDF is empty'
      });
    }

    // Generate filename
    const companyName = invoice.template?.company_name || 'Invoice';
    const filename = invoicePdfGenerator.sanitizeFilename(companyName, invoice.invoice_number);

    // Set headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Log success
    const generationTime = Date.now() - startTime;
    console.log(`PDF generated successfully for invoice ${invoice.invoice_number} in ${generationTime}ms`);

    // Send PDF
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Unexpected error in PDF route:', err);
    res.status(500).json({
      success: false,
      error: 'An unexpected error occurred while generating PDF'
    });
  } finally {
    // Ensure database connection is released
    if (client) {
      try {
        client.release();
      } catch (releaseError) {
        console.error('Error releasing database connection:', releaseError);
      }
    }
  }
});

module.exports = router;
