// Fixes for invoice creation errors

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'templates', 'create_invoice.html');

// Read file
let content = fs.readFileSync(filePath, 'utf-8');

console.log('\n=== Fixing Invoice Creation Errors ===\n');

// ============================================================================
// FIX #1: Add null checks in showPackage function
// ============================================================================

console.log('📝 Fix #1: Adding null checks in showPackage function...');

const oldShowPackageCheck = `        function showPackage(pkg) {
            const packageInfo = document.getElementById('quotationFormContainer');
            packageInfo.classList.remove('hidden');
            
            document.getElementById('packageNameDisplay').textContent = pkg.name || pkg.invoice_desc || \`Package \${pkg.bubble_id}\`;`;

const newShowPackageCheck = `        function showPackage(pkg) {
            const packageInfo = document.getElementById('quotationFormContainer');
            packageInfo.classList.remove('hidden');

            // Safety check for null/undefined pkg
            if (!pkg || typeof pkg !== 'object') {
                showError('⚠️ Package data is missing or invalid. Please try again.');
                document.getElementById('packageIdForm').classList.remove('hidden');
                packageInfo.classList.add('hidden');
                return;
            }

            document.getElementById('packageNameDisplay').textContent = pkg.name || pkg.invoice_desc || \`Package \${pkg.bubble_id}\`;`;

if (content.includes(oldShowPackageCheck)) {
  content = content.replace(oldShowPackageCheck, newShowPackageCheck);
  console.log('  ✅ Applied: Added null checks in showPackage');
} else {
  console.log('  ⚠️  Could not find showPackage function start');
}

// ============================================================================
// FIX #2: Add status check in fetchPackageDetails
// ============================================================================

console.log('📝 Fix #2: Adding status check in fetchPackageDetails...');

const oldFetchCheck = `        async function fetchPackageDetails(packageId) {
            try {
                const response = await fetch(\`/api/package/\${packageId}\`);
                const result = await response.json();

                if (result.success && result.package) {`;

const newFetchCheck = `        async function fetchPackageDetails(packageId) {
            try {
                const response = await fetch(\`/api/package/\${packageId}\`);

                // Check response status before parsing JSON
                if (!response.ok) {
                    if (response.status === 404) {
                        showError(\`⚠️ Package Not Found: The Package ID '\${packageId}' does not exist in database.\`);
                    } else if (response.status === 400) {
                        showError(\`⚠️ Invalid Package ID: '\${packageId}' is not a valid ID format.\`);
                    } else {
                        showError(\`⚠️ Server Error: Failed to fetch package. Status: \${response.status}\`);
                    }
                    document.getElementById('packageIdForm').classList.remove('hidden');
                    return;
                }

                const result = await response.json();

                if (result.success && result.package) {`;

if (content.includes(oldFetchCheck)) {
  content = content.replace(oldFetchCheck, newFetchCheck);
  console.log('  ✅ Applied: Added status check in fetchPackageDetails');
} else {
  console.log('  ⚠️  Could not find fetchPackageDetails function');
}

// ============================================================================
// FIX #3: Add status check in invoice loading (edit mode)
// ============================================================================

console.log('📝 Fix #3: Adding status check in invoice loading...');

const oldInvoiceLoadCheck = `                // Load Invoice Data
                try {
                    const res = await fetch(\`/api/v1/invoices/\${editInvoiceId}\`);
                    const json = await res.json();

                    if (json.success && json.data) {`;

const newInvoiceLoadCheck = `                // Load Invoice Data
                try {
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
                        window.isEditMode = false; // Reset to create mode
                        window.editInvoiceId = null;
                        return;
                    }

                    const json = await res.json();

                    if (json.success && json.data) {`;

if (content.includes(oldInvoiceLoadCheck)) {
  content = content.replace(oldInvoiceLoadCheck, newInvoiceLoadCheck);
  console.log('  ✅ Applied: Added status check in invoice loading');
} else {
  console.log('  ⚠️  Could not find invoice loading code');
}

// ============================================================================
// FIX #4: Add validation for package identifier before calling fetchPackageDetails
// ============================================================================

console.log('📝 Fix #4: Adding package identifier validation in invoice loading...');

const oldPackageCheck = `                        // 1. Load Package
                        if (inv.linked_package || inv.legacy_pid_to_be_deleted || inv.package_id) {
                            await fetchPackageDetails(inv.linked_package || inv.legacy_pid_to_be_deleted || inv.package_id);
                        }`;

const newPackageCheck = `                        // 1. Load Package (with validation)
                        const packageId = inv.linked_package || inv.legacy_pid_to_be_deleted || inv.package_id;
                        if (packageId && typeof packageId === 'string' && packageId.length > 0) {
                            try {
                                await fetchPackageDetails(packageId);
                            } catch (pkgErr) {
                                console.error('Failed to load package:', pkgErr);
                                showWarning(\`⚠️ Failed to load package '\${packageId}'. You may need to select a different package manually.\`);
                                document.getElementById('packageIdForm').classList.remove('hidden');
                            }
                        } else {
                            // No package in invoice, show package selector
                            showWarning(\`⚠️ This invoice doesn't have a package. Please select a package manually to continue.\`);
                            document.getElementById('packageIdForm').classList.remove('hidden');
                        }`;

if (content.includes(oldPackageCheck)) {
  content = content.replace(oldPackageCheck, newPackageCheck);
  console.log('  ✅ Applied: Added package_id validation');
} else {
  console.log('  ⚠️  Could not find package loading code');
}

// Write back to file
fs.writeFileSync(filePath, content, 'utf-8');

console.log('\n✅ All fixes applied to create_invoice.html\n');
console.log('Summary:');
console.log('  - Added null checks in showPackage (prevents bubble_id error)');
console.log('  - Added status checks in fetchPackageDetails (handles 400/404)');
console.log('  - Added status checks in invoice loading (handles 400/403/404)');
console.log('  - Added package_id validation (prevents undefined fetch)');
console.log('\nThese fixes prevent:');
console.log('  - "cannot read property of bubble_id" error');
console.log('  - "Failed to load resource: 400" error');
console.log('  - Silent failures when API returns error status');
