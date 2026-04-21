/**
 * src/core/upload/validation.js
 *
 * File validation utilities.
 * No business logic. No feature-specific knowledge.
 */

'use strict';

const path = require('path');

// ─── MIME matching ────────────────────────────────────────────────────────────

/**
 * Returns true if `mime` matches any rule in `allowed`.
 * Supports wildcards: 'image/*' matches any 'image/...' type.
 */
function isMimeAllowed(mime, allowed = []) {
    const m = (mime || '').toLowerCase().trim();
    return allowed.some(rule =>
        rule.endsWith('/*')
            ? m.startsWith(rule.slice(0, -1))
            : m === rule.toLowerCase()
    );
}

/**
 * Resolves the effective MIME type of an uploaded file.
 * Falls back to extension sniffing when the declared type is
 * 'application/octet-stream' (common on iOS) or missing.
 */
function resolvedMime(file) {
    const declared = (file?.mimetype || '').toLowerCase().trim();
    if (declared && declared !== 'application/octet-stream') return declared;
    return mimeFromExtension(file?.originalname);
}

function mimeFromExtension(filename = '') {
    const ext = path.extname(filename || '').toLowerCase();
    const map = {
        '.pdf':  'application/pdf',
        '.jpg':  'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png':  'image/png',
        '.webp': 'image/webp',
        '.gif':  'image/gif',
        '.bmp':  'image/bmp',
        '.heic': 'image/heic',
        '.heif': 'image/heif',
    };
    return map[ext] || '';
}

/**
 * Returns the file extension (lowercase, including dot) for an uploaded file.
 * Falls back to MIME-derived extension when originalname has none.
 */
function fileExtension(file) {
    const ext = path.extname(file?.originalname || '');
    if (ext) return ext.toLowerCase();
    const mime = resolvedMime(file);
    const mimeExtMap = {
        'application/pdf': '.pdf',
        'image/jpeg':      '.jpg',
        'image/png':       '.png',
        'image/webp':      '.webp',
        'image/gif':       '.gif',
        'image/bmp':       '.bmp',
        'image/heic':      '.heic',
        'image/heif':      '.heif',
    };
    return mimeExtMap[mime] || '.bin';
}

// ─── Filename safety ──────────────────────────────────────────────────────────

/**
 * Validates that an original filename is safe to use as a storage filename.
 * Returns { ok, error, safeName }.
 *
 * Rejects:
 *   - Null bytes
 *   - Path traversal (../, ..\, absolute paths)
 *   - Empty or whitespace-only names
 *   - Names over 200 characters
 */
function validateFilename(originalname) {
    const name = (originalname || '').trim();

    if (!name) return { ok: false, error: 'Filename is empty.' };
    if (name.length > 200) return { ok: false, error: 'Filename too long (max 200 characters).' };
    if (/\x00/.test(name)) return { ok: false, error: 'Filename contains null bytes.' };
    if (/(?:^|[\\/])\.\.[/\\]?/.test(name)) return { ok: false, error: 'Filename contains path traversal.' };
    if (/^[/\\]/.test(name)) return { ok: false, error: 'Filename is an absolute path.' };

    // Strip everything except the basename (final path component)
    const safeName = path.basename(name);
    if (!safeName) return { ok: false, error: 'Filename resolved to empty after sanitization.' };

    return { ok: true, safeName };
}

// ─── Size ─────────────────────────────────────────────────────────────────────

function mb(n) { return n * 1024 * 1024; }

function validateSize(sizeBytes, maxMB, label = 'File') {
    if (sizeBytes === 0) return { ok: false, error: `${label}: File is empty (0 bytes).` };
    if (sizeBytes > mb(maxMB)) {
        const actual = (sizeBytes / mb(1)).toFixed(1);
        return { ok: false, error: `${label}: File too large (${actual} MB). Maximum is ${maxMB} MB.` };
    }
    return { ok: true };
}

module.exports = { isMimeAllowed, resolvedMime, fileExtension, validateFilename, validateSize, mb };
