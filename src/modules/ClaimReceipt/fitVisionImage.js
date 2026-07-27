/**
 * src/modules/ClaimReceipt/fitVisionImage.js
 *
 * The Eternalgy router caps request bodies at ~1MB, and a base64 data URL inflates the image by
 * ~4/3. A 2000px camera photo or a scale-2 PDF rasterization sails past that and comes back as a
 * bare 413 — which is what an "uploaded fine but nothing auto-filled" receipt looks like from the
 * outside. So every image is re-encoded to JPEG here, downscaling until it fits the budget, before
 * it ever reaches the vision call.
 */

'use strict';

const { createCanvas, loadImage } = require('@napi-rs/canvas');

// Leaves ~130KB of the router's ~1MB body limit for the prompt and JSON envelope.
const MAX_IMAGE_BYTES = 640 * 1024;
const QUALITY_STEPS = [85, 70, 55];
const SCALE_STEPS = [1, 0.75, 0.55, 0.4, 0.3];

/**
 * Returns { bytes, mimeType } small enough to base64-embed in a router request.
 * Already-small images pass through untouched; anything over budget comes back as JPEG.
 */
async function fitVisionImage(bytes, mimeType) {
  if (bytes.length <= MAX_IMAGE_BYTES) return { bytes, mimeType };

  const image = await loadImage(bytes);

  for (const scale of SCALE_STEPS) {
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    // Receipts are photographed against dark surfaces; flatten transparency to white so a PNG
    // with an alpha channel doesn't turn into black-on-black once JPEG drops the alpha.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    for (const quality of QUALITY_STEPS) {
      const out = canvas.toBuffer('image/jpeg', quality);
      if (out.length <= MAX_IMAGE_BYTES) return { bytes: out, mimeType: 'image/jpeg' };
    }
  }

  const err = new Error('Receipt image is too large to read even after downscaling');
  err.status = 413;
  throw err;
}

module.exports = { fitVisionImage, MAX_IMAGE_BYTES };
