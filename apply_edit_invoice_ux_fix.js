// Apply UX fix to edit_invoice.html

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'templates', 'edit_invoice.html');

// Read file
let content = fs.readFileSync(filePath, 'utf-8');

console.log('\n=== Applying UX Fix to edit_invoice.html ===\n');

// ============================================================================
// FIX: Improve redirect UX after saving new version
// ============================================================================

console.log('📝 Fix: Updating redirect behavior in edit_invoice.html...');

const oldRedirect = `if (response.ok && result.success) {
      const action = window.isEditMode ? 'updated' : 'created';
      alert(\`Quotation \${action} successfully! New version saved with action logging.\`);
      window.location.href = result.invoice_link;`;

const newRedirect = `if (response.ok && result.success) {
      const action = window.isEditMode ? 'updated' : 'created';
      alert(\`Quotation \${action} successfully! New version saved with action logging.\\n\\nRedirecting to My Quotations...\`);
      setTimeout(() => {
        window.location.href = '/my-invoice';
      }, 1500);`;

if (content.includes(oldRedirect)) {
  content = content.replace(oldRedirect, newRedirect);
  console.log('  ✅ Applied: Redirects to /my-invoice with delay for clarity');
} else {
  console.log('  ⚠️  Could not find redirect code to replace');
  console.log('  Searching for alternative pattern...');
  
  const altPattern = /window\.location\.href = result\.invoice_link;?/g;
  if (altPattern.test(content)) {
    content = content.replace(
      /window\.location\.href = result\.invoice_link;?/g,
      `setTimeout(() => { window.location.href = '/my-invoice'; }, 1500);`
    );
    console.log('  ✅ Applied: Alternative redirect fix');
  }
}

// Write back to file
fs.writeFileSync(filePath, content, 'utf-8');

console.log('\n✅ UX fix applied to edit_invoice.html\n');
console.log('Summary:');
console.log('  - Now redirects to /my-invoice after saving version');
console.log('  - Shows clear message about redirect');
console.log('  - 1.5 second delay for user to read message');
