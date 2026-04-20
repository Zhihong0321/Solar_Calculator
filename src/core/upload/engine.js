/**
 * src/core/upload/engine.js
 *
 * Generic multer-based upload engine factory.
 *
 * Usage:
 *   const { createUploader } = require('./engine');
 *   const upload = createUploader({
 *     storageSubdir: 'seda_registration',
 *     allowedMimes:  ['application/pdf'],
 *     maxFileSizeMB: 25,
 *     fieldName:     'file',            // optional, defaults to 'file'
 *     generateFilename: (req, file) => `${Date.now()}.pdf`
 *   });
 *
 *   // In a route:
 *   const multerErr = await upload(req, res);
 *   if (multerErr) return res.status(400).json(uploadError('WRONG_TYPE', ...));
 *   if (!req.file)  return res.status(400).json(uploadError('NO_FILE', ...));
 *
 * The engine knows nothing about routes, databases, or business rules.
 * Auth, ownership checks, and DB persistence all live in the calling route.
 */

'use strict';

const multer   = require('multer');
const crypto   = require('crypto');
const { ensureDir }        = require('./storage');
const { resolvedMime, fileExtension, isMimeAllowed } = require('./validation');

/**
 * Creates a Promise-based multer upload middleware.
 *
 * @param {object} config
 * @param {string}   config.storageSubdir     - Sub-folder under storage root
 * @param {string[]} config.allowedMimes      - Allowed MIME types/patterns
 * @param {number}   config.maxFileSizeMB     - Hard size cap (transport limit)
 * @param {string}   [config.fieldName='file']- FormData field name
 * @param {Function} [config.generateFilename]- (req, file) => filename string
 *
 * @returns {Function} (req, res) => Promise<Error|null>
 *   Resolves to null on success, or a multer/validation error on failure.
 *   Sets req.file on success.
 */
function createUploader(config) {
    const {
        storageSubdir,
        allowedMimes,
        maxFileSizeMB,
        fieldName = 'file',
        generateFilename = defaultFilename,
    } = config;

    const multerInstance = multer({
        storage: multer.diskStorage({
            destination(_req, _file, cb) {
                const dir = ensureDir(storageSubdir);
                cb(null, dir);
            },
            filename(req, file, cb) {
                try {
                    const name = generateFilename(req, file);
                    cb(null, name);
                } catch (err) {
                    cb(err);
                }
            },
        }),
        limits: {
            fileSize: maxFileSizeMB * 1024 * 1024,
            files: 1,
        },
        fileFilter(_req, file, cb) {
            const mime = resolvedMime(file);
            if (!mime) {
                const err = new Error('Cannot determine file type. Please upload a valid file.');
                err.code = 'WRONG_TYPE';
                return cb(err);
            }
            if (!isMimeAllowed(mime, allowedMimes)) {
                const err = new Error(
                    `Wrong file type (${mime}). Accepted: ${allowedMimes.join(', ')}.`
                );
                err.code = 'WRONG_TYPE';
                return cb(err);
            }
            cb(null, true);
        },
    }).single(fieldName);

    // Return a promise-based wrapper — no callback spaghetti in route handlers
    return function runUpload(req, res) {
        return new Promise(resolve => {
            multerInstance(req, res, resolve);
        });
    };
}

// ─── Default filename generator ───────────────────────────────────────────────

function defaultFilename(req, file) {
    const field  = req.params?.field || 'file';
    const id     = req.params?.id || req.params?.shareToken || 'unknown';
    const ts     = Date.now();
    const rand   = crypto.randomBytes(4).toString('hex');
    const ext    = fileExtension(file);
    return `${field}_${id}_${ts}_${rand}${ext}`;
}

module.exports = { createUploader };
