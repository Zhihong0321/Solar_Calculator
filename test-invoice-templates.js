#!/usr/bin/env node
/**
 * Local Invoice Template Preview Server
 *
 * Run: node test-invoice-templates.js
 * Then open: http://localhost:3939
 *
 * This lets you preview all 4 invoice templates before archiving unused ones.
 */

const express = require('express');
const path = require('path');

// Import the generators
const invoiceHtmlGenerator = require('./src/modules/Invoicing/services/invoiceHtmlGenerator');
const invoiceHtmlGeneratorV2 = require('./src/modules/Invoicing/services/invoiceHtmlGeneratorV2');
const invoiceHtmlGeneratorV3 = require('./src/modules/Invoicing/services/invoiceHtmlGeneratorV3');
const invoiceHtmlGeneratorA4 = require('./src/modules/Invoicing/services/invoiceHtmlGeneratorA4');

const app = express();
const PORT = 3939;

// Mock invoice data for testing
const mockInvoice = {
  bubble_id: 'test-invoice-12345',
  share_token: 'test-token',
  invoice_number: 'INV-1010882',
  invoice_date: '2026-07-21',
  status: 'draft',
  customer_name: 'FuzzyName Lead',
  customer_phone: '60123555444',
  customer_email: 'test@example.com',
  linked_agent: 'agent-123',
  created_by: 'GAN ZHI HONG',
  package_type: 'Residential',
  package_name: '[3P] STRING SAJ JINKO 16 PCS',
  system_size_kwp: 10.4,
  panel_qty: 16,
  panel_rating: 650,
  panel_type: 'Tiger Neo 3',
  inverter_name: '—',
  total_amount: 29990.00,
  invoice_items: [
    { item_name: 'Solar Panel Installation', quantity: 16, unit_price: 1874.375, total_price: 29990.00 }
  ],
  sun_peak_h: 3.4,
  monthly_solar_generation_kwh: 1060.8,
  monthly_bill_before: 504.67,
  monthly_bill_after: 148.33,
  bill_savings_percent: 71
};

const mockTemplate = {};

// Serve static assets
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));

// Index page
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Invoice Template Preview</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          max-width: 1200px;
          margin: 50px auto;
          padding: 20px;
          background: #f5f5f5;
        }
        h1 { color: #333; border-bottom: 3px solid #0ea5e9; padding-bottom: 10px; }
        .template-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-top: 30px; }
        .template-card {
          background: white;
          border-radius: 8px;
          padding: 25px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .template-card:hover { transform: translateY(-4px); box-shadow: 0 4px 16px rgba(0,0,0,0.15); }
        .template-card h2 { margin: 0 0 10px 0; color: #0ea5e9; font-size: 1.3em; }
        .template-card p { color: #666; margin: 0 0 15px 0; font-size: 0.95em; line-height: 1.5; }
        .status {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 0.75em;
          font-weight: 600;
          margin-bottom: 12px;
        }
        .status.active { background: #dcfce7; color: #166534; }
        .status.unused { background: #fee2e2; color: #991b1b; }
        .btn {
          display: inline-block;
          padding: 10px 20px;
          background: #0ea5e9;
          color: white;
          text-decoration: none;
          border-radius: 6px;
          font-weight: 500;
          transition: background 0.2s;
        }
        .btn:hover { background: #0284c7; }
        .note {
          background: #fef3c7;
          border-left: 4px solid #f59e0b;
          padding: 15px;
          border-radius: 4px;
          margin-top: 30px;
        }
        .note strong { color: #92400e; }
      </style>
    </head>
    <body>
      <h1>📄 Invoice Template Preview</h1>
      <p style="color: #666; margin-top: 10px;">Preview all invoice templates before archiving unused ones.</p>

      <div class="template-grid">

        <div class="template-card">
          <div class="status unused">❌ UNUSED</div>
          <h2>Legacy View</h2>
          <p>Original HTML invoice display. Basic layout without modern features.</p>
          <p><strong>Generator:</strong> invoiceHtmlGenerator.js</p>
          <p><strong>Route:</strong> /legacy-view/:token</p>
          <a href="/preview/legacy" class="btn">Preview</a>
        </div>

        <div class="template-card">
          <div class="status active">✅ ACTIVE</div>
          <h2>V2 View (Default)</h2>
          <p>Current default template. Mobile-optimized with green gradient, card layout, and bill projections.</p>
          <p><strong>Generator:</strong> invoiceHtmlGeneratorV2.js</p>
          <p><strong>Route:</strong> /view/:token</p>
          <a href="/preview/v2" class="btn">Preview</a>
        </div>

        <div class="template-card">
          <div class="status unused">❌ UNUSED</div>
          <h2>V3 View (Mobile SPA)</h2>
          <p>Single-page app with tabbed sections and bottom navigation. Built for mobile/tablet.</p>
          <p><strong>Generator:</strong> invoiceHtmlGeneratorV3.js</p>
          <p><strong>Route:</strong> /view-v3/:token</p>
          <a href="/preview/v3" class="btn">Preview</a>
        </div>

        <div class="template-card">
          <div class="status active">✅ ACTIVE</div>
          <h2>A4 Print View</h2>
          <p>Print-optimized A4 layout (210mm × 297mm). Used when ?layout=a4 parameter is present.</p>
          <p><strong>Generator:</strong> invoiceHtmlGeneratorA4.js</p>
          <p><strong>Route:</strong> /view/:token?layout=a4</p>
          <a href="/preview/a4" class="btn">Preview</a>
        </div>

      </div>

      <div class="note">
        <strong>⚠️ Archive Plan:</strong> After reviewing, we'll archive <strong>Legacy View</strong> and <strong>V3 View</strong>
        to <code>archive/unused-invoice-templates-2026-07-30/</code> since they're not in production use.
      </div>
    </body>
    </html>
  `);
});

// Preview routes
app.get('/preview/legacy', (req, res) => {
  try {
    const html = invoiceHtmlGenerator.generateInvoiceHtml(mockInvoice, mockTemplate);
    res.send(html);
  } catch (err) {
    res.status(500).send(`<h1>Error generating Legacy view</h1><pre>${err.stack}</pre>`);
  }
});

app.get('/preview/v2', (req, res) => {
  try {
    const html = invoiceHtmlGeneratorV2.generateInvoiceHtmlV2(mockInvoice, mockTemplate, {});
    res.send(html);
  } catch (err) {
    res.status(500).send(`<h1>Error generating V2 view</h1><pre>${err.stack}</pre>`);
  }
});

app.get('/preview/v3', (req, res) => {
  try {
    const html = invoiceHtmlGeneratorV3.generateInvoiceHtmlV3(mockInvoice, mockTemplate, {});
    res.send(html);
  } catch (err) {
    res.status(500).send(`<h1>Error generating V3 view</h1><pre>${err.stack}</pre>`);
  }
});

app.get('/preview/a4', (req, res) => {
  try {
    const html = invoiceHtmlGeneratorA4.generateInvoiceHtmlA4(mockInvoice, mockTemplate, { layout: 'a4' });
    res.send(html);
  } catch (err) {
    res.status(500).send(`<h1>Error generating A4 view</h1><pre>${err.stack}</pre>`);
  }
});

app.listen(PORT, () => {
  console.log(`\n✅ Invoice Template Preview Server running!`);
  console.log(`\n   👉 Open: http://localhost:${PORT}\n`);
  console.log(`   Press Ctrl+C to stop\n`);
});
