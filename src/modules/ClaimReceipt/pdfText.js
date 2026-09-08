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

// Below this, treat the PDF as image-only (a scan) and fall back to rasterizing.
const MIN_USABLE_TEXT = 40;

/**
 * Returns text from up to the first 3 pages of a PDF, or '' if no usable text layer is found.
 * Never throws — a failure here falls back to rasterizing.
 */
async function extractPdfText(bytes) {
  let task;
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    task = pdfjsLib.getDocument({ data: new Uint8Array(bytes) });
    const doc = await task.promise;
    const maxPages = Math.min(doc.numPages, 3);
    const pagesText = [];

    for (let p = 1; p <= maxPages; p += 1) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => (typeof item.str === 'string' ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) pagesText.push(text);
    }

    return pagesText.join('\n\n').trim();
  } catch (_) {
    return '';
  } finally {
    if (task) await task.destroy().catch(() => {});
  }
}

/**
 * Rasterizes page 1 of a PDF to a PNG Buffer using @napi-rs/canvas.
 * Used as a fallback for scanned PDFs or PDFs with no usable text layer.
 * Returns null on any failure.
 */
async function rasterizePdfFirstPage(bytes) {
  let task;
  try {
    const { createCanvas } = require('@napi-rs/canvas');
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

    class CanvasFactory {
      create(w, h) {
        const canvas = createCanvas(w, h);
        return { canvas, context: canvas.getContext('2d') };
      }
      reset(cc, w, h) { cc.canvas.width = w; cc.canvas.height = h; }
      destroy(cc) { cc.canvas.width = 0; cc.canvas.height = 0; }
    }

    const factory = new CanvasFactory();
    task = pdfjsLib.getDocument({
      data: new Uint8Array(bytes),
      canvasFactory: factory
    });
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvasObj = factory.create(viewport.width, viewport.height);
    await page.render({
      canvasContext: canvasObj.context,
      viewport,
      canvasFactory: factory
    }).promise;

    return canvasObj.canvas.toBuffer('image/png');
  } catch (err) {
    console.error('[ClaimReceipt] PDF rasterization error:', err.message);
    return null;
  } finally {
    if (task) await task.destroy().catch(() => {});
  }
}

module.exports = { extractPdfText, rasterizePdfFirstPage, MIN_USABLE_TEXT };
