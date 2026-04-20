DATE  : Apr 20, 2026
REPO NAME : Solar Calculator v2

- Located Invoice Office roof image and PV drawing upload code paths.
- Added Invoice Office site assessment image upload array, API routes, and UI section.
- Adopted the shared file upload processor for Invoice Office and aligned the processor docs/routes.
- Added and ran a local Invoice Office upload processor test harness with no-DB HTTP coverage.
- Added and pushed a live Invoice Office upload diagnostic page with detailed request and response logging.
- Added SEDA route-guard regression test to verify auth, ownership, public upload access, and extraction route wiring.
- Updated the site-wide file upload processor guide to match current SEDA and Invoice Office behavior and documented fake-delete/trash-ledger design.
- Implemented fake delete for Invoice Office and SEDA uploads using a shared trash ledger, added deleted-file UI sections, and kept physical files on disk for later admin purge.
- Updated the file upload processor guide with stricter fake-delete rules and explicit schema-change approval rules.
- Updated the file upload processor guide to replace the old local trash-ledger fake-delete design with the additive recycle-bin table model.
- Implemented recycle-bin based fake delete and restore for Invoice Office and SEDA uploads, with the new shared migration and live UI recovery actions.

=====================

- Identified root cause of SEDA TNB Bill Upload failure persisting 90+ days: global express.json() was consuming the multipart/form-data request stream before multer could read it, leaving req.file undefined on every upload attempt.
- Fixed server.js: replaced global express.json() with a conditional middleware that skips body parsing for multipart/form-data requests, allowing multer to always receive an unconsumed stream.

=====================

- Complete redo of SEDA file upload system (backend + frontend). Rewrote sedaRoutes.js from scratch with a single flat handleUpload() function: validate field → run multer → check file → update DB → return URL. No wrappers, no chains.
- Rewrote all upload JavaScript in seda_register.html with one uploadFile() function: pick file → POST FormData → show result. Old 1000-line tangled JS replaced with 500 lines of clean, flat code.
- All 8 upload fields (MyKad front/back/pdf, TNB bill 1/2/3, property proof, meter) use the identical code path.

=====================

- Architecture review: produced design note identifying 5 defects in the first rewrite (missing requireAuth, double client.release crash path, extraction re-fetch cycle, separate pg.Pool, ID trust without ownership).
- Extracted generic upload engine into src/core/upload/ (engine.js, storage.js, validation.js, response.js, logger.js, index.js). Reusable across all app modules with no feature-specific knowledge.
- Fixed double client.release() bug in handleUpload — patched to single release in finally block only.
- Added requireAuth + requireSedaOwnership middleware to all protected SEDA routes (upload, GET, POST, PATCH status).
- Switched sedaRoutes.js from local pg.Pool to shared src/core/database/pool.
- Fixed extraction routes to read files from disk using resolveDiskPath() — eliminated the fetch → blob → base64 → POST re-upload cycle.
- Added structured upload logging (logUpload) to every upload attempt.
- Added filename safety validation (path traversal, null bytes).
- Updated frontend extraction calls to new { sedaId, fieldKey } API — removed blobToDataUrl and all base64 handling from browser.
- All 17 upload tests pass after rebuild (npm run test:seda-upload).

=====================
