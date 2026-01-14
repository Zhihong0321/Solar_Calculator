# Portable Invoice Viewer

A self-contained HTML template for rendering Invoice/Quotation documents. Other applications can use this template to display invoices by injecting invoice data.

## Files

- `invoice-template.html` - Main invoice template file
- `example-integration.js` - Example integration code
- `README.md` - This documentation

## Invoice Data Structure

The template expects an invoice object with the following structure:

```javascript
{
  // Invoice Details
  invoice_number: 'INV-000001',
  invoice_date: '2026-01-12',
  due_date: '2026-02-11',
  status: 'Draft',

  // Customer Information (from snapshot)
  customer_name_snapshot: 'John Doe',
  customer_address_snapshot: '123 Main Street\nCity, State 12345',
  customer_phone_snapshot: '+60 12-345-6789',
  customer_email_snapshot: 'john@example.com',

  // Financial Totals
  subtotal: 15000.00,
  discount_amount: 500.00,
  voucher_amount: 0.00,
  sst_amount: 900.00,
  sst_rate: 6,
  total_amount: 16400.00,

  // Invoice Items
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

  // Metadata
  created_by_user_name: 'Sales Agent',

  // Template Data (Company Info)
  template: {
    company_name: 'Atap Solar',
    company_address: '1-2-3 Business Park,\nKL, Malaysia',
    company_phone: '+60 3-1234-5678',
    company_email: 'info@atapsolar.com',
    logo_url: '/logo-08.png',

    // Payment Details
    bank_name: 'Maybank',
    bank_account_no: '1234567890123',
    bank_account_name: 'Atap Solar Sdn Bhd',

    // Optional
    terms_and_conditions: '1. Payment due in 30 days.\n2. Goods not returnable.',
    sst_registration_no: 'SSR123456789'
  }
}
```

## Integration Methods

### Method 1: Global Variable (Simplest)

Set `window.invoiceData` before loading the template:

```javascript
// Set the global variable
window.invoiceData = {
  invoice_number: 'INV-000001',
  // ... (rest of invoice data)
};

// Load the template
document.body.innerHTML = htmlTemplate; // or use fetch/require
```

### Method 2: Direct Function Call

Call `renderInvoice()` directly with the data:

```javascript
// After template is loaded in DOM
renderInvoice(invoiceData);
```

### Method 3: Server-Side Rendering (Node.js)

```javascript
const fs = require('fs');
const invoiceTemplate = fs.readFileSync('./invoice-template.html', 'utf8');

function renderInvoiceHtml(invoiceData) {
  let html = invoiceTemplate;

  // Replace placeholders with actual data
  html = html.replace(/{{INVOICE_NUMBER}}/g, invoiceData.invoice_number || 'N/A');
  html = html.replace(/{{COMPANY_NAME}}/g, invoiceData.template?.company_name || 'Your Company');
  html = html.replace(/{{STATUS}}/g, invoiceData.status || 'Draft');
  html = html.replace(/{{TOTAL_AMOUNT}}/g, (invoiceData.total_amount || 0).toFixed(2));

  // ... (replace all other placeholders)

  // Render items
  const itemsHtml = invoiceData.items.map(item => {
    // Generate item HTML
    return `<div class="...">${item.description}</div>`;
  }).join('');

  html = html.replace(
    /<div class="divide-y.*" id="invoice-items">[\s\S]*?<\/div>/,
    `<div class="divide-y divide-slate-100 border-b border-slate-100">${itemsHtml}</div>`
  );

  return html;
}
```

## Using with Different Data Sources

### From PostgreSQL Database

```javascript
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: 'postgres://...' });
const template = fs.readFileSync('./invoice-template.html', 'utf8');

async function getInvoiceHtml(shareToken) {
  const client = await pool.connect();

  // Fetch invoice
  const invoiceResult = await client.query(
    `SELECT * FROM invoice_new WHERE share_token = $1`,
    [shareToken]
  );

  const invoice = invoiceResult.rows[0];

  // Fetch items
  const itemsResult = await client.query(
    `SELECT * FROM invoice_new_item WHERE invoice_id = $1`,
    [invoice.bubble_id]
  );

  invoice.items = itemsResult.rows;

  // Fetch template
  const templateResult = await client.query(
    `SELECT * FROM invoice_template WHERE is_default = true LIMIT 1`
  );

  invoice.template = templateResult.rows[0] || {};

  client.release();

  // Render
  return renderInvoiceHtml(invoice);
}
```

### From API Endpoint

```javascript
async function renderInvoiceFromApi(shareToken) {
  // Fetch invoice data from your main app's API
  const response = await fetch(`https://your-app.com/api/invoices/${shareToken}`);
  const invoiceData = await response.json();

  // Set global variable and load template
  window.invoiceData = invoiceData;
  document.body.innerHTML = templateHtml; // Load template
}
```

## Customization

### Change Styling

The template uses Tailwind CSS from CDN. You can:
1. Modify Tailwind config in the `<script>` tag
2. Add custom CSS in the `<style>` tag
3. Replace CDN with your own CSS

### Add Custom Fields

1. Add `{{CUSTOM_FIELD}}` placeholder in HTML
2. Replace it in `renderInvoice()` function:
   ```javascript
   replacePlaceholder('CUSTOM_FIELD', invoiceData.custom_field || '');
   ```

### Remove Print Button

Remove the `<div id="action-buttons">` section or add `style="display: none;"`

## Print/PDF Export

The template includes a Print button that calls `window.print()`. To generate PDF:

1. Use browser's print dialog (Save as PDF)
2. Use a PDF library like `puppeteer` or `html-pdf` (Node.js)
3. Use an external PDF service

Example with Puppeteer:
```javascript
const puppeteer = require('puppeteer');

async function generatePdf(invoiceHtml) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.setContent(invoiceHtml, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({ format: 'A4', printBackground: true });

  await browser.close();
  return pdf;
}
```

## Responsive Design

The template is mobile-optimized with:
- Responsive layout (mobile-first approach)
- Flexible typography
- Touch-friendly elements
- Print-optimized styles

## License

This template is provided for integration into other applications.
