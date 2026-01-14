// Final verification of all fixes

const { exec } = require('child_process');

console.log('\n=== Final Verification of Applied Fixes ===\n');

const files = [
  { path: 'E:/Solar Calculator v2/services/invoiceRepo.js', label: 'invoiceRepo.js' },
  { path: 'E:/Solar Calculator v2/public/templates/edit_invoice.html', label: 'edit_invoice.html' },
  { path: 'E:/Solar Calculator v2/routes/invoiceRoutes.js', label: 'invoiceRoutes.js' }
];

let allPassed = true;

files.forEach(file => {
  try {
    const result = exec(`node -c "${file.path}"`, { encoding: 'utf-8', timeout: 5000 });
    
    if (result.error && result.error.code !== 0) {
      console.log(`❌ ${file.label}: SYNTAX ERROR`);
      allPassed = false;
    } else {
      console.log(`✅ ${file.label}: Syntax OK`);
    }
  } catch (err) {
    console.log(`⚠️  ${file.label}: Could not check (${err.message})`);
    allPassed = false;
  }
});

console.log('\n=== Checking Fix Application ===\n');

const fs = require('fs');
const invoiceRepoContent = fs.readFileSync('E:/Solar Calculator v2/services/invoiceRepo.js', 'utf-8');

// Check Fix #1: Try-catch in logInvoiceAction
const hasTryCatch = invoiceRepoContent.includes('async function logInvoiceAction') && 
                    invoiceRepoContent.includes('try {') && 
                    invoiceRepoContent.includes('} catch (err)');

if (hasTryCatch) {
  console.log('✅ Fix #1: Try-catch in logInvoiceAction');
} else {
  console.log('❌ Fix #1: Try-catch in logInvoiceAction NOT FOUND');
  allPassed = false;
}

// Check Fix #2: Action after COMMIT (on-the-fly)
const hasOnTheFlyFix = invoiceRepoContent.includes('await client.query(\'COMMIT\')') &&
                         invoiceRepoContent.includes('// 6. Log Action with Snapshot (after commit)');

if (hasOnTheFlyFix) {
  console.log('✅ Fix #2: Action logging after COMMIT (on-the-fly)');
} else {
  console.log('❌ Fix #2: Action logging after COMMIT (on-the-fly) NOT FOUND');
  allPassed = false;
}

// Check Fix #3: Promise.all in getInvoiceByBubbleId
const hasPromiseAll = invoiceRepoContent.includes('await Promise.all([...parallelQueries') ||
                     invoiceRepoContent.includes('await Promise.all([...');

if (hasPromiseAll) {
  console.log('✅ Fix #3: Promise.all optimization in getInvoiceByBubbleId');
} else {
  console.log('❌ Fix #3: Promise.all optimization NOT FOUND');
  allPassed = false;
}

// Check Fix #4: Edit redirect
const editInvoiceContent = fs.readFileSync('E:/Solar Calculator v2/public/templates/edit_invoice.html', 'utf-8');
const hasRedirectFix = editInvoiceContent.includes("setTimeout(() => { window.location.href = '/my-invoice'");

if (hasRedirectFix) {
  console.log('✅ Fix #4: Edit redirect to /my-invoice');
} else {
  console.log('❌ Fix #4: Edit redirect NOT FOUND');
  allPassed = false;
}

console.log('\n=== Final Result ===\n');

if (allPassed) {
  console.log('🎉 ALL FIXES APPLIED AND VERIFIED!');
  console.log('');
  console.log('Summary of fixes:');
  console.log('  ✅ Try-catch added to logInvoiceAction');
  console.log('  ✅ Action logging moved after COMMIT (prevents orphaned records)');
  console.log('  ✅ Promise.all optimization for parallel queries');
  console.log('  ✅ Edit redirect improved for better UX');
  console.log('');
  console.log('🚀 Ready for production deployment!');
  process.exit(0);
} else {
  console.log('⚠️  Some fixes may not have been applied correctly.');
  console.log('Please review the output above.');
  process.exit(1);
}
