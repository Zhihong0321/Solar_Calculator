/**
 * src/core/upload/storage.js
 *
 * File system and public URL helpers.
 * No business logic. No feature-specific knowledge.
 */

'use strict';

const path = require('path');
const fs   = require('fs');

function getStorageRoot() {
    return process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '../../../storage');
}

/**
 * Ensures a sub-directory under the storage root exists.
 * Returns the full absolute path.
 */
function ensureDir(subdir) {
    const dir = path.join(getStorageRoot(), subdir);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

/**
 * Builds the absolute public URL for a stored file.
 * Uses x-forwarded-proto for Railway / reverse proxy environments.
 */
function buildPublicUrl(req, subdir, filename) {
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    const host  = req.get('host');
    // subdir maps to the static route registered in server.js
    // e.g. 'seda_registration' → served at /seda-files/
    const routeSegment = subdirToRouteSegment(subdir);
    return `${proto}://${host}/${routeSegment}/${filename}`;
}

/**
 * Resolves a previously stored public URL back to an absolute disk path.
 * Returns null if the file does not exist on disk.
 */
function resolveDiskPath(url, subdir) {
    if (!url || typeof url !== 'string') return null;
    const filename = path.basename(url.split('?')[0]);
    if (!filename) return null;
    const fullPath = path.join(getStorageRoot(), subdir, filename);
    return fs.existsSync(fullPath) ? fullPath : null;
}

/**
 * Deletes a file from disk. Silently ignores errors.
 */
function safeDelete(filePath) {
    if (!filePath) return;
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (_) {}
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const SUBDIR_ROUTE_MAP = {
    'seda_registration': 'seda-files',
    'agent_documents':   'agent-docs',
    'roof_images':       'uploads/roof_images',
    'site_assessment_images': 'uploads/site_assessment_images',
    'pv_drawings':       'uploads/pv_drawings',
};

function subdirToRouteSegment(subdir) {
    return SUBDIR_ROUTE_MAP[subdir] || subdir.replace(/_/g, '-');
}

module.exports = { getStorageRoot, ensureDir, buildPublicUrl, resolveDiskPath, safeDelete };
