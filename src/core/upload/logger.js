/**
 * src/core/upload/logger.js
 *
 * Structured upload event logging.
 * Every upload attempt (success or failure) emits a log line
 * with enough context for support to diagnose issues.
 */

'use strict';

/**
 * Logs a structured upload event.
 *
 * @param {object} params
 * @param {string} params.route      - e.g. '/api/v1/seda/:id/upload/:field'
 * @param {string} params.field      - fieldKey e.g. 'tnb_bill_1'
 * @param {string} params.recordId   - bubble_id or share token
 * @param {string} params.mime       - resolved MIME type
 * @param {number} params.sizeBytes  - file size in bytes
 * @param {string} params.filename   - server-side filename (if written)
 * @param {'success'|'rejected'|'error'} params.result
 * @param {string} [params.error]    - error message if result !== 'success'
 * @param {string} [params.code]     - error code if result !== 'success'
 */
function logUpload({ route, field, recordId, mime, sizeBytes, filename, result, error, code }) {
    const prefix = result === 'success' ? '[Upload OK]'
                 : result === 'rejected' ? '[Upload Rejected]'
                 : '[Upload Error]';

    const parts = [
        prefix,
        `route=${route}`,
        `field=${field}`,
        `record=${recordId || 'unknown'}`,
        `mime=${mime || 'unknown'}`,
        `size=${formatBytes(sizeBytes)}`,
    ];

    if (filename) parts.push(`file=${filename}`);
    if (code)     parts.push(`code=${code}`);
    if (error)    parts.push(`err="${error}"`);

    if (result === 'success') {
        console.log(parts.join('  '));
    } else if (result === 'rejected') {
        console.warn(parts.join('  '));
    } else {
        console.error(parts.join('  '));
    }
}

function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return '?';
    if (bytes < 1024)             return `${bytes}B`;
    if (bytes < 1024 * 1024)      return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

module.exports = { logUpload };
