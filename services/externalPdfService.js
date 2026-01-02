/**
 * External PDF Generation Service
 * Integrates with external PDF API server to generate PDFs
 */

require('dotenv').config();

// Clean up URL from environment variable (remove all quote types and whitespace)
const rawPdfUrl = process.env.PDF_API_URL || 'https://your-app.railway.app';
const PDF_API_URL = rawPdfUrl
  .replace(/[""''""']/g, '') // Remove all quote types (straight, curly, smart)
  .trim(); // Remove whitespace

// Debug: Log the final URL
console.log('[PDF Service] PDF_API_URL after cleaning:', JSON.stringify(PDF_API_URL));

/**
 * Generate PDF from HTML using external API
 * @param {string} html - HTML content to convert to PDF
 * @param {object} options - PDF generation options
 * @returns {Promise<object>} PDF generation result
 */
async function generatePdf(html, options = {}) {
  try {
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        html,
        options: {
          format: options.format || 'A4',
          printBackground: options.printBackground !== false,
          margin: options.margin || {
            top: '1cm',
            right: '1cm',
            bottom: '1cm',
            left: '1cm'
          },
          preferCSSPageSize: options.preferCSSPageSize !== true
        }
      })
    };

    console.log(`[PDF Service] Generating PDF via ${PDF_API_URL}/api/generate-pdf`);

    const response = await fetch(`${PDF_API_URL}/api/generate-pdf`, requestOptions);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`[PDF Service] API error: ${response.status}`, errorData);
      throw new Error(errorData.error || `PDF generation failed with status ${response.status}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'PDF generation failed');
    }

    console.log(`[PDF Service] PDF generated successfully: ${result.pdfId}`);
    console.log(`[PDF Service] Download URL: ${result.downloadUrl}`);
    console.log(`[PDF Service] Download URL starts with https://: ${result.downloadUrl.startsWith('https://')}`);
    console.log(`[PDF Service] Expires at: ${result.expiresAt}`);

    // Validate download URL has protocol
    let downloadUrl = result.downloadUrl;
    if (!downloadUrl.startsWith('http://') && !downloadUrl.startsWith('https://')) {
      console.warn(`[PDF Service] Download URL missing protocol, adding https://`);
      downloadUrl = 'https://' + downloadUrl;
    }

    return {
      success: true,
      pdfId: result.pdfId,
      downloadUrl: downloadUrl,
      expiresAt: result.expiresAt
    };
  } catch (err) {
    console.error('[PDF Service] Error generating PDF:', err.message);
    throw err;
  }
}

/**
 * Generate PDF with retry logic
 * @param {string} html - HTML content to convert to PDF
 * @param {object} options - PDF generation options
 * @param {number} maxRetries - Maximum number of retry attempts
 * @returns {Promise<object>} PDF generation result
 */
async function generatePdfWithRetry(html, options = {}, maxRetries = 2) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[PDF Service] Attempt ${attempt}/${maxRetries}`);
      return await generatePdf(html, options);
    } catch (err) {
      lastError = err;
      console.error(`[PDF Service] Attempt ${attempt} failed:`, err.message);

      if (attempt < maxRetries) {
        const delayMs = attempt * 1000;
        console.log(`[PDF Service] Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  console.error(`[PDF Service] All ${maxRetries} attempts failed`);
  throw lastError;
}

module.exports = {
  generatePdf,
  generatePdfWithRetry
};
