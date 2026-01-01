/**
 * PDF Resource Utilities
 * Handles downloading and embedding external resources for PDF generation
 */
const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * Download resource and convert to base64
 * @param {string} url - Resource URL
 * @param {number} timeout - Timeout in milliseconds (default: 10000)
 * @returns {Promise<string>} Base64 encoded resource
 */
async function downloadAsBase64(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (!url || !url.startsWith('http')) {
      return reject(new Error('Invalid URL'));
    }

    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const request = client.get(url, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadAsBase64(response.headers.location, timeout)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode !== 200) {
        return reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
      }

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const base64 = buffer.toString('base64');
        const contentType = response.headers['content-type'] || 'application/octet-stream';
        resolve(`data:${contentType};base64,${base64}`);
      });
    });

    request.on('error', (err) => {
      reject(new Error(`Download failed: ${err.message}`));
    });

    request.setTimeout(timeout, () => {
      request.destroy();
      reject(new Error('Download timeout'));
    });
  });
}

/**
 * Get Inter font CSS with embedded fonts
 * Downloads Inter font files and embeds them as base64
 * @returns {Promise<string>} CSS with embedded fonts
 */
async function getInterFontCSS() {
  try {
    // Inter font URLs from Google Fonts
    const fontUrls = {
      'Inter-Regular': 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2',
      'Inter-Medium': 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2',
      'Inter-SemiBold': 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2',
      'Inter-Bold': 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2'
    };

    // For now, use system fonts as fallback
    // Full font embedding would require downloading multiple font files
    // This is a simplified version that uses system fonts
    return `
      @font-face {
        font-family: 'Inter';
        font-style: normal;
        font-weight: 400;
        font-display: swap;
        src: local('Inter Regular'), local('Inter-Regular'), 
             -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      @font-face {
        font-family: 'Inter';
        font-style: normal;
        font-weight: 500;
        font-display: swap;
        src: local('Inter Medium'), local('Inter-Medium'),
             -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      @font-face {
        font-family: 'Inter';
        font-style: normal;
        font-weight: 600;
        font-display: swap;
        src: local('Inter SemiBold'), local('Inter-SemiBold'),
             -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      @font-face {
        font-family: 'Inter';
        font-style: normal;
        font-weight: 700;
        font-display: swap;
        src: local('Inter Bold'), local('Inter-Bold'),
             -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
    `;
  } catch (err) {
    console.warn('Failed to load Inter fonts, using system fonts:', err.message);
    return ''; // Fallback to system fonts
  }
}

/**
 * Download image and convert to base64 data URL
 * @param {string} imageUrl - Image URL
 * @returns {Promise<string>} Base64 data URL or empty string if fails
 */
async function downloadImageAsBase64(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith('http')) {
    return imageUrl; // Return as-is if not HTTP URL
  }

  try {
    const base64 = await downloadAsBase64(imageUrl, 10000);
    return base64;
  } catch (err) {
    console.warn(`Failed to download image ${imageUrl}:`, err.message);
    return ''; // Return empty string on failure (image won't display)
  }
}

/**
 * Get minimal TailwindCSS utilities for PDF
 * Returns essential TailwindCSS classes needed for invoice layout
 * This is a simplified version - full TailwindCSS would be too large
 */
function getMinimalTailwindCSS() {
  return `
    /* Minimal TailwindCSS utilities for PDF */
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    .flex { display: flex; }
    .flex-col { flex-direction: column; }
    .flex-row { flex-direction: row; }
    .flex-1 { flex: 1 1 0%; }
    .flex-wrap { flex-wrap: wrap; }
    .items-start { align-items: flex-start; }
    .items-end { align-items: flex-end; }
    .items-center { align-items: center; }
    .items-baseline { align-items: baseline; }
    .justify-between { justify-content: space-between; }
    .justify-end { justify-content: flex-end; }
    .justify-center { justify-content: center; }
    
    .gap-1 { gap: 0.25rem; }
    .gap-2 { gap: 0.5rem; }
    .gap-3 { gap: 0.75rem; }
    .gap-4 { gap: 1rem; }
    .gap-6 { gap: 1.5rem; }
    
    .space-y-1 > * + * { margin-top: 0.25rem; }
    .space-y-2 > * + * { margin-top: 0.5rem; }
    .space-y-3 > * + * { margin-top: 0.75rem; }
    .space-y-4 > * + * { margin-top: 1rem; }
    .space-y-6 > * + * { margin-top: 1.5rem; }
    
    .mb-1 { margin-bottom: 0.25rem; }
    .mb-2 { margin-bottom: 0.5rem; }
    .mb-3 { margin-bottom: 0.75rem; }
    .mb-4 { margin-bottom: 1rem; }
    .mb-6 { margin-bottom: 1.5rem; }
    .mb-8 { margin-bottom: 2rem; }
    
    .mt-1 { margin-top: 0.25rem; }
    .mt-2 { margin-top: 0.5rem; }
    .mt-3 { margin-top: 0.75rem; }
    .mt-4 { margin-top: 1rem; }
    .mt-5 { margin-top: 1.25rem; }
    .mt-6 { margin-top: 1.5rem; }
    
    .py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
    .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
    .py-3 { padding-top: 0.75rem; padding-bottom: 0.75rem; }
    .py-4 { padding-top: 1rem; padding-bottom: 1rem; }
    .px-2 { padding-left: 0.5rem; padding-right: 0.5rem; }
    .px-4 { padding-left: 1rem; padding-right: 1rem; }
    .px-6 { padding-left: 1.5rem; padding-right: 1.5rem; }
    .pt-4 { padding-top: 1rem; }
    .pt-6 { padding-top: 1.5rem; }
    .pb-1 { padding-bottom: 0.25rem; }
    .pb-2 { padding-bottom: 0.5rem; }
    .pb-6 { padding-bottom: 1.5rem; }
    
    .text-left { text-align: left; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    
    .text-xs { font-size: 0.75rem; line-height: 1rem; }
    .text-sm { font-size: 0.875rem; line-height: 1.25rem; }
    .text-base { font-size: 1rem; line-height: 1.5rem; }
    .text-lg { font-size: 1.125rem; line-height: 1.75rem; }
    .text-xl { font-size: 1.25rem; line-height: 1.75rem; }
    .text-2xl { font-size: 1.5rem; line-height: 2rem; }
    .text-3xl { font-size: 1.875rem; line-height: 2.25rem; }
    
    .font-normal { font-weight: 400; }
    .font-medium { font-weight: 500; }
    .font-semibold { font-weight: 600; }
    .font-bold { font-weight: 700; }
    
    .text-gray-500 { color: #6b7280; }
    .text-gray-600 { color: #4b5563; }
    .text-gray-700 { color: #374151; }
    .text-gray-900 { color: #111827; }
    .text-red-600 { color: #dc2626; }
    .text-white { color: #ffffff; }
    .text-yellow-800 { color: #92400e; }
    .text-yellow-900 { color: #78350f; }
    
    .bg-white { background-color: #ffffff; }
    .bg-gray-50 { background-color: #f9fafb; }
    .bg-yellow-50 { background-color: #fefce8; }
    
    .border { border-width: 1px; }
    .border-b { border-bottom-width: 1px; }
    .border-t { border-top-width: 1px; }
    .border-t-2 { border-top-width: 2px; }
    .border-b-2 { border-bottom-width: 2px; }
    .border-gray-100 { border-color: #f3f4f6; }
    .border-gray-200 { border-color: #e5e7eb; }
    .border-gray-300 { border-color: #d1d5db; }
    .border-gray-900 { border-color: #111827; }
    
    .rounded { border-radius: 0.25rem; }
    .rounded-lg { border-radius: 0.5rem; }
    
    .whitespace-nowrap { white-space: nowrap; }
    .whitespace-pre-line { white-space: pre-line; }
    
    .leading-tight { line-height: 1.25; }
    .leading-relaxed { line-height: 1.625; }
    
    .tracking-tight { letter-spacing: -0.025em; }
    .tracking-wide { letter-spacing: 0.025em; }
    .tracking-wider { letter-spacing: 0.05em; }
    
    .uppercase { text-transform: uppercase; }
    
    .object-contain { object-fit: contain; }
    
    .hidden { display: none; }
    
    .last\\:border-b-0:last-child { border-bottom-width: 0; }
    
    @media (min-width: 640px) {
      .sm\\:flex-row { flex-direction: row; }
      .sm\\:text-right { text-align: right; }
      .sm\\:text-base { font-size: 1rem; line-height: 1.5rem; }
      .sm\\:text-lg { font-size: 1.125rem; line-height: 1.75rem; }
      .sm\\:text-xl { font-size: 1.25rem; line-height: 1.75rem; }
      .sm\\:text-2xl { font-size: 1.5rem; line-height: 2rem; }
      .sm\\:max-w-xs { max-width: 20rem; }
      .sm\\:border-t-0 { border-top-width: 0; }
      .sm\\:pt-0 { padding-top: 0; }
      .sm\\:pl-6 { padding-left: 1.5rem; }
      .sm\\:border-l { border-left-width: 1px; }
      .sm\\:flex-col { flex-direction: column; }
      .sm\\:items-end { align-items: flex-end; }
      .sm\\:gap-4 { gap: 1rem; }
    }
    
    @media (min-width: 768px) {
      .md\\:text-\\[15px\\] { font-size: 15px; }
    }
  `;
}

module.exports = {
  downloadAsBase64,
  downloadImageAsBase64,
  getInterFontCSS,
  getMinimalTailwindCSS
};

