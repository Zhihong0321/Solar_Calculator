/**
 * Test PDF API with baseUrl Parameter
 */
require('dotenv').config();

// Clean up URL from environment variable (remove all quote types and whitespace)
const rawPdfUrl = process.env.PDF_API_URL || 'https://pdf-gen-production-6c81.up.railway.app';
const PDF_API_URL = rawPdfUrl
  .replace(/[""''""']/g, '') // Remove all quote types (straight, curly, smart)
  .trim(); // Remove whitespace

console.log('='.repeat(80));
console.log('Testing PDF API with baseUrl parameter');
console.log('='.repeat(80));
console.log('');

async function testPdfGeneration() {
  try {
    const testHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { color: #333; }
          .logo { max-width: 200px; }
        </style>
      </head>
      <body>
        <div>
          <h1>Test Invoice with Base URL</h1>
          <p>This is a test PDF generated at ${new Date().toISOString()}</p>
          <p>Total: RM 1,000.00</p>
        </div>
      </body>
      </html>
    `;

    const requestBody = {
      html: testHtml,
      baseUrl: 'https://calculator.atap.solar',
      options: {
        format: 'A4',
        printBackground: true,
        margin: {
          top: '1cm',
          right: '1cm',
          bottom: '1cm',
          left: '1cm'
        }
      }
    };

    console.log('REQUEST BODY:');
    console.log(JSON.stringify(requestBody, null, 2));
    console.log('');
    console.log(`SENDING REQUEST TO: ${PDF_API_URL}/api/generate-pdf`);
    console.log('');

    const response = await fetch(`${PDF_API_URL}/api/generate-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`RESPONSE STATUS: ${response.status} ${response.statusText}`);
    console.log(`RESPONSE HEADERS:`);
    response.headers.forEach((value, key) => {
      console.log(`  ${key}: ${value}`);
    });
    console.log('');

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.log('ERROR RESPONSE BODY:');
      console.log(JSON.stringify(errorData, null, 2));
      console.log('');
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const result = await response.json();

    console.log('SUCCESS RESPONSE BODY:');
    console.log(JSON.stringify(result, null, 2));
    console.log('');

    if (result.success) {
      console.log('✅ PDF Generated Successfully!');
      console.log(`   PDF ID: ${result.pdfId}`);
      console.log(`   Download URL: ${result.downloadUrl}`);
      console.log(`   Expires At: ${result.expiresAt}`);
    } else {
      console.log('❌ PDF Generation Failed!');
      console.log(`   Error: ${result.error}`);
    }

    console.log('');
    console.log('='.repeat(80));

    return result;

  } catch (err) {
    console.error('');
    console.error('❌ ERROR OCCURRED:');
    console.error(`   Message: ${err.message}`);
    console.error(`   Stack: ${err.stack}`);
    console.error('');
    console.error('='.repeat(80));
    throw err;
  }
}

async function testHealthCheck() {
  console.log('TEST 1: Health Check');
  console.log('-'.repeat(40));
  try {
    const response = await fetch(`${PDF_API_URL}/health`);
    const data = await response.json();
    console.log('✅ Health check successful:', data);
  } catch (err) {
    console.error('❌ Health check failed:', err.message);
  }
  console.log('');
}

async function testApiRoot() {
  console.log('TEST 2: API Root');
  console.log('-'.repeat(40));
  try {
    const response = await fetch(PDF_API_URL);
    const data = await response.json();
    console.log('✅ API root successful');
    console.log('   Available endpoints:', Object.keys(data).join(', '));
  } catch (err) {
    console.error('❌ API root check failed:', err.message);
  }
  console.log('');
}

async function testPdfWithoutBaseUrl() {
  console.log('TEST 3: Generate PDF WITHOUT baseUrl');
  console.log('-'.repeat(40));
  try {
    const testHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { color: #333; }
        </style>
      </head>
      <body>
        <h1>Test PDF - No baseUrl</h1>
        <p>Generated at ${new Date().toISOString()}</p>
      </body>
      </html>
    `;

    const response = await fetch(`${PDF_API_URL}/api/generate-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        html: testHtml,
        options: {
          format: 'A4',
          printBackground: true,
          margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' }
        }
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ PDF generated without baseUrl');
      console.log(`   PDF ID: ${result.pdfId}`);
    } else {
      const errorData = await response.json().catch(() => ({}));
      console.log('❌ PDF generation failed without baseUrl');
      console.log(`   Error: ${errorData.error}`);
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
  console.log('');
}

async function testPdfWithBaseUrl() {
  console.log('TEST 4: Generate PDF WITH baseUrl');
  console.log('-'.repeat(40));
  return await testPdfGeneration();
}

// Run all tests
async function runAllTests() {
  await testHealthCheck();
  await testApiRoot();
  await testPdfWithoutBaseUrl();
  await testPdfWithBaseUrl();
}

runAllTests().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
