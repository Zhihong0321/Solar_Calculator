// Apply fixes to my_invoice.html

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'templates', 'my_invoice.html');

// Read the file
let content = fs.readFileSync(filePath, 'utf-8');

// FIX: Update Edit button to use /edit-invoice route
const oldEditButton = `onclick="window.location.href='/create-invoice?edit_invoice_id=\${inv.bubble_id}'" class="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded text-sm">Edit</button>`;

const newEditButton = `onclick="window.location.href='/edit-invoice?id=\${inv.bubble_id}'" class="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded text-sm">Edit</button>`;

if (content.includes(oldEditButton)) {
  console.log('✓ Applying FIX: Updating Edit button in my_invoice.html...');
  content = content.replace(oldEditButton, newEditButton);
} else {
  console.log('✗ FIX: Could not find Edit button to replace');
  // Try to find the button without full class
  if (content.includes("/create-invoice?edit_invoice_id=")) {
    console.log('  Found similar pattern, trying simple replace...');
    content = content.replace(
      /window\.location\.href='\/create-invoice\?edit_invoice_id=\$\{inv\.bubble_id\}'/g,
      "window.location.href='/edit-invoice?id=${inv.bubble_id}'"
    );
  }
}

// Write back to file
fs.writeFileSync(filePath, content, 'utf-8');
console.log('✓ Applied fix to my_invoice.html');
