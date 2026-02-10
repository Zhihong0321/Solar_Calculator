/**
 * Example Integration Code for Portable Invoice Viewer
 *
 * This file demonstrates different ways to integrate the invoice template
 * into other applications.
 */

const fs = require('fs');
const path = require('path');

// ============================================
// EXAMPLE 1: Simple Browser Integration
// ============================================

/**
 * Browser Integration - Load template and set data
 */
function exampleBrowserIntegration() {
  // Read template file
  const templateHtml = fs.readFileSync(
    path.join(__dirname, 'invoice-template.html'),
    'utf8'
  );

  // Sample invoice data
  const invoiceData = {
    invoice_number: 'INV-000001',
    invoice_date: '2026-01-12',
    due_date: '2026-02-11',
    status: 'Draft',
    customer_name: 'John Doe',
    customer_address: '123 Main Street\nKL, Malaysia',
    customer_phone: '+60 12-345-6789',
    customer_email: 'john@example.com',
    subtotal: 15000.00,
    discount_amount: 500.00,
    voucher_amount: 0.00,
    sst_amount: 900.00,
    sst_rate: 6,
    total_amount: 16400.00,
    items: [
      {
        description: 'Solar Panel Package (6 panels)',
        qty: 6,
        total_price: 12000.00,
        item_type: 'product'
      },
      {
        description: 'Installation Service',
        qty: 1,
        total_price: 3000.00,
        item_type: 'service'
      },
      {
        description: 'Early Bird Discount',
        qty: 0,
        total_price: -500.00,
        item_type: 'discount'
      }
    ],
    created_by_user_name: 'Sales Agent',
    template: {
      company_name: 'Atap Solar',
      company_address: '1-2-3 Business Park,\nKL, Malaysia',
      company_phone: '+60 3-1234-5678',
      company_email: 'info@atapsolar.com',
      logo_url: '/logo-08.png',
      bank_name: 'Maybank',
      bank_account_no: '1234567890123',
      bank_account_name: 'Atap Solar Sdn Bhd',
      terms_and_conditions: '1. Payment due in 30 days.\n2. Goods not returnable.'
    }
  };

  // Method 1: Inject data as script before template
  const dataScript = `<script>window.invoiceData = ${JSON.stringify(invoiceData)};<\/script>`;
  const htmlWithInjectedData = templateHtml.replace('</head>', `${dataScript}</head>`);

  // Save to file (for browser testing)
  fs.writeFileSync(
    path.join(__dirname, 'test-invoice-browser.html'),
    htmlWithInjectedData
  );

  console.log('✓ Browser integration example saved to test-invoice-browser.html');
  console.log('  Open this file in a browser to view the invoice');
}


// ============================================
// EXAMPLE 2: Server-Side Rendering (Node.js)
// ============================================

/**
 * Server-Side Rendering - Replace placeholders directly
 */
function exampleServerSideRendering() {
  const templateHtml = fs.readFileSync(
    path.join(__dirname, 'invoice-template.html'),
    'utf8'
  );

  const invoiceData = {
    invoice_number: 'INV-000002',
    invoice_date: '2026-01-12',
    due_date: '2026-02-11',
    status: 'Sent',
    customer_name: 'Jane Smith',
    customer_address: '456 Oak Avenue\nSelangor, Malaysia',
    customer_phone: '+60 13-456-7890',
    customer_email: 'jane@example.com',
    subtotal: 25000.00,
    discount_amount: 0.00,
    voucher_amount: 1000.00,
    sst_amount: 1500.00,
    sst_rate: 6,
    total_amount: 26500.00,
    items: [
      {
        description: 'Solar Panel Premium Package (10 panels)',
        qty: 10,
        total_price: 22000.00,
        item_type: 'product'
      },
      {
        description: 'Premium Installation Service',
        qty: 1,
        total_price: 4000.00,
        item_type: 'service'
      },
      {
        description: 'Voucher: SPECIAL10',
        qty: 0,
        total_price: -1000.00,
        item_type: 'voucher'
      }
    ],
    created_by_user_name: 'John Doe',
    template: {
      company_name: 'Atap Solar',
      company_address: '1-2-3 Business Park,\nKL, Malaysia',
      company_phone: '+60 3-1234-5678',
      company_email: 'info@atapsolar.com',
      logo_url: '/logo-08.png',
      bank_name: 'Maybank',
      bank_account_no: '1234567890123',
      bank_account_name: 'Atap Solar Sdn Bhd',
      terms_and_conditions: '1. Payment due in 30 days.\n2. Goods not returnable.'
    }
  };

  // Replace all placeholders
  let html = templateHtml;
  html = html.replace(/{{INVOICE_NUMBER}}/g, invoiceData.invoice_number || 'N/A');
  html = html.replace(/{{COMPANY_NAME}}/g, invoiceData.template?.company_name || 'Your Company');
  html = html.replace(/{{COMPANY_ADDRESS}}/g, invoiceData.template?.company_address || '');
  html = html.replace(/{{COMPANY_PHONE}}/g, invoiceData.template?.company_phone || '');
  html = html.replace(/{{COMPANY_EMAIL}}/g, invoiceData.template?.company_email || '');
  html = html.replace(/{{LOGO_URL}}/g, invoiceData.template?.logo_url || '/logo.png');
  html = html.replace(/{{STATUS}}/g, invoiceData.status || 'Draft');
  html = html.replace(/{{INVOICE_DATE}}/g, invoiceData.invoice_date || '');
  html = html.replace(/{{DUE_DATE}}/g, invoiceData.due_date || '');
  html = html.replace(/{{CUSTOMER_NAME}}/g, invoiceData.customer_name || 'Valued Customer');
  html = html.replace(/{{CUSTOMER_ADDRESS}}/g, invoiceData.customer_address || '');
  html = html.replace(/{{CUSTOMER_PHONE}}/g, invoiceData.customer_phone || '');
  html = html.replace(/{{CUSTOMER_EMAIL}}/g, invoiceData.customer_email || '');
  html = html.replace(/{{SUBTOTAL}}/g, (invoiceData.subtotal || 0).toFixed(2));
  html = html.replace(/{{SST_RATE}}/g, invoiceData.sst_rate || 6);
  html = html.replace(/{{SST_AMOUNT}}/g, (invoiceData.sst_amount || 0).toFixed(2));
  html = html.replace(/{{DISCOUNT_AMOUNT}}/g, Math.abs(invoiceData.discount_amount || 0).toFixed(2));
  html = html.replace(/{{VOUCHER_AMOUNT}}/g, Math.abs(invoiceData.voucher_amount || 0).toFixed(2));
  html = html.replace(/{{TOTAL_AMOUNT}}/g, (invoiceData.total_amount || 0).toFixed(2));
  html = html.replace(/{{BANK_NAME}}/g, invoiceData.template?.bank_name || '');
  html = html.replace(/{{BANK_ACCOUNT_NO}}/g, invoiceData.template?.bank_account_no || '');
  html = html.replace(/{{BANK_ACCOUNT_NAME}}/g, invoiceData.template?.bank_account_name || '');
  html = html.replace(/{{TERMS}}/g, invoiceData.template?.terms_and_conditions?.replace(/\n/g, '<br>') || '');
  html = html.replace(/{{CREATED_BY}}/g, invoiceData.created_by_user_name || 'System');

  // Show/hide optional sections
  html = html.replace(
    /id="discount-row" style="display: none;"/g,
    invoiceData.discount_amount !== 0 ? 'id="discount-row"' : 'id="discount-row" style="display: none;"'
  );
  html = html.replace(
    /id="voucher-row" style="display: none;"/g,
    invoiceData.voucher_amount !== 0 ? 'id="voucher-row"' : 'id="voucher-row" style="display: none;"'
  );
  html = html.replace(
    /id="sst-row" style="display: none;"/g,
    invoiceData.sst_amount !== 0 ? 'id="sst-row"' : 'id="sst-row" style="display: none;"'
  );
  html = html.replace(
    /id="terms-section" style="display: none;"/g,
    invoiceData.template?.terms_and_conditions ? 'id="terms-section"' : 'id="terms-section" style="display: none;"'
  );
  html = html.replace(
    /id="created-by-section" style="display: none;"/g,
    invoiceData.created_by_user_name ? 'id="created-by-section"' : 'id="created-by-section" style="display: none;"'
  );

  // Render items
  const itemsHtml = invoiceData.items.map(item => {
    const isDiscount = item.item_type === 'discount' || item.item_type === 'voucher';
    const priceClass = isDiscount ? 'text-red-600' : 'text-slate-900';
    const price = parseFloat(item.total_price) || 0;
    const qty = parseFloat(item.qty) || 0;

    return `
      <div class="px-3 py-3 flex gap-3 items-start">
        <div class="flex-1">
          <p class="text-sm font-medium text-slate-900 leading-snug">${item.description}</p>
          ${!isDiscount && qty ? `<p class="text-[10px] text-slate-400 mt-0.5">Qty: ${qty}</p>` : ''}
        </div>
        <div class="text-right w-24">
          <p class="text-sm font-semibold ${priceClass}">${isDiscount ? '-' : ''}RM ${Math.abs(price).toFixed(2)}</p>
        </div>
      </div>
    `;
  }).join('');

  html = html.replace(
    /<div class="divide-y.*" id="invoice-items">[\s\S]*?<\/div>/,
    `<div class="divide-y divide-slate-100 border-b border-slate-100" id="invoice-items">${itemsHtml}</div>`
  );

  // Save to file
  fs.writeFileSync(
    path.join(__dirname, 'test-invoice-server.html'),
    html
  );

  console.log('✓ Server-side rendering example saved to test-invoice-server.html');
}


// ============================================
// EXAMPLE 3: Express Route Integration
// ============================================

/**
 * Express Route - Render invoice for HTTP response
 */
function exampleExpressRoute() {
  const express = require('express');
  const app = express();

  const templateHtml = fs.readFileSync(
    path.join(__dirname, 'invoice-template.html'),
    'utf8'
  );

  // Route to view invoice by share token
  app.get('/view/:shareToken', async (req, res) => {
    const { shareToken } = req.params;

    // Fetch invoice data from database
    const invoiceData = await fetchInvoiceFromDatabase(shareToken);

    if (!invoiceData) {
      return res.status(404).send('Invoice not found');
    }

    // Render template
    const html = renderInvoice(templateHtml, invoiceData);

    res.send(html);
  });

  // Helper function to fetch invoice (example)
  async function fetchInvoiceFromDatabase(shareToken) {
    // Replace with actual database query
    // const result = await pool.query(
    //   `SELECT * FROM invoice_new WHERE share_token = $1`,
    //   [shareToken]
    // );
    // return result.rows[0];
    return null; // Placeholder
  }

  // Helper function to render template
  function renderInvoice(template, data) {
    let html = template;
    html = html.replace(/{{INVOICE_NUMBER}}/g, data.invoice_number || 'N/A');
    html = html.replace(/{{COMPANY_NAME}}/g, data.template?.company_name || 'Your Company');
    // ... (replace all other placeholders)
    return html;
  }

  console.log('✓ Express route integration example provided');
  return app;
}


// ============================================
// EXAMPLE 4: From Your Main App's API
// ============================================

/**
 * Fetch invoice from main app's API and render
 */
async function exampleFromMainAppApi() {
  const templateHtml = fs.readFileSync(
    path.join(__dirname, 'invoice-template.html'),
    'utf8'
  );

  // Your main app's API endpoint
  const shareToken = 'your-share-token-here';
  const apiUrl = `http://your-main-app.com/view/${shareToken}`;

  try {
    // Fetch invoice data as JSON
    const response = await fetch(`${apiUrl}?format=json`);
    const invoiceData = await response.json();

    // Render template
    const html = renderInvoice(templateHtml, invoiceData);

    // Save to file
    fs.writeFileSync(
      path.join(__dirname, 'test-invoice-from-api.html'),
      html
    );

    console.log('✓ API integration example saved to test-invoice-from-api.html');
  } catch (error) {
    console.error('Error fetching from API:', error);
  }

  function renderInvoice(template, data) {
    let html = template;
    html = html.replace(/{{INVOICE_NUMBER}}/g, data.invoice_number || 'N/A');
    html = html.replace(/{{TOTAL_AMOUNT}}/g, (data.total_amount || 0).toFixed(2));
    // ... (replace all other placeholders)
    return html;
  }
}


// ============================================
// RUN EXAMPLES
// ============================================

if (require.main === module) {
  console.log('Running Portable Invoice Viewer Integration Examples\n');
  console.log('=' .repeat(60));

  // Run all examples
  try {
    exampleBrowserIntegration();
    console.log('');

    exampleServerSideRendering();
    console.log('');

    exampleExpressRoute();
    console.log('');

    console.log('=' .repeat(60));
    console.log('\n✓ All examples completed!');
    console.log('Check the generated HTML files in the portable-invoice-viewer folder.');
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Export for use in other modules
module.exports = {
  exampleBrowserIntegration,
  exampleServerSideRendering,
  exampleExpressRoute,
  exampleFromMainAppApi
};
