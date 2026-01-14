// Apply /edit-invoice route to invoiceRoutes.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'routes', 'invoiceRoutes.js');

// Read the file
let content = fs.readFileSync(filePath, 'utf-8');

// Find the /create-invoice route and add /edit-invoice after it
const createInvoiceRoute = `router.get('/create-invoice', requireAuth, (req, res) => {
    const templatePath = path.join(__dirname, '..', 'public', 'templates', 'create_invoice.html');
    res.sendFile(templatePath);
});`;

const editInvoiceRoute = `router.get('/create-invoice', requireAuth, (req, res) => {
    const templatePath = path.join(__dirname, '..', 'public', 'templates', 'create_invoice.html');
    res.sendFile(templatePath);
});

/**
 * GET /edit-invoice
 * Invoice edit page - loads existing invoice for editing
 * Protected: Requires authentication
 */
router.get('/edit-invoice', requireAuth, (req, res) => {
    const templatePath = path.join(__dirname, '..', 'public', 'templates', 'edit_invoice.html');
    res.sendFile(templatePath);
});`;

// Apply fix
if (content.includes(createInvoiceRoute)) {
  console.log('✓ Applying FIX: Adding /edit-invoice route...');
  content = content.replace(createInvoiceRoute, editInvoiceRoute);
} else {
  console.log('✗ FIX: Could not find /create-invoice route');
}

// Write back to file
fs.writeFileSync(filePath, content, 'utf-8');
console.log('✓ Applied /edit-invoice route fix to invoiceRoutes.js');
