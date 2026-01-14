// Add status check for invoice loading

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'templates', 'create_invoice.html');

// Read file
let content = fs.readFileSync(filePath, 'utf-8');

console.log('\n=== Adding Status Check to Invoice Loading ===\n');

// Find the invoice loading fetch call
const target = `                try {
                    const res = await fetch(\`/api/v1/invoices/\${editInvoiceId}\`);
                    const json = await res.json();`;

const replacement = `                try {
                    const res = await fetch(\`/api/v1/invoices/\${editInvoiceId}\`);

                    // Check response status before parsing JSON
                    if (!res.ok) {
                        if (res.status === 404) {
                            showError(\`⚠️ Invoice Not Found: The invoice '\${editInvoiceId}' does not exist.\`);
                        } else if (res.status === 403) {
                            showError(\`⚠️ Access Denied: You don't have permission to edit this invoice.\`);
                        } else if (res.status === 400) {
                            showError(\`⚠️ Bad Request: '\${editInvoiceId}' is not a valid invoice ID.\`);
                        } else {
                            showError(\`⚠️ Server Error: Failed to load invoice. Status: \${res.status}\`);
                        }
                        document.getElementById('packageIdForm').classList.remove('hidden');
                        window.isEditMode = false;
                        window.editInvoiceId = null;
                        return;
                    }

                    const json = await res.json();`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  console.log('✅ Added: Status check in invoice loading (handles 400/403/404)');
} else {
  console.log('⚠️  Could not find invoice loading code');
}

// Write back to file
fs.writeFileSync(filePath, content, 'utf-8');

console.log('\n✅ Fix applied to create_invoice.html\n');
console.log('This fix prevents errors when:');
console.log('  - Invoice ID is invalid (400 error)');
console.log('  - Invoice not found (404 error)');
console.log('  - Access denied (403 error)');
