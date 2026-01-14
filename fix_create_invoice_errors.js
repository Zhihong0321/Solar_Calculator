// Fixes for invoice creation errors

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'templates', 'create_invoice.html');

// Read file
let content = fs.readFileSync(filePath, 'utf-8');

console.log('\n=== Fixing Invoice Creation Errors ===\n');

// ============================================================================
// FIX #1: Handle undefined package in showPackage
// ============================================================================

console.log('📝 Fix #1: Adding null checks in showPackage function...');

const oldShowPackage = `        function showPackage(pkg) {
            const packageInfo = document.getElementById('quotationFormContainer');
            packageInfo.classList.remove('hidden');
            
            document.getElementById('packageNameDisplay').textContent = pkg.name || pkg.invoice_desc || \`Package \${pkg.bubble_id}\`;
            document.getElementById('packagePriceDisplay').textContent = \`RM \${(parseFloat(pkg.price) || 0).toFixed(2)}\`;
            
            document.getElementById('packagePrice').value = pkg.price || 0;
            document.getElementById('packageName').value = pkg.name || pkg.invoice_desc || \`Package \${pkg.bubble_id}\`;
            document.getElementById('packageIdHidden').value = pkg.bubble_id;`;

const newShowPackage = `        function showPackage(pkg) {
            const packageInfo = document.getElementById('quotationFormContainer');
            packageInfo.classList.remove('hidden');
            
            // Safety check for null/undefined pkg
            if (!pkg) {
                showError('⚠️ Package data is missing. Please try again.');
                document.getElementById('packageIdForm').classList.remove('hidden');
                packageInfo.classList.add('hidden');
                return;
            }

            document.getElementById('packageNameDisplay').textContent = pkg.name || pkg.invoice_desc || \`Package \${pkg.bubble_id}\`;
            document.getElementById('packagePriceDisplay').textContent = \`RM \${(parseFloat(pkg.price) || 0).toFixed(2)}\`;
            
            document.getElementById('packagePrice').value = pkg.price || 0;
            document.getElementById('packageName').value = pkg.name || pkg.invoice_desc || \`Package \${pkg.bubble_id}\`;
            document.getElementById('packageIdHidden').value = pkg.bubble_id;`;

if (content.includes(oldShowPackage)) {
  content = content.replace(oldShowPackage, newShowPackage);
  console.log('  ✅ Applied: Added null checks in showPackage');
} else {
  console.log('  ⚠️  Could not find showPackage function');
}

// ============================================================================
// FIX #2: Check API response status before parsing
// ============================================================================

console.log('📝 Fix #2: Adding status check in fetchPackageDetails...');

const oldFetchPackage = `        async function fetchPackageDetails(packageId) {
            try {
                const response = await fetch(\`/api/package/\${packageId}\`);
                const result = await response.json();

                if (result.success && result.package) {
                    showPackage(result.package);
                } else {
                    showError(\`⚠️ Package Not Found: The Package ID '\${packageId}' does not exist in database.\`);
                    document.getElementById('packageIdForm').classList.remove('hidden');
                }
            } catch (err) {
                console.error('Error fetching package:', err);
                showError(\`⚠️ Database Error: Failed to check package. Error: \${err.message}\`);
                document.getElementById('packageIdForm').classList.remove('hidden');
            }
        }`;

const newFetchPackage = `        async function fetchPackageDetails(packageId) {
            try {
                const response = await fetch(\`/api/package/\${packageId}\`);

                // Check response status before parsing
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

                if (result.success && result.package) {
                    showPackage(result.package);
                } else {
                    showError(\`⚠️ Package Not Found: The Package ID '\${packageId}' does not exist in database.\`);
                    document.getElementById('packageIdForm').classList.remove('hidden');
                }
            } catch (err) {
                console.error('Error fetching package:', err);
                showError(\`⚠️ Database Error: Failed to check package. Error: \${err.message}\`);
                document.getElementById('packageIdForm').classList.remove('hidden');
            }
        }`;

if (content.includes(oldFetchPackage)) {
  content = content.replace(oldFetchPackage, newFetchPackage);
  console.log('  ✅ Applied: Added status check in fetchPackageDetails');
} else {
  console.log('  ⚠️  Could not find fetchPackageDetails function');
}

// ============================================================================
// FIX #3: Handle failed invoice loading in edit mode
// ============================================================================

console.log('📝 Fix #3: Adding error handling for invoice loading...');

const oldInvoiceLoad = `                // Load Invoice Data
                try {
                    const res = await fetch(\`/api/v1/invoices/\${editInvoiceId}\`);
                    const json = await res.json();
                    
                    if (json.success && json.data) {
                        const inv = json.data;
                        
                        // 1. Load Package
                        if (inv.package_id) {
                            await fetchPackageDetails(inv.package_id);
                        }`;

const newInvoiceLoad = `                // Load Invoice Data
                try {
                    const res = await fetch(\`/api/v1/invoices/\${editInvoiceId}\`);

                    // Check response status before parsing
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

                    if (json.success && json.data) {
                        const inv = json.data;

                        // 1. Load Package (check if package_id is valid string)
                        if (inv.package_id && typeof inv.package_id === 'string' && inv.package_id.length > 0) {
                            try {
                                await fetchPackageDetails(inv.package_id);
                            } catch (pkgErr) {
                                console.error('Failed to load package:', pkgErr);
                                showWarning(\`⚠️ Failed to load package '\${inv.package_id}'. You may need to select a different package.\`);
                            }
                        } else {
                            showWarning(\`⚠️ This invoice doesn't have a package. Please select a package manually.\`);
                            document.getElementById('packageIdForm').classList.remove('hidden');
                        }`;

if (content.includes(oldInvoiceLoad)) {
  content = content.replace(oldInvoiceLoad, newInvoiceLoad);
  console.log('  ✅ Applied: Added status check in invoice loading');
} else {
  console.log('  ⚠️  Could not find invoice loading code');
}

// Write back to file
fs.writeFileSync(filePath, content, 'utf-8');

console.log('\n✅ All fixes applied to create_invoice.html\n');
console.log('Summary:');
console.log('  - Added null checks in showPackage function');
console.log('  - Added status check in fetchPackageDetails');
console.log('  - Added status check in invoice loading');
console.log('  - Added package_id validation before loading package');
console.log('\nThese fixes prevent the "cannot read property of bubble id" error.');
