/**
 * src/modules/ClaimReceipt/pdfText.js
 *
 * Pulls the text layer out of page 1 of a PDF.
 *
 * Why this exists: the PDF path used to go PDF -> canvas raster -> vision model. Canvas text
 * rendering depends on the fonts installed in the host image, so a PDF that rasterizes perfectly
 * on a dev machine can render blank on a slim Linux container — and a blank page comes back from
 * the model as a well-formed, entirely null draft. That failure is invisible: HTTP 200, no error,
 * empty form.
 *
 * Digitally-issued receipts (SaaS invoices, e-receipts) all carry a real text layer, so reading it
 * directly is deterministic, host-independent, ~10x cheaper in tokens and far faster. Rasterizing
 * stays as the fallback for scans and photos, which genuinely have no text.
 */

'use strict';

// Below this, treat the PDF as image-only (a scan) and fall back to rasterizing. Real receipts
// clear this easily — the two smallest in production came in at 613 and 861 characters.
const MIN_USABLE_TEXT = 80;

/**
 * Returns page 1's text as a single normalized line, or '' if the PDF has no usable text layer.
 * Never throws — a failure here just means the caller rasterizes instead.
 */
async function extractPdfText(bytes) {
  let task;
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    task = pdfjsLib.getDocument({ data: new Uint8Array(bytes) });
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    return content.items
      .map((item) => (typeof item.str === 'string' ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch (_) {
    return '';
  } finally {
    if (task) await task.destroy().catch(() => {});
  }
}

module.exports = { extractPdfText, MIN_USABLE_TEXT };
