/**
 * src/modules/ClaimReceipt/pdfRasterize.js
 *
 * The vision endpoint only accepts bmp/gif/png/jpeg/webp — no PDF. Rather than reject PDF
 * receipts, rasterize page 1 to a PNG with pdfjs-dist and send that instead. Unlike the
 * Next.js prototype this was ported from, Express has no bundler step to fight — pdfjs-dist and
 * @napi-rs/canvas are just plain `require()`s here, no webpack externals workaround needed.
 */

'use strict';

const path = require('path');
const { pathToFileURL } = require('url');
const { createCanvas } = require('@napi-rs/canvas');

class NodeCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext('2d') };
  }
  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }
  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
  }
}

const standardFontDataUrl = `${pathToFileURL(path.join(__dirname, '../../../node_modules/pdfjs-dist/standard_fonts/')).href}/`;

/**
 * Rasterizes page 1 of a PDF buffer to a PNG buffer.
 * Multi-page PDFs only get page 1 — receipts are practically always single-page.
 */
async function rasterizePdfFirstPage(bytes) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const canvasFactory = new NodeCanvasFactory();

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(bytes),
    canvasFactory,
    standardFontDataUrl
  });

  const doc = await loadingTask.promise;
  try {
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);
    await page.render({ canvasContext: canvasAndContext.context, viewport, canvasFactory }).promise;
    return canvasAndContext.canvas.toBuffer('image/png');
  } finally {
    await loadingTask.destroy();
  }
}

module.exports = { rasterizePdfFirstPage };
