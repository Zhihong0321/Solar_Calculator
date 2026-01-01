/**
 * PDF Generator Module
 * Generates PDF from HTML using html-pdf
 */
const pdf = require('html-pdf');
const fs = require('fs');

/**
 * Generate PDF from HTML
 * @param {string} htmlContent - HTML content
 * @param {object} options - PDF generation options
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generateInvoicePdf(htmlContent, options = {}) {
  return new Promise((resolve, reject) => {
    // PDF options
    const defaultOptions = {
      format: 'A4',
      orientation: 'portrait',
      border: {
        top: '10mm',
        right: '10mm',
        bottom: '10mm',
        left: '10mm'
      },
      type: 'pdf',
      quality: '100',
      ...options
    };

    // Generate PDF
    pdf.create(htmlContent, defaultOptions).toBuffer((err, buffer) => {
      if (err) {
        console.error('Error generating PDF:', err);
        reject(err);
      } else {
        resolve(buffer);
      }
    });
  });
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
