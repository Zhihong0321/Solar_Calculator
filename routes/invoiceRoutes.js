/**
 * Invoice Routes Module
 * Handles all invoice-related endpoints
 */
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
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
 * GET /create-invoice
 * Invoice creation page - shows form with pre-filled data
 */
router.get('/create-invoice', async (req, res) => {
  try {
    const {
      package_id,
      panel_qty,
      panel_rating,
      discount_given,
      customer_name,
      customer_phone,
      customer_address,
      template_id,
      apply_sst
    } = req.query;

    let package = null;
    let errorMessage = null;
    let warningMessage = null;

    // Try to fetch package if package_id provided
    if (package_id) {
      const client = await pool.connect();
      try {
        package = await invoiceRepo.getPackageById(client, package_id);
        if (!package) {
          errorMessage = `⚠️ Package Not Found: The Package ID '${package_id}' does not exist in the database.`;
        }
      } catch (err) {
        console.error('Error fetching package:', err);
        errorMessage = `⚠️ Database Error: Failed to check package. Error: ${err.message}`;
      } finally {
        client.release();
      }
    } else {
      warningMessage = 'ℹ️ No Package ID provided. You can enter a Package ID below or continue without one.';
    }

    // Render template with data
    const templatePath = path.join(__dirname, '..', 'public', 'templates', 'create_invoice.html');

    // Check if template exists
    const fs = require('fs');
    if (!fs.existsSync(templatePath)) {
      return res.status(500).send(`
        <html>
        <head><title>Template Error</title>
        <script src="https://cdn.tailwindcss.com"></script></head>
        <body class="p-8 bg-gray-100">
          <div class="max-w-2xl mx-auto bg-white rounded-lg shadow p-6">
            <h1 class="text-2xl font-bold text-red-600 mb-4">❌ Template Not Found</h1>
            <p class="text-gray-700">Template file not found: ${templatePath}</p>
            <p class="text-gray-600 text-sm mt-2">Please ensure the template file exists in the correct location.</p>
          </div>
        </body>
        </html>
      `);
    }

    // Read template and render
    const template = fs.readFileSync(templatePath, 'utf8');
    const html = template
      .replace(/{{\s*package\s*\|\s*default\(null\)\s*}}/g, package ? JSON.stringify(package) : 'null')
      .replace(/{{\s*package_id\s*}}/g, package_id || '')
      .replace(/{{\s*error_message\s*}}/g, errorMessage || '')
      .replace(/{{\s*warning_message\s*}}/g, warningMessage || '')
      .replace(/{{\s*panel_qty\s*}}/g, panel_qty || '')
      .replace(/{{\s*panel_rating\s*}}/g, panel_rating || '')
      .replace(/{{\s*discount_given\s*}}/g, discount_given || '')
      .replace(/{{\s*customer_name\s*}}/g, customer_name || '')
      .replace(/{{\s*customer_phone\s*}}/g, customer_phone || '')
      .replace(/{{\s*customer_address\s*}}/g, customer_address || '')
      .replace(/{{\s*template_id\s*}}/g, template_id || '')
      .replace(/{{\s*apply_sst\s*}}/g, apply_sst || 'false');

    res.send(html);
  } catch (err) {
    console.error('Error in /create-invoice route:', err);
    res.status(500).send(`
      <html>
      <head><title>Server Error</title>
      <script src="https://cdn.tailwindcss.com"></script></head>
      <body class="p-8 bg-gray-100">
        <div class="max-w-2xl mx-auto bg-white rounded-lg shadow p-6">
          <h1 class="text-2xl font-bold text-red-600 mb-4">❌ Server Error</h1>
          <p class="text-gray-700">${err.message}</p>
        </div>
      </body>
      </html>
    `);
  }
});

/**
 * POST /api/v1/invoices/on-the-fly
 * Create invoice on the fly and return shareable link
 */
router.post('/api/v1/invoices/on-the-fly', async (req, res) => {
  try {
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

    // Create invoice
    const result = await invoiceService.createInvoice(pool, {
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
    const accept = req.headers.get('accept') || '';
    if (accept.includes('text/html')) {
      // Return HTML
      const html = invoiceHtmlGenerator.generateInvoiceHtml(invoice, invoice.template, shareToken);
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
 * Download invoice as PDF via share token
 */
router.get('/view/:shareToken/pdf', async (req, res) => {
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
      return res.status(404).send('Invoice not found or link expired');
    }

    // Generate HTML
    const html = invoiceHtmlGenerator.generateInvoiceHtml(invoice, invoice.template, null);

    // Generate PDF
    const pdfBuffer = await invoicePdfGenerator.generateInvoicePdf(html);

    // Generate filename
    const filename = invoicePdfGenerator.sanitizeFilename(
      invoice.template?.company_name || 'Atap Solar',
      invoice.invoice_number
    );

    // Send PDF as response
    res.header('Content-Type', 'application/pdf');
    res.header('Content-Disposition', `attachment; filename="${filename}"`);
    res.header('Content-Length', pdfBuffer.length);
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.header('Pragma', 'no-cache');
    res.header('Expires', '0');
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Error in /view/:shareToken/pdf route:', err);
    res.status(500).send('Failed to generate PDF: ' + err.message);
  }
});

module.exports = router;
