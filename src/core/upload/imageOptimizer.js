/**
 * src/core/upload/imageOptimizer.js
 *
 * In-memory image compression for the upload pipeline.
 * No business logic. No feature-specific knowledge.
 *
 * Uploads used to be written to the Railway volume and recompressed later by
 * scripts/optimize_seda_uploads.js. Once uploads moved to memory -> R2 they
 * never touch disk, so that script became a no-op for new files. This module
 * does the same job inline, on the buffer, before it is pushed to storage.
 *
 * Defaults are kept in sync with scripts/optimize_seda_uploads.js DEFAULTS.
 */

'use strict';

const sharp = require('sharp');

const DEFAULTS = {
    minBytes:     2 * 1024 * 1024, // skip anything already small
    maxDimension: 2560,
    jpegQuality:  82,
    webpQuality:  82,
};

// PDFs and anything non-raster pass through untouched.
const OPTIMIZABLE_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

function isOptimizable(mimeType) {
    return OPTIMIZABLE_MIMES.has(String(mimeType || '').toLowerCase());
}

/**
 * Recompresses an image buffer if it is worth doing.
 *
 * Never throws — compression is an optimization, not a correctness requirement.
 * On any failure (corrupt image, unsupported variant, sharp unavailable) the
 * original buffer is returned so the upload still succeeds.
 *
 * PNGs are re-encoded as PNG rather than JPEG so images with transparency
 * (company stamps, signatures) do not gain a black background.
 *
 * @returns {Promise<{buffer: Buffer, mimeType: string, optimized: boolean,
 *                    originalBytes: number, finalBytes: number}>}
 */
async function optimizeBuffer(buffer, mimeType, options = {}) {
    const cfg = { ...DEFAULTS, ...options };
    const originalBytes = buffer ? buffer.length : 0;
    const passthrough = {
        buffer, mimeType, optimized: false, originalBytes, finalBytes: originalBytes,
    };

    if (!buffer || !isOptimizable(mimeType)) return passthrough;
    if (originalBytes < cfg.minBytes) return passthrough;

    try {
        const image = sharp(buffer, { failOn: 'none' }).rotate(); // honour EXIF orientation
        const meta  = await image.metadata();

        // Only downscale — never upscale a photo that is already small.
        const needsResize = (meta.width  || 0) > cfg.maxDimension
                         || (meta.height || 0) > cfg.maxDimension;
        const pipeline = needsResize
            ? image.resize(cfg.maxDimension, cfg.maxDimension, { fit: 'inside', withoutEnlargement: true })
            : image;

        const isPng = String(mimeType).toLowerCase() === 'image/png';
        const outMime = isPng ? 'image/png' : (String(mimeType).toLowerCase() === 'image/webp' ? 'image/webp' : 'image/jpeg');

        let out;
        if (isPng) {
            out = await pipeline.png({ compressionLevel: 9, palette: true }).toBuffer();
        } else if (outMime === 'image/webp') {
            out = await pipeline.webp({ quality: cfg.webpQuality }).toBuffer();
        } else {
            out = await pipeline.jpeg({ quality: cfg.jpegQuality, mozjpeg: true }).toBuffer();
        }

        // If recompression made it bigger (already-optimized source), keep the original.
        if (out.length >= originalBytes) return passthrough;

        return {
            buffer: out,
            mimeType: outMime,
            optimized: true,
            originalBytes,
            finalBytes: out.length,
        };
    } catch (err) {
        console.warn('[imageOptimizer] Compression skipped:', err.message);
        return passthrough;
    }
}

const MIME_EXTENSIONS = {
    'image/jpeg': '.jpg',
    'image/jpg':  '.jpg',
    'image/png':  '.png',
    'image/webp': '.webp',
};

/**
 * File extension (including the dot) for a mime type this module can emit.
 * Falls back to '.bin' so a caller never builds a extension-less key.
 */
function extensionForMime(mimeType) {
    return MIME_EXTENSIONS[String(mimeType || '').toLowerCase()] || '.bin';
}

module.exports = { optimizeBuffer, isOptimizable, extensionForMime, DEFAULTS };
