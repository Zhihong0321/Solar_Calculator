# FILE-UPLOAD-PROCESSOR.MD

Internal Developer Guide — Site-Wide File Upload Processor  
Last updated: 2026-04-20  
Applies to: Solar Calculator v2

---

## Overview

The upload processor lives in `src/core/upload/`.  
It is the **only** place in the app that touches multer, MIME checking, disk storage, filename safety, and upload response formatting.

No feature module should implement its own multer setup, file filter, response shape, or storage helpers.  
New uploads = import from `src/core/upload/`, configure, done.

```
src/core/upload/
  engine.js       ← multer factory (createUploader)
  storage.js      ← disk ops, URL builder, path resolver
  validation.js   ← MIME, size, filename safety
  response.js     ← standard success/error shapes
  logger.js       ← structured upload logging
  index.js        ← barrel export (import everything from here)
```

---

## Quick-Start — Adding Uploads to a New Module

There are 3 steps: define your fields, wire the route, handle the DB.

### Step 1 — Define Your Field Config

In your route file, declare a `FILE_FIELDS` object:

```js
// routes/yourFeatureRoutes.js

const FILE_FIELDS = {
    profile_photo: {
        label:  'Profile Photo',
        accept: ['image/*'],
        maxMB:  10,
        column: 'profile_photo_url',     // DB column to update on success
        storageSubdir: 'profile_photos', // required if buildPublicUrl() will be used later
    },
    signed_contract: {
        label:  'Signed Contract',
        accept: ['application/pdf'],
        maxMB:  25,
        column: 'contract_file_url',
        storageSubdir: 'signed_contracts',
    },
};
```

**Field keys must be URL-safe strings** (lowercase, underscores only).  
They appear in the upload route URL as `/upload/:fieldKey`.

---

### Step 2 — Create an Uploader per Field

```js
const {
    createUploader,
    buildPublicUrl,
    safeDelete,
    resolvedMime,
    validateFilename,
    validateSize,
    uploadSuccess,
    uploadError,
    ERROR_CODES,
    logUpload,
} = require('../src/core/upload');

// Lazy-initialised uploaders — one per field, not one per request
const _uploaders = {};
function getUploader(fieldKey) {
    if (_uploaders[fieldKey]) return _uploaders[fieldKey];
    const rule = FILE_FIELDS[fieldKey];
    _uploaders[fieldKey] = createUploader({
        storageSubdir:   rule.storageSubdir,      // sub-folder under /storage
        allowedMimes:    rule.accept,
        maxFileSizeMB:   30,                      // transport cap; per-field cap enforced after
    });
    return _uploaders[fieldKey];
}
```

---

### Step 3 — Write the Upload Route Handler

```js
const pool = require('../src/core/database/pool');

async function handleUpload(req, res, recordId) {
    const { field } = req.params;
    const rule = FILE_FIELDS[field];

    // 1. Reject unknown fields before multer runs
    if (!rule) {
        return res.status(400).json(uploadError(ERROR_CODES.UNKNOWN_FIELD, { field }));
    }

    // 2. Run multer
    const multerErr = await getUploader(field)(req, res);

    if (multerErr) {
        const code = multerErr.code === 'LIMIT_FILE_SIZE' ? ERROR_CODES.TOO_LARGE : ERROR_CODES.WRONG_TYPE;
        const msg  = multerErr.code === 'LIMIT_FILE_SIZE'
            ? `${rule.label}: File too large. Max is ${rule.maxMB} MB.`
            : multerErr.message;
        logUpload({ route: req.path, field, recordId, result: 'rejected', code, error: msg });
        return res.status(400).json(uploadError(code, { field, error: msg }));
    }

    // 3. Confirm a file was actually received
    if (!req.file) {
        return res.status(400).json(uploadError(ERROR_CODES.NO_FILE, { field, error: `${rule.label}: No file received.` }));
    }

    // 4. Per-field size check (stricter than transport cap)
    const sizeCheck = validateSize(req.file.size, rule.maxMB, rule.label);
    if (!sizeCheck.ok) {
        safeDelete(req.file.path);
        return res.status(413).json(uploadError(ERROR_CODES.TOO_LARGE, { field, error: sizeCheck.error }));
    }

    // 5. Filename safety check
    const nameCheck = validateFilename(req.file.originalname || '');
    if (!nameCheck.ok) {
        safeDelete(req.file.path);
        return res.status(400).json(uploadError(ERROR_CODES.UNSAFE_FILENAME, { field, error: nameCheck.error }));
    }

    const mime    = resolvedMime(req.file);
    const fileUrl = buildPublicUrl(req, rule.storageSubdir, req.file.filename);

    // 6. Persist URL to DB — single client.release() in finally
    const client = await pool.connect();
    try {
        await client.query(
            `UPDATE your_table SET ${rule.column} = $1, updated_at = NOW() WHERE id = $2`,
            [fileUrl, recordId]
        );
    } catch (dbErr) {
        // File is on disk but DB failed — do NOT delete; client can safely retry
        console.error('[Upload] DB update failed — orphaned file:', req.file.path, dbErr.message);
        logUpload({ route: req.path, field, recordId, mime, sizeBytes: req.file.size, filename: req.file.filename, result: 'error', code: ERROR_CODES.DB_FAILED });
        return res.status(500).json(uploadError(ERROR_CODES.DB_FAILED, { field }));
    } finally {
        client.release();   // ← always exactly once, always here
    }

    logUpload({ route: req.path, field, recordId, mime, sizeBytes: req.file.size, filename: req.file.filename, result: 'success' });
    return res.json(uploadSuccess({ field, url: fileUrl, filename: req.file.filename, mime, size: req.file.size }));
}
```

---

### Step 4 — Register the Route with Auth

```js
const { requireAuth } = require('../src/core/middleware/auth');

// Protected upload — checks auth BEFORE multer runs
router.post('/api/v1/your-feature/:id/upload/:field',
    requireAuth,
    requireYourModuleOwnership,     // your ownership middleware (see Section 4)
    (req, res) => handleUpload(req, res, req.params.id)
);
```

> **Rule:** Auth middleware runs **before** multer. Never put auth logic inside `handleUpload`.

---

## API Contract

### Request
```
POST /api/v1/{feature}/{recordId}/upload/{fieldKey}
Content-Type: multipart/form-data      ← set by browser automatically, do NOT set manually
Body: form field named "file"
```

### Success — HTTP 200
```json
{
  "success": true,
  "field": "tnb_bill_1",
  "url": "https://app.railway.app/seda-files/tnb_bill_1_abc_1745123456_a1b2.pdf",
  "filename": "tnb_bill_1_abc_1745123456_a1b2.pdf",
  "mime": "application/pdf",
  "size": 184320
}
```

### Error — HTTP 400 / 403 / 404 / 413 / 500
```json
{
  "success": false,
  "code": "WRONG_TYPE",
  "field": "tnb_bill_1",
  "error": "TNB Bill Month 1: Wrong file type. Accepted: application/pdf."
}
```

### Error Codes

| Code | HTTP | Meaning | Client action |
|---|---|---|---|
| `NO_FILE` | 400 | FormData sent but no `file` key | Show "select a file" prompt |
| `WRONG_TYPE` | 400 | MIME/extension not in allowed list | Show accepted types |
| `TOO_LARGE` | 413 | File exceeds size limit | Show size limit |
| `UNSAFE_FILENAME` | 400 | Path traversal or null bytes in name | Log and show generic error |
| `UNKNOWN_FIELD` | 400 | fieldKey not in feature's config | Programming error — fix route |
| `RECORD_NOT_FOUND` | 404 | Record ID does not exist | Reload page |
| `FORBIDDEN` | 403 | Authenticated user does not own record | Show access denied |
| `STORAGE_FAILED` | 500 | Disk write failed | Retry |
| `DB_FAILED` | 500 | File saved to disk, DB update failed | Retry is safe; DB write can be attempted again |
| `SERVER_ERROR` | 500 | Unexpected error | Log and retry |

> **Retry safety:** Uploads are retry-safe, but persistence behavior depends on the module:
> - single-value fields (example: SEDA) replace the stored URL in the DB
> - array-backed fields (example: Invoice Office) append a new URL to the DB array
> - in both cases, a DB failure after disk write may leave an orphaned file on disk
>
> Do not document "overwrite" as a universal processor rule unless the feature actually implements overwrite semantics.

---

## Frontend — How to Upload a File

**The single rule: never set `Content-Type` manually on a multipart request.**  
The browser sets it with the correct multipart boundary automatically when you pass a `FormData` as the body.

### Minimal pattern
```js
async function uploadFile(inputEl) {
    const file = inputEl.files[0];
    if (!file) return;

    const form = new FormData();
    form.append('file', file);   // field name must be "file"

    const res  = await fetch(`/api/v1/your-feature/${recordId}/upload/${fieldKey}`, {
        method: 'POST',
        body: form
        // ← No Content-Type header here. Browser sets multipart boundary automatically.
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.success) {
        // Show json.error to the user
        return;
    }

    // json.url is the permanent public URL
}
```

### Multi-select UIs

If a screen allows selecting multiple files at once, keep the backend endpoint single-file and upload them sequentially from the frontend:

```js
async function uploadFilesSequentially(endpoint, files) {
    const uploaded = [];
    const failed = [];

    for (const file of files) {
        try {
            const form = new FormData();
            form.append('file', file, file.name);
            const res = await fetch(endpoint, { method: 'POST', body: form });
            const json = await res.json();
            if (!res.ok || !json?.success) throw new Error(json?.error || `Request failed (${res.status})`);
            uploaded.push(json);
        } catch (err) {
            failed.push(`${file.name}: ${err.message}`);
        }
    }

    return { uploaded, failed };
}
```

This keeps one bad file from failing the whole selection and still uses the same site-wide processor contract.

### What NOT to do
```js
// ✗ Wrong — never set Content-Type for multipart
fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/form-data' },   // ← breaks the boundary
    body: form
});

// ✗ Wrong — never convert to base64 and POST as JSON
const reader = new FileReader();
reader.readAsDataURL(file);
reader.onload = () => fetch(url, { body: JSON.stringify({ fileData: reader.result }) });

// ✗ Wrong — never use application/octet-stream for known typed files
fetch(url, { headers: { 'Content-Type': 'application/octet-stream' }, body: file });
```

---

## Auth and Ownership Model

### Public routes (customer-facing)
Authenticate by `shareToken` in the URL. Verify before calling `handleUpload`:

```js
router.post('/api/v1/your-feature-public/:shareToken/upload/:field', async (req, res) => {
    // 1. Verify token and get record ID
    const client = await pool.connect();
    let recordId;
    try {
        const record = await yourRepo.getByShareToken(client, req.params.shareToken);
        if (!record) return res.status(404).json(uploadError(ERROR_CODES.RECORD_NOT_FOUND));
        recordId = record.id;
    } finally {
        client.release();
    }

    // 2. Inject ID so the uploader's filename generator can use it
    req.params.id = recordId;

    // 3. Handle upload
    return handleUpload(req, res, recordId);
});
```

### Protected routes (agent/admin)
Add `requireAuth` + an ownership middleware **on the router**, not inside `handleUpload`:

```js
// Your ownership middleware
async function requireRecordOwnership(req, res, next) {
    const client = await pool.connect();
    try {
        const record = await client.query(
            'SELECT owner_id, created_by FROM your_table WHERE id = $1',
            [req.params.id]
        );
        if (!record.rows.length) return res.status(404).json(...);

        const agentId = await resolveAgentBubbleId(client, req);
        const isAdmin = Array.isArray(req.user?.access_level) && req.user.access_level.includes('admin');

        if (!isAdmin && record.rows[0].owner_id !== agentId && record.rows[0].created_by !== agentId) {
            return res.status(403).json(uploadError(ERROR_CODES.FORBIDDEN));
        }

        req.record = record.rows[0];
        next();
    } finally {
        client.release();
    }
}

// Wire it
router.post('/api/v1/your-feature/:id/upload/:field',
    requireAuth,               // ← first
    requireRecordOwnership,    // ← second
    (req, res) => handleUpload(req, res, req.params.id)   // ← third
);
```

---

## Extraction / Verification (When You Need to Process Uploaded Files)

If you need to scan an uploaded file (OCR, AI verification, etc.) **after upload**, do not have the frontend re-download and re-send the file as base64. The file is already on disk.

### Correct pattern — server reads from disk
```js
const { resolveDiskPath } = require('../src/core/upload');
const fs = require('fs');

router.post('/api/v1/your-feature/extract-data', async (req, res) => {
    const { recordId, fieldKey } = req.body;

    const client = await pool.connect();
    try {
        const r    = await client.query('SELECT file_url FROM your_table WHERE id = $1', [recordId]);
        const url  = r.rows[0]?.file_url;
        if (!url) return res.status(400).json({ success: false, error: 'No file uploaded yet.' });

        // Read from disk — no HTTP round-trip
        const diskPath = resolveDiskPath(url, 'your_feature_files');
        if (!diskPath) return res.status(400).json({ success: false, error: 'File not found on disk.' });

        const buffer = fs.readFileSync(diskPath);
        const result = await yourExtractionService.process(buffer);

        res.json({ success: true, data: result });
    } finally { client.release(); }
});
```

### Frontend call for extraction
```js
// Send just the IDs — server resolves the file path
const res  = await fetch('/api/v1/your-feature/extract-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recordId, fieldKey })
});
```

---

## Delete Strategy — Default to Fake Delete

User-facing delete should be treated as **soft delete / fake delete first**, not physical disk deletion.

### Business Rules (Current Decision)

For this app, fake delete means:

1. developers / system operators can still access the file in storage
2. the sales agent who deleted the file can recover it later
3. normal admin / operations / administration staff must **not** see fake-deleted files in their normal workflow

This means:

- fake-deleted files stay on disk
- fake-deleted files are removed from the active business record
- fake-deleted files are **hidden** from normal business/admin screens
- recovery must happen through a dedicated recovery tool, modal, page, or maintenance flow

### Why this is the default recommendation

- user mistakes are common
- DB unlink is reversible; filesystem unlink is not
- physical deletion is where accidental destructive bugs usually happen
- admin purge can happen later in a safer, slower path

### Recommended lifecycle

1. upload saves file to disk and stores public URL in DB
2. user clicks delete
3. feature removes the file from the active record in the main business table
4. feature inserts a recycle-bin row for later recovery/purge
5. separate admin or scheduled purge job permanently deletes old trash files

### What fake delete means in practice

From the normal working user's point of view:
- the file disappears from the screen
- the file no longer appears in the active DB field

From the system's point of view:
- the file is **not** physically deleted yet
- the file is marked as trash somewhere durable

### Recommended implementation shape

The preferred processor pattern is:

- active reference is removed from the existing business table/column
- recycle state is stored in a **separate additive table**
- normal connected systems continue reading the main business table and therefore see the file as deleted
- only recovery-aware flows read the recycle-bin table

### Visibility rule

Fake-deleted files must be treated as **hidden operational state**, not as normal business data.

That means:

- active upload sections should not show them
- normal admin/staff pages should not show them
- only a dedicated recovery workflow should expose them
- developers may still inspect them directly from storage or maintenance tools

### Recommended recycle-bin table

Use an additive table, for example:

`recycle_bin_upload`

Suggested fields:

| Column | Purpose |
|---|---|
| `id` | Primary key |
| `module` | Source module, e.g. `invoice-office`, `seda` |
| `linked_record_type` | e.g. `invoice`, `seda_registration` |
| `linked_record_id` | The owning record bubble ID / primary business ID |
| `field_key` | Which upload field the file came from |
| `file_url` | Stored public URL |
| `storage_subdir` | Storage bucket/subdir such as `roof_images` |
| `original_filename` | Optional display/debug value |
| `mime_type` | Optional display/debug value |
| `deleted_by` | User/agent who triggered fake delete |
| `deleted_at` | When fake delete happened |
| `restored_by` | Who restored it |
| `restored_at` | When it was restored |
| `purged_at` | When physical deletion happened |
| `metadata_json` | Optional module-specific extra data |

Important rule:

- this table is **additive**
- it does not alter existing upload columns
- it exists specifically so fake-delete state is shared cleanly across connected systems

### User delete route pattern

The user-facing delete route should:

1. authenticate the requester
2. verify ownership/access to the record
3. remove the file URL from the active DB field in the main business table
4. insert a recycle-bin row
5. **not** call `safeDelete()` on the stored file path

```js
router.delete('/api/v1/your-feature/:id/file', requireAuth, async (req, res) => {
    const { id } = req.params;
    const { url, field } = req.body;

    // 1. verify auth + ownership
    // 2. remove URL from active DB field in main table
    // 3. insert recycle-bin row
    // 4. commit
    // 5. return success
});
```

### Transaction rule

Fake delete should be one transaction:

1. remove active reference from the main table
2. insert recycle-bin record
3. commit

This prevents inconsistent states where the file disappears from the main record but no recovery record exists.

### What NOT to do in fake delete mode

```js
// ✗ Wrong — do not physically delete on user action
safeDelete(resolveDiskPath(url, 'your_feature_files'));

// ✗ Wrong — do not trust a raw client-supplied filesystem path
safeDelete(req.body.path);

// ✗ Wrong — do not show fake-deleted files in normal admin/business screens
renderDeletedFilesInlineOnNormalPage();

// ✗ Wrong — do not hide recycle state only in a local file/ledger
appendToLocalTrashFileOnly();
```

### Recovery later

Recovery should be separate from the normal upload page.

Recommended behavior:

- sales agent opens a dedicated recovery tool or recovery modal
- sees only files they are allowed to recover
- chooses a fake-deleted file
- system restores the URL back into the active DB field in the main table
- recycle-bin row remains as audit history or is marked with `restored_at` / `restored_by`

Do not mix recovery controls into the default admin workflow unless explicitly requested.

### Physical purge later

Physical deletion should happen in a separate admin-only flow or scheduled script:

- read recycle-bin rows that are not restored and not already purged
- skip entries newer than the retention window
- resolve disk path from the stored URL + known subdir
- delete only inside the expected storage root
- mark the recycle-bin row as purged

This keeps user delete simple and non-destructive while still giving the app a real cleanup path later.

---

## Schema Change Rule

DB schema changes are **not assumed** for upload processor work.

### Default rule

- prefer script/runtime implementation first
- prefer additive structures only when necessary
- do **not** alter existing schema silently

### If schema change is needed

You must propose it first before implementation.

Preferred order of acceptability:

1. no schema change
2. additive schema only
3. alteration of existing schema only with explicit approval

### Important constraint

Altering existing upload-related columns, changing their meaning, or repurposing existing fields can be destructive across connected systems.

Therefore:

- additive schema may be acceptable
- a new recycle-bin table is an example of an acceptable additive schema
- altering existing schema must be proposed and approved first
- never assume a migration is safe just because it helps the upload design

---

## Storage

### Where files go
```
RAILWAY_VOLUME_MOUNT_PATH/    ← set by Railway env var
  your_feature_files/         ← storageSubdir you specify
    field_recordId_ts_rand.pdf

storage/                      ← local dev fallback (./storage from project root)
  your_feature_files/
    field_recordId_ts_rand.pdf
```

### Static file serving
Files are served as static assets. If you use a new `storageSubdir`, register a corresponding static route in `server.js`:

```js
// server.js — register a static route for your new subdir
const YOUR_FEATURE_DIR = path.join(
    process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'storage'),
    'your_feature_files'
);
app.use('/your-feature-files', express.static(YOUR_FEATURE_DIR));
```

Also add the subdir-to-route mapping in `src/core/upload/storage.js`:

```js
// storage.js — SUBDIR_ROUTE_MAP
const SUBDIR_ROUTE_MAP = {
    'seda_registration': 'seda-files',
    'agent_documents':   'agent-docs',
    'your_feature_files': 'your-feature-files',   // ← add your entry
};
```

### Default filename format
```
{fieldKey}_{recordId}_{timestamp}_{4-byte-random}.{ext}

Example:
  tnb_bill_1_seda_abc123_1745123456789_a1b2c3d4.pdf
```

To customise the filename, pass `generateFilename` to `createUploader`:
```js
createUploader({
    storageSubdir: 'your_feature_files',
    allowedMimes:  rule.accept,
    maxFileSizeMB: 25,
    generateFilename: (req, file) => {
        const { fileExtension } = require('../src/core/upload');
        return `custom_${req.params.id}_${Date.now()}${fileExtension(file)}`;
    }
});
```

---

## MIME Reference

### Common accepted patterns

| Pattern | Matches |
|---|---|
| `'image/*'` | JPEG, PNG, WebP, HEIC, GIF, BMP |
| `'application/pdf'` | PDF only |
| `'image/jpeg'` | JPEG only |
| `['application/pdf', 'image/*']` | PDF and any image |

### iOS / Android MIME caveat
Mobile devices (especially iOS) sometimes send `application/octet-stream` as the declared MIME type.  
The engine's `resolvedMime()` handles this by falling back to extension sniffing from `originalname`.  
**Do not add `application/octet-stream` to your `accept` list** — it bypasses type checking.

---

## Logging Reference

Every upload emits one log line. Format:

```
[Upload OK]       route=/api/v1/seda/:id/upload/:field  field=tnb_bill_1  record=seda_abc123  mime=application/pdf  size=180.23KB  file=tnb_bill_1_seda_abc123_1745099_a1b2.pdf
[Upload Rejected] route=...  field=tnb_bill_1  ...  code=WRONG_TYPE  err="TNB Bill Month 1: Wrong file type..."
[Upload Error]    route=...  field=tnb_bill_1  ...  code=DB_FAILED  err="relation does not exist"
```

To find upload failures in production logs:
```
grep "Upload Rejected\|Upload Error" your-log-file
```

To find all uploads for a specific record:
```
grep "record=seda_abc123" your-log-file
```

---

## Testing

Current processor-related tests in this repo:

```bash
npm run test:seda-upload
npm run test:invoice-office-upload
node scripts/test_seda_route_guards.js
```

What each test covers:

- `scripts/test_seda_upload.js`
  - HTTP-layer SEDA upload contract
  - no DB required
- `scripts/test_invoice_office_upload.js`
  - HTTP-layer Invoice Office upload contract
  - no DB required
- `scripts/test_seda_route_guards.js`
  - real `routes/sedaRoutes.js` mounted with mocked dependencies
  - verifies auth, ownership, public upload access, and extraction route reachability

For pure processor onboarding, the first two tests are the main template.  
Use the route-guard pattern when a module has more complex auth/routing rules.

### When you add a new module, add a dedicated test script

```js
// scripts/test_your_feature_upload.js

// Add to test_all_fields_accept_correct_types():
{ field: 'your_new_field', buf: MINIMAL_PDF, file: 'doc.pdf', mime: 'application/pdf' },

// Add a rejection case:
async function test_wrong_type_for_your_field() {
    const name = '[REJECT] Wrong type for your_new_field';
    const { ok, status } = await upload('your_new_field', MINIMAL_JPG, 'img.jpg', 'image/jpeg');
    if (ok) return fail(name, 'Should have rejected JPEG');
    pass(name, `Rejected with HTTP ${status}`);
}
```

### Test cases every new module must cover

| Scenario | Expected |
|---|---|
| Valid file, correct type | HTTP 200, `success: true`, file on disk |
| Wrong MIME type | HTTP 400, `code: WRONG_TYPE` |
| File exceeds size limit | HTTP 400/413, `code: TOO_LARGE` |
| Empty FormData (no file) | HTTP 400, `code: NO_FILE` |
| Unknown field key | HTTP 400, `code: UNKNOWN_FIELD` |
| Non-existent record ID | HTTP 404, `code: RECORD_NOT_FOUND` |
| No auth cookie on protected route | HTTP 401 before multer runs |
| Another user's record | HTTP 403 before multer runs |
| Retry same upload after transient failure | HTTP 200, DB write succeeds on retry |
| File with path traversal in name | HTTP 400, `code: UNSAFE_FILENAME` |

If the feature supports fake delete:

| Scenario | Expected |
|---|---|
| User delete on owned record | HTTP 200, active DB reference removed |
| User delete does not unlink disk file immediately | File still exists on disk |
| Trash ledger entry written | Trash record exists with `deletedAt` |
| Unauthorized delete | HTTP 403/401 |

---

## Checklist — Before Submitting a New Upload Feature

- [ ] Field config defined in the route file (`FILE_FIELDS` object)
- [ ] `createUploader` called per field — not per request
- [ ] `handleUpload` calls `logUpload` on every outcome
- [ ] `client.release()` appears only in `finally`, never in `catch`
- [ ] Auth middleware runs before `handleUpload` — not inside it
- [ ] Ownership middleware verifies requester has access to the record
- [ ] `storageSubdir` registered in `storage.js` SUBDIR_ROUTE_MAP
- [ ] Static file route registered in `server.js`
- [ ] Extraction reads from disk via `resolveDiskPath()` — not from base64 POST
- [ ] If delete is supported, it uses fake delete by default (DB unlink + trash mark, no immediate disk unlink)
- [ ] Frontend uses plain `FormData` — no manual `Content-Type` header
- [ ] Test cases cover at minimum the 10 scenarios listed above
- [ ] Relevant upload tests pass for the module

---

## Reference — Current Modules Using This System

| Module | storageSubdir | Route prefix | Protected? |
|---|---|---|---|
| SEDA Registration | `seda_registration` | `/api/v1/seda/:id/upload/:field` | ✓ requireAuth + requireSedaOwnership | single DB URL field |
| SEDA Public (customer) | `seda_registration` | `/api/v1/seda-public/:shareToken/upload/:field` | shareToken | single DB URL field |
| Invoice Office | `roof_images`, `site_assessment_images`, `pv_drawings` | `/api/v1/invoice-office/:bubbleId/upload/:field` | ✓ requireAuth + invoice ownership | array-backed DB fields |

Add your module here when onboarded.

---

## Contact / Questions

File: `routes/sedaRoutes.js` — reference implementation  
Engine: `src/core/upload/` — source of truth  
Tests: `scripts/test_seda_upload.js`  
Design note: `.gemini/antigravity/brain/.../upload_processor_design.md`
