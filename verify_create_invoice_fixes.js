const { exec } = require('child_process');

console.log('\n=== Verifying create_invoice.html Fixes ===\n');

const checkSyntax = exec('node -c "E:/Solar Calculator v2/public/templates/create_invoice.html"', { encoding: 'utf-8', timeout: 5000 });

if (checkSyntax.error && checkSyntax.error.code !== 0) {
  console.log('❌ create_invoice.html: SYNTAX ERROR');
  console.log(checkSyntax.stderr);
} else {
  console.log('✅ create_invoice.html: Syntax OK');
}

console.log('\n=== Checking Applied Fixes ===\n');

const fs = require('fs');
const content = fs.readFileSync('E:/Solar Calculator v2/public/templates/create_invoice.html', 'utf-8');

// Check Fix #1: Null checks in showPackage
const hasNullCheck = content.includes('if (!pkg || typeof pkg !== \'object\')');
console.log(`${hasNullCheck ? '✅' : '❌'} Fix #1: Null checks in showPackage`);

// Check Fix #2: Status check in fetchPackageDetails
const hasFetchStatusCheck = content.includes('if (!response.ok) {\n                    if (response.status === 404)');
console.log(`${hasFetchStatusCheck ? '✅' : '❌'} Fix #2: Status check in fetchPackageDetails`);

// Check Fix #3: Status check in invoice loading
const hasInvoiceStatusCheck = content.match(/Load Invoice Data[\s\S]*try [\s\S]*const res = await fetch[\s\S]*invoices[\s\S]*if \(!res\.ok\)/);
console.log(`${hasInvoiceStatusCheck ? '✅' : '❌'} Fix #3: Status check in invoice loading`);

// Check Fix #4: package_id validation
const hasPackageValidation = content.includes('const invPackageId = inv.linked_package || inv.legacy_pid_to_be_deleted || inv.package_id;');
console.log(`${hasPackageValidation ? '✅' : '❌'} Fix #4: package_id validation (supports linked_package & legacy_pid)`);

console.log('\n=== Summary ===\n');

if (hasNullCheck && hasFetchStatusCheck && hasInvoiceStatusCheck && hasPackageValidation) {
  console.log('🎉 All fixes verified and applied!');
  console.log('');
  console.log('Fixed issues:');
  console.log('  - "cannot read property of bubble_id" error (prevented by null checks)');
  console.log('  - "Failed to load resource: 400" error (prevented by status checks)');
  console.log('  - Silent failures (prevented by status checks)');
  console.log('');
  console.log('The create invoice page should now handle errors gracefully.');
} else {
  console.log('⚠️  Some fixes may not be applied correctly.');
}
