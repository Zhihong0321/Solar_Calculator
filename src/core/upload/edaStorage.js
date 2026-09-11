/**
 * src/core/upload/edaStorage.js
 *
 * eter-drive-api (S3-compatible object storage on Railway) backend.
 * No business logic. No feature-specific knowledge.
 *
 * Required env vars:
 *   EDA_S3_ACCESS_KEY_ID
 *   EDA_S3_SECRET_ACCESS_KEY
 * Optional overrides (sane defaults for the current deployment):
 *   EDA_S3_BUCKET              default 'video'
 *   EDA_S3_REGION              default 'us-east-1'
 *   EDA_S3_ENDPOINT_INTERNAL   default 'http://eter-drive-api.railway.internal:8080'
 *   EDA_S3_ENDPOINT_PUBLIC     default 'https://eter-drive-api-production.up.railway.app'
 *
 * There is no public/anonymous read on this store — every request, including
 * GETs, must be SigV4-signed (verified 2026-09-11: an unsigned GET returns
 * 400 UnsupportedAlgorithm even after PutObject with ACL:'public-read'). So a
 * stored object has no browsable URL of its own; callers that need to hand a
 * URL to a user must proxy the read through their own server (see
 * supportTicketController.streamMedia for the pattern).
 */

'use strict';

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const INTERNAL_ENDPOINT = process.env.EDA_S3_ENDPOINT_INTERNAL || 'http://eter-drive-api.railway.internal:8080';
const PUBLIC_ENDPOINT   = process.env.EDA_S3_ENDPOINT_PUBLIC   || 'https://eter-drive-api-production.up.railway.app';

let internalClient = null;
let publicClient = null;
// Remembers whichever endpoint last succeeded so a process that can never
// reach the internal one (local dev, anywhere outside this Railway project)
// stops paying for a doomed attempt on every call.
let preferredEndpoint = null;

function makeClient(endpoint) {
    return new S3Client({
        region: process.env.EDA_S3_REGION || 'us-east-1',
        endpoint,
        forcePathStyle: true,
        credentials: {
            accessKeyId: process.env.EDA_S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.EDA_S3_SECRET_ACCESS_KEY,
        },
    });
}

function hasCredentials() {
    return Boolean(process.env.EDA_S3_ACCESS_KEY_ID && process.env.EDA_S3_SECRET_ACCESS_KEY);
}

function getBucket() {
    return process.env.EDA_S3_BUCKET || 'video';
}

/**
 * Runs `fn(client)` against the internal endpoint first, falling back to the
 * public one on failure (DNS failure outside Railway, or any other error).
 * Returns { result, endpoint } so callers/diagnostics can report which path
 * actually served the request.
 */
async function withClient(fn) {
    if (!hasCredentials()) {
        throw new Error('Eter Drive API credentials are not configured (EDA_S3_ACCESS_KEY_ID / EDA_S3_SECRET_ACCESS_KEY)');
    }

    const order = preferredEndpoint === 'public' ? ['public', 'internal'] : ['internal', 'public'];
    let lastErr;
    for (const which of order) {
        try {
            if (which === 'internal') {
                if (!internalClient) internalClient = makeClient(INTERNAL_ENDPOINT);
                const result = await fn(internalClient);
                preferredEndpoint = 'internal';
                return { result, endpoint: 'internal' };
            } else {
                if (!publicClient) publicClient = makeClient(PUBLIC_ENDPOINT);
                const result = await fn(publicClient);
                preferredEndpoint = 'public';
                return { result, endpoint: 'public' };
            }
        } catch (err) {
            lastErr = err;
        }
    }
    throw lastErr;
}

/**
 * Uploads a buffer under the given key. Returns which endpoint served it,
 * for diagnostics — the key itself is what callers need to read it back.
 */
async function uploadBuffer(buffer, key, mimeType) {
    const bucket = getBucket();
    const { endpoint } = await withClient((client) => client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType || 'application/octet-stream',
    })));
    return { key, bucket, endpoint };
}

/**
 * Fetches an object. `result.Body` is a Node Readable (with the sdk-stream-mixin
 * helpers like transformToString()) — pipe it directly to an HTTP response.
 */
async function getObject(key) {
    const bucket = getBucket();
    const { result, endpoint } = await withClient((client) => client.send(new GetObjectCommand({ Bucket: bucket, Key: key })));
    return { ...result, endpoint };
}

async function deleteObject(key) {
    const bucket = getBucket();
    await withClient((client) => client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })));
}

module.exports = { uploadBuffer, getObject, deleteObject, hasCredentials, getBucket };
