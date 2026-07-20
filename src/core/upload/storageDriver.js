/**
 * src/core/upload/storageDriver.js
 *
 * One storage contract over two backends (Railway volume + Cloudflare R2).
 * No business logic. No feature-specific knowledge.
 *
 * Before this existed, storage.js and r2Storage.js were sibling backends with
 * no shared interface: every caller imported a backend directly and branched on
 * isR2Url(). That meant moving a module to R2 was surgery on that module rather
 * than a config change, and each migration reimplemented the same disk->R2 read
 * fallback slightly differently.
 *
 * The contract:
 *   put(buffer, opts)        -> { url, filename, mimeType, bytes, backend }
 *   getBuffer(storedUrl, o)  -> { buffer, mimeType, source }
 *   remove(storedUrl, opts)  -> boolean
 *   backendFor(subdir)       -> 'r2' | 'disk'
 *
 * READS ALWAYS TRY BOTH BACKENDS, whatever the active write backend is. Rows
 * written before a module was cut over still hold /uploads/... paths, and those
 * must keep resolving until a backfill has repointed every one of them. Reads
 * check disk first: during a --keep-local backfill window both copies exist and
 * are identical, and serving the local one avoids a pointless egress round trip.
 */

'use strict';

const path = require('path');
const fs   = require('fs');

const { getStorageRoot, ensureDir, buildPublicUrl, resolveDiskPath, safeDelete } = require('./storage');
const r2Storage = require('./r2Storage');
const { optimizeBuffer } = require('./imageOptimizer');

const EXT_MIME_MAP = {
    '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
    '.bmp': 'image/bmp', '.heic': 'image/heic', '.heif': 'image/heif',
    '.svg': 'image/svg+xml', '.html': 'text/html', '.txt': 'text/plain',
};

function mimeFromName(name) {
    const ext = (String(name || '').match(/\.[a-zA-Z0-9]+$/) || [''])[0].toLowerCase();
    return EXT_MIME_MAP[ext] || 'application/octet-stream';
}

/**
 * Which backend writes for a given subdir.
 *
 * Default is R2 when configured, disk otherwise — so a dev machine with no R2
 * env vars keeps working instead of failing every upload. A per-subdir override
 * lets modules be cut over one at a time and rolled back individually without a
 * deploy, e.g. STORAGE_BACKEND_chat_uploads=disk.
 */
function backendFor(subdir) {
    const override = process.env[`STORAGE_BACKEND_${subdir}`];
    if (override === 'disk' || override === 'r2') return override;

    const globalChoice = process.env.STORAGE_BACKEND;
    if (globalChoice === 'disk') return 'disk';
    if (globalChoice === 'r2') return 'r2';

    return r2Storage.missingConfig().length ? 'disk' : 'r2';
}

/**
 * Stores a buffer and returns its retrievable URL.
 *
 * Images are compressed by default. Uploads that go straight to R2 never touch
 * the volume, so scripts/optimize_seda_uploads.js cannot see them — without
 * compression here, full-resolution photos are stored as-is. Pass
 * `optimize: false` for anything whose exact bytes matter.
 *
 * `req` is only needed for the disk backend, which builds an absolute URL from
 * the request host. R2 URLs are absolute already.
 */
async function put(buffer, {
    subdir,
    filename,
    mimeType,
    req = null,
    optimize = true,
} = {}) {
    if (!buffer) throw new Error('storageDriver.put: buffer is required');
    if (!subdir)   throw new Error('storageDriver.put: subdir is required');
    if (!filename) throw new Error('storageDriver.put: filename is required');

    const resolvedMimeType = mimeType || mimeFromName(filename);
    let outBuffer = buffer;
    let outMime   = resolvedMimeType;
    let outName   = filename;

    if (optimize) {
        const result = await optimizeBuffer(buffer, resolvedMimeType);
        outBuffer = result.buffer;
        outMime   = result.mimeType;
        // Keep the stored extension honest — a PNG re-encoded to JPEG must not
        // keep a .png name, or later mime-sniffing from the filename lies.
        if (result.optimized && result.mimeType !== resolvedMimeType) {
            const { extensionForMime } = require('./imageOptimizer');
            outName = filename.replace(/\.[^.]+$/, extensionForMime(result.mimeType));
        }
    }

    const backend = backendFor(subdir);

    if (backend === 'r2') {
        const url = await r2Storage.uploadBuffer(outBuffer, `${subdir}/${outName}`, outMime);
        return { url, filename: outName, mimeType: outMime, bytes: outBuffer.length, backend: 'r2' };
    }

    const dir = ensureDir(subdir);
    fs.writeFileSync(path.join(dir, outName), outBuffer);
    // Without a request we cannot build an absolute URL, so fall back to a
    // root-relative one. Callers that store this must be able to live with it.
    const url = req
        ? buildPublicUrl(req, subdir, outName)
        : `/uploads/${subdir}/${outName}`;
    return { url, filename: outName, mimeType: outMime, bytes: outBuffer.length, backend: 'disk' };
}

/**
 * Reads a stored file back, wherever it lives.
 *
 * Disk first, then R2 — see the module header for why. Throws only when both
 * backends miss, so a caller cannot mistake "not configured" for "not found".
 */
async function getBuffer(storedUrl, { subdir } = {}) {
    if (!storedUrl) throw new Error('storageDriver.getBuffer: storedUrl is required');

    if (subdir) {
        const diskPath = resolveDiskPath(storedUrl, subdir);
        if (diskPath) {
            return {
                buffer: fs.readFileSync(diskPath),
                mimeType: mimeFromName(diskPath),
                source: 'disk',
            };
        }
    }

    if (r2Storage.isR2Url(storedUrl)) {
        return {
            buffer: await r2Storage.fetchBuffer(storedUrl),
            mimeType: mimeFromName(storedUrl),
            source: 'r2',
        };
    }

    // A stored URL that is neither on disk nor recognisably R2 usually means the
    // R2 env vars are missing, which makes isR2Url() return false for perfectly
    // valid URLs. Say so, rather than reporting a misconfiguration as data loss.
    const missing = r2Storage.missingConfig();
    if (missing.length) {
        throw new Error(
            `Cannot read ${storedUrl}: not on disk, and R2 is not configured (missing ${missing.join(', ')}). `
            + 'This is a configuration problem, not a missing file.'
        );
    }
    throw new Error(`File not found on disk or in R2: ${storedUrl}`);
}

/**
 * Deletes a stored file from whichever backend holds it.
 *
 * Best-effort and never throws: callers delete during cleanup and rollback paths
 * where a failure to delete must not mask the original error. Returns whether
 * anything was actually removed.
 */
async function remove(storedUrl, { subdir } = {}) {
    if (!storedUrl) return false;
    let removed = false;

    if (subdir) {
        const diskPath = resolveDiskPath(storedUrl, subdir);
        if (diskPath) { safeDelete(diskPath); removed = true; }
    }

    if (r2Storage.isR2Url(storedUrl)) {
        await r2Storage.deleteObject(r2Storage.keyFromUrl(storedUrl));
        removed = true;
    }

    return removed;
}

module.exports = { put, getBuffer, remove, backendFor, mimeFromName, getStorageRoot };
