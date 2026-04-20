/**
 * src/core/upload/response.js
 *
 * Standard response shapes for the upload processor.
 * Every upload route in the app returns one of these shapes.
 */

'use strict';

const ERROR_CODES = {
    NO_FILE:         'NO_FILE',
    WRONG_TYPE:      'WRONG_TYPE',
    TOO_LARGE:       'TOO_LARGE',
    UNSAFE_FILENAME: 'UNSAFE_FILENAME',
    UNKNOWN_FIELD:   'UNKNOWN_FIELD',
    RECORD_NOT_FOUND:'RECORD_NOT_FOUND',
    FORBIDDEN:       'FORBIDDEN',
    STORAGE_FAILED:  'STORAGE_FAILED',
    DB_FAILED:       'DB_FAILED',
    SERVER_ERROR:    'SERVER_ERROR',
};

/**
 * Standard success response.
 *
 * @param {object} params
 * @param {string} params.field       - The fieldKey that was uploaded
 * @param {string} params.url         - Absolute public URL of the stored file
 * @param {string} params.filename    - Server-side filename (not original name)
 * @param {string} params.mime        - Resolved MIME type
 * @param {number} params.size        - File size in bytes
 */
function uploadSuccess({ field, url, filename, mime, size }) {
    return { success: true, field, url, filename, mime, size };
}

/**
 * Standard error response.
 *
 * @param {string} code     - One of ERROR_CODES
 * @param {object} opts
 * @param {string} [opts.field]   - The fieldKey if known
 * @param {string} [opts.error]   - Human-readable message
 */
function uploadError(code, { field, error } = {}) {
    return {
        success: false,
        code,
        ...(field ? { field } : {}),
        error: error || defaultMessage(code),
    };
}

function defaultMessage(code) {
    const messages = {
        NO_FILE:          'No file was received. Please select a file and try again.',
        WRONG_TYPE:       'File type is not accepted for this field.',
        TOO_LARGE:        'File is too large.',
        UNSAFE_FILENAME:  'Filename is not safe.',
        UNKNOWN_FIELD:    'Upload field is not recognised.',
        RECORD_NOT_FOUND: 'The record was not found.',
        FORBIDDEN:        'You do not have permission to upload to this record.',
        STORAGE_FAILED:   'File could not be saved. Please try again.',
        DB_FAILED:        'File was saved but the database update failed. Please try again — the retry is safe.',
        SERVER_ERROR:     'An unexpected server error occurred.',
    };
    return messages[code] || 'Upload failed.';
}

module.exports = { uploadSuccess, uploadError, ERROR_CODES };
