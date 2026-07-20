/**
 * src/core/upload/r2Storage.js
 *
 * Cloudflare R2 (S3-compatible) storage backend.
 * No business logic. No feature-specific knowledge.
 *
 * Required env vars:
 *   R2_ACCOUNT_ID
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET
 *   R2_PUBLIC_BASE_URL   e.g. https://pub-xxxxxxxx.r2.dev  (no trailing slash)
 */

'use strict';

const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

let _client = null;

function getClient() {
    if (_client) return _client;
    const accountId = process.env.R2_ACCOUNT_ID;
    if (!accountId) throw new Error('R2_ACCOUNT_ID is not set.');
    _client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
    });
    return _client;
}

function getPublicBaseUrl() {
    const base = process.env.R2_PUBLIC_BASE_URL;
    if (!base) throw new Error('R2_PUBLIC_BASE_URL is not set.');
    return base.replace(/\/+$/, '');
}

function getBucket() {
    const bucket = process.env.R2_BUCKET;
    if (!bucket) throw new Error('R2_BUCKET is not set.');
    return bucket;
}

/**
 * Uploads a buffer to R2 under the given key and returns its public URL.
 */
async function uploadBuffer(buffer, key, mimeType) {
    await getClient().send(new PutObjectCommand({
        Bucket: getBucket(),
        Key: key,
        Body: buffer,
        ContentType: mimeType || 'application/octet-stream',
    }));
    return `${getPublicBaseUrl()}/${key}`;
}

/**
 * Deletes an object from R2 by key. Silently ignores errors.
 */
async function deleteObject(key) {
    if (!key) return;
    try {
        await getClient().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
    } catch (_) {}
}

/**
 * Returns true if the given URL was served from this R2 public base URL.
 */
function isR2Url(url) {
    if (!url || typeof url !== 'string') return false;
    try {
        return url.startsWith(getPublicBaseUrl());
    } catch (_) {
        return false;
    }
}

/**
 * Extracts the object key from a previously built R2 public URL.
 */
function keyFromUrl(url) {
    if (!isR2Url(url)) return null;
    return url.slice(getPublicBaseUrl().length + 1);
}

/**
 * Fetches a previously uploaded object's bytes over HTTP (public URL).
 * Used by extraction/OCR when a stored URL points at R2, not local disk.
 */
async function fetchBuffer(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch R2 object (${res.status}): ${url}`);
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

const REQUIRED_ENV = [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET',
    'R2_PUBLIC_BASE_URL',
];

/**
 * Returns the names of any missing R2 env vars.
 */
function missingConfig() {
    return REQUIRED_ENV.filter(name => !process.env[name]);
}

/**
 * Boot-time guard. Call once at startup.
 *
 * Without this, a missing env var is invisible until a user hits an upload:
 * isR2Url() swallows the config error and returns false, so read paths report
 * "file not found" for files that exist perfectly well — a misconfiguration
 * that impersonates data loss. Fail loudly at boot instead.
 */
function assertConfigured({ fatal = false } = {}) {
    const missing = missingConfig();
    if (!missing.length) return true;

    const msg = `[r2Storage] Missing R2 configuration: ${missing.join(', ')}. `
              + 'File uploads will fail and stored files will be unreadable.';
    if (fatal) throw new Error(msg);
    console.error(msg);
    return false;
}

module.exports = {
    uploadBuffer, deleteObject, isR2Url, keyFromUrl, fetchBuffer,
    missingConfig, assertConfigured,
};
