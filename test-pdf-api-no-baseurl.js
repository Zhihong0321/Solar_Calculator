/**
 * Test PDF API WITHOUT baseUrl Parameter
 */
require('dotenv').config();

// Clean up URL from environment variable (remove all quote types and whitespace)
const rawPdfUrl = process.env.PDF_API_URL || 'https://pdf-gen-production-6c81.up.railway.app';
const PDF_API_URL = rawPdfUrl
  .replace(/[""''""']/g, '') // Remove all quote types (straight, curly, smart)
  .trim(); // Remove whitespace

console.log('='.repeat(80));
console.log('Testing PDF API WITHOUT baseUrl parameter');
console.log('='.repeat(80));
console.log('');

async function testPdfGenerationWithoutBaseUrl() {
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
        <div>
          <h1>Test Invoice - No baseUrl</h1>
          <p>This is a test PDF generated at ${new Date().toISOString()}</p>
          <p>Total: RM 1,000.00</p>
        </div>
      </body>
      </html>
    `;

    const requestBody = {
      html: testHtml,
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

    console.log('REQUEST BODY (NO baseUrl):');
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

testPdfGenerationWithoutBaseUrl().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
