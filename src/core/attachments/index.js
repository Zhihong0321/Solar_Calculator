/**
 * src/core/attachments/index.js
 *
 * Barrel export for the attachment store. Feature modules import from here.
 *
 *   const { insertAttachment, listForOwner, validateTarget } = require('../../core/attachments');
 *
 * This sits on top of src/core/upload — that layer still owns multer, MIME
 * checking, image compression and the storage backends. This layer only owns
 * what an attachment *is* and where it is recorded.
 */

'use strict';

const registry = require('./registry');
const repo = require('./repo');

module.exports = {
    ...registry,
    ...repo,
    registry,
    repo,
};
