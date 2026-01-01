/**
 * PDF Generator Module
 * Generates PDF from HTML using Puppeteer
 */
const puppeteer = require('puppeteer');

// PDF Generation Configuration
const PDF_CONFIG = {
  timeout: parseInt(process.env.PDF_GENERATION_TIMEOUT) || 60000, // 60 seconds default
  retries: parseInt(process.env.PDF_GENERATION_RETRIES) || 2,
  browserArgs: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process'
  ],
  pdfOptions: {
    format: 'A4',
    printBackground: true,
    margin: {
      top: '10mm',
      right: '10mm',
      bottom: '10mm',
      left: '10mm'
    },
    preferCSSPageSize: false,
    displayHeaderFooter: false
  }
};

/**
 * Generate PDF from HTML using Puppeteer with retry logic
 * @param {string} htmlContent - HTML content
 * @param {object} options - PDF generation options (overrides defaults)
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generateInvoicePdf(htmlContent, options = {}) {
  let browser = null;
  let lastError = null;
  const maxRetries = PDF_CONFIG.retries;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const startTime = Date.now();
      
      // Launch browser with timeout
      browser = await Promise.race([
        puppeteer.launch({
          headless: true,
          args: PDF_CONFIG.browserArgs
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Browser launch timeout')), 30000)
        )
      ]);

      const page = await browser.newPage();
      
      // Set viewport for consistent rendering
      await page.setViewport({
        width: 1200,
        height: 1600,
        deviceScaleFactor: 2
      });
      
      // Set content with timeout and fallback wait strategy
      try {
        await Promise.race([
          page.setContent(htmlContent, {
            waitUntil: 'networkidle0',
            timeout: 30000
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Content loading timeout')), 30000)
          )
        ]);
      } catch (contentError) {
        // Fallback: try with 'load' instead of 'networkidle0'
        console.warn('Network idle timeout, falling back to load event:', contentError.message);
        await page.setContent(htmlContent, {
          waitUntil: 'load',
          timeout: 15000
        });
        // Wait a bit more for fonts/CSS to render
        await page.waitForTimeout(2000);
      }

      // Merge PDF options
      const pdfOptions = {
        ...PDF_CONFIG.pdfOptions,
        ...options
      };

      // Generate PDF with timeout
      const pdfBuffer = await Promise.race([
        page.pdf(pdfOptions),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('PDF generation timeout')), 30000)
        )
      ]);
      
      const generationTime = Date.now() - startTime;
      console.log(`PDF generated successfully in ${generationTime}ms (attempt ${attempt + 1})`);
      
      return pdfBuffer;
    } catch (err) {
      lastError = err;
      console.error(`PDF generation attempt ${attempt + 1} failed:`, err.message);
      
      // Clean up browser on error
      if (browser) {
        try {
          await browser.close();
        } catch (closeErr) {
          console.error('Error closing browser:', closeErr.message);
        }
        browser = null;
      }
      
      // If not last attempt, wait before retry
      if (attempt < maxRetries) {
        const waitTime = (attempt + 1) * 1000; // Exponential backoff
        console.log(`Retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  // All retries failed
  throw new Error(`PDF generation failed after ${maxRetries + 1} attempts: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Sanitize filename for download
 * @param {string} companyName - Company name
 * @param {string} invoiceNumber - Invoice number
 * @returns {string} Sanitized filename
 */
function sanitizeFilename(companyName, invoiceNumber) {
  // Replace spaces with underscores
  let sanitized = companyName.replace(/\s+/g, '_');

  // Remove invalid filename characters (keep alphanumeric, underscore, hyphen)
  sanitized = sanitized.replace(/[^\w\-]/g, '');

  // Remove multiple consecutive underscores
  sanitized = sanitized.replace(/_+/g, '_');

  // Remove leading/trailing underscores
  sanitized = sanitized.trim('_');

  // Sanitize invoice number similarly
  const sanitizedInvoice = invoiceNumber.replace(/[^\w\-]/g, '');

  // If company name is empty after sanitization, use fallback
  if (!sanitized) {
    sanitized = 'Invoice';
  }

  // Combine and return
  return `${sanitized}_${sanitizedInvoice}.pdf`;
}

module.exports = {
  generateInvoicePdf,
  sanitizeFilename
};
