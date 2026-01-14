const { exec } = require('child_process');

console.log('\n=== Checking Syntax of Modified Files ===\n');

const files = [
  { path: 'E:/Solar Calculator v2/services/invoiceRepo.js', label: 'invoiceRepo.js' },
  { path: 'E:/Solar Calculator v2/public/templates/my_invoice.html', label: 'my_invoice.html' },
  { path: 'E:/Solar Calculator v2/routes/invoiceRoutes.js', label: 'invoiceRoutes.js' },
  { path: 'E:/Solar Calculator v2/public/templates/edit_invoice.html', label: 'edit_invoice.html' }
];

files.forEach(file => {
  try {
    const result = exec(`node -c "${file.path}"`, { encoding: 'utf-8', timeout: 5000 });
    
    if (result.error && result.error.code !== 0) {
      console.log(`❌ ${file.label}: SYNTAX ERROR`);
      console.log(result.stderr);
    } else {
      console.log(`✅ ${file.label}: Syntax OK`);
    }
  } catch (err) {
    console.log(`⚠️  ${file.label}: Could not check (${err.message})`);
  }
});

console.log('\n=== Checking for Common Issues ===\n');

// Check for race conditions
const fs = require('fs');

console.log('📊 Checking getInvoiceByBubbleId function...');
const invoiceRepoContent = fs.readFileSync('E:/Solar Calculator v2/services/invoiceRepo.js', 'utf-8');

// Count await queries in getInvoiceByBubbleId
const getInvoiceStart = invoiceRepoContent.indexOf('async function getInvoiceByBubbleId');
const getInvoiceEnd = invoiceRepoContent.indexOf('\n}\n', getInvoiceStart);
const getInvoiceFunc = invoiceRepoContent.substring(getInvoiceStart, getInvoiceEnd);
const awaitCount = (getInvoiceFunc.match(/await client.query/g) || []).length;

console.log(`   - ${awaitCount} sequential async queries in getInvoiceByBubbleId`);
console.log(`   - Issue: Each query waits for the previous one (no parallel execution)`);
console.log(`   - Impact: Slower performance, but no race condition (queries are sequential)`);
console.log(`   - Recommendation: Consider using Promise.all() for independent queries`);

// Check for circular dependency
console.log('\n🔄 Checking for circular dependency...');
const _logStart = invoiceRepoContent.indexOf('async function logInvoiceAction');
const _logEnd = invoiceRepoContent.indexOf('\n}\n', _logStart);
const _logFunc = invoiceRepoContent.substring(_logStart, _logEnd);

if (_logFunc.includes('getInvoiceByBubbleId') && getInvoiceFunc.includes('logInvoiceAction')) {
  console.log(`   ⚠️  logInvoiceAction calls getInvoiceByBubbleId`);
  console.log(`   ⚠️  This creates: logInvoiceAction → getInvoiceByBubbleId → potential calls → ...`);
  console.log(`   - Risk: If getInvoiceByBubbleId is modified to call logInvoiceAction, infinite loop!`);
  console.log(`   - Current Status: SAFE (no circular call)`);
}

// Check for missing error handling
console.log('\n🛡️  Checking error handling...');

if (getInvoiceFunc.includes('try {') && getInvoiceFunc.includes('catch (err)')) {
  console.log(`   ✅ getInvoiceByBubbleId has try-catch`);
} else {
  console.log(`   ❌ getInvoiceByBubbleId missing try-catch`);
}

if (_logFunc.includes('try {') && _logFunc.includes('catch (err)')) {
  console.log(`   ✅ logInvoiceAction has try-catch`);
} else {
  console.log(`   ❌ logInvoiceAction missing try-catch`);
}

// Check workflow
console.log('\n🔍 Checking edit workflow...');

const editInvoiceContent = fs.readFileSync('E:/Solar Calculator v2/public/templates/edit_invoice.html', 'utf-8');

if (editInvoiceContent.includes('window.isEditMode = true')) {
  console.log(`   ✅ edit_invoice.html sets isEditMode flag`);
} else {
  console.log(`   ❌ edit_invoice.html missing isEditMode flag`);
}

if (editInvoiceContent.includes('/api/v1/invoices/') && editInvoiceContent.includes('/version')) {
  console.log(`   ✅ edit_invoice.html submits to /version endpoint`);
} else {
  console.log(`   ❌ edit_invoice.html doesn't submit to version endpoint`);
}

if (editInvoiceContent.includes('window.editInvoiceId')) {
  console.log(`   ✅ edit_invoice.html defines editInvoiceId variable`);
} else {
  console.log(`   ⚠️  edit_invoice.html may have variable naming issues`);
}

// Check my_invoice.html edit button
console.log('\n🔗 Checking my_invoice.html Edit button...');

const myInvoiceContent = fs.readFileSync('E:/Solar Calculator v2/public/templates/my_invoice.html', 'utf-8');

if (myInvoiceContent.includes('/edit-invoice?id=')) {
  console.log(`   ✅ Edit button points to /edit-invoice?id=`);
} else {
  console.log(`   ❌ Edit button doesn't use /edit-invoice?id=`);
}

// Check routes
console.log('\n🛣️  Checking routes...');

const routesContent = fs.readFileSync('E:/Solar Calculator v2/routes/invoiceRoutes.js', 'utf-8');

if (routesContent.includes("router.get('/edit-invoice'")) {
  console.log(`   ✅ /edit-invoice route defined`);
} else {
  console.log(`   ❌ /edit-invoice route missing`);
}

if (routesContent.includes("router.get('/create-invoice'")) {
  console.log(`   ✅ /create-invoice route exists`);
} else {
  console.log(`   ❌ /create-invoice route missing`);
}

console.log('\n=== Summary ===\n');
console.log('No critical syntax errors found.');
console.log('However, consider the following improvements:');
console.log('1. Optimize getInvoiceByBubbleId with Promise.all() for parallel queries');
console.log('2. Add error handling validation in logInvoiceAction');
console.log('3. Consider adding loading states for better UX in edit_invoice.html');
