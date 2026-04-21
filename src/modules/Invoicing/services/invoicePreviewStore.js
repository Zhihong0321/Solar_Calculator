const fs = require('fs');
const path = require('path');

const PREVIEW_ROOT = path.join(process.cwd(), 'v3-quotation-view', 'local-previews');

function ensurePreviewDir() {
  fs.mkdirSync(PREVIEW_ROOT, { recursive: true });
  return PREVIEW_ROOT;
}

function sanitizePreviewKey(tokenOrId) {
  return String(tokenOrId || 'invoice-preview').trim().replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function getPreviewFixturePath(tokenOrId) {
  return path.join(ensurePreviewDir(), `${sanitizePreviewKey(tokenOrId)}.json`);
}

function loadPreviewSnapshot(tokenOrId) {
  const filePath = getPreviewFixturePath(tokenOrId);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  if (!raw.trim()) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    const error = new Error(`Invalid preview snapshot JSON at ${filePath}: ${err.message}`);
    error.cause = err;
    throw error;
  }
}

function savePreviewSnapshot(tokenOrId, snapshot) {
  const filePath = getPreviewFixturePath(tokenOrId);
  ensurePreviewDir();
  fs.writeFileSync(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  return filePath;
}

module.exports = {
  getPreviewFixturePath,
  loadPreviewSnapshot,
  savePreviewSnapshot
};
