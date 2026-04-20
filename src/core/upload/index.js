/**
 * src/core/upload/index.js
 *
 * Barrel export for the upload processor.
 * Feature modules import from here, not from individual files.
 *
 * Usage:
 *   const { createUploader, uploadSuccess, uploadError, logUpload } = require('../../core/upload');
 */

'use strict';

const { createUploader }                          = require('./engine');
const { getStorageRoot, ensureDir, buildPublicUrl, resolveDiskPath, safeDelete } = require('./storage');
const { isMimeAllowed, resolvedMime, fileExtension, validateFilename, validateSize, mb } = require('./validation');
const { uploadSuccess, uploadError, ERROR_CODES } = require('./response');
const { logUpload }                               = require('./logger');
const {
    insertRecycleBinEntry,
    listRecycleBinEntries,
    getActiveRecycleBinEntry,
    markRecycleBinRestored,
} = require('./recycleBin');

module.exports = {
    // Engine
    createUploader,

    // Storage
    getStorageRoot,
    ensureDir,
    buildPublicUrl,
    resolveDiskPath,
    safeDelete,

    // Validation
    isMimeAllowed,
    resolvedMime,
    fileExtension,
    validateFilename,
    validateSize,
    mb,

    // Responses
    uploadSuccess,
    uploadError,
    ERROR_CODES,

    // Logging
    logUpload,

    // Recycle bin
    insertRecycleBinEntry,
    listRecycleBinEntries,
    getActiveRecycleBinEntry,
    markRecycleBinRestored,
};
