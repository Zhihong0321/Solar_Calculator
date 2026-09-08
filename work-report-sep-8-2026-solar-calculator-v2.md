DATE  : Sep 8, 2026
REPO NAME : Solar Calculator v2

- Fixed PDF upload in claim submission with rasterization fallback and resilient manual entry on failed OCR.
- Added photo/PDF upload support for hostel, toll, and meal sections in Business Trip Allowance form with R2 upload and clickable links in My Claims and Admin Review.
- Added Excel (CSV) report generation in Claim Review admin system with filter-aware exports and UTF-8 BOM encoding.
- Validated and restored AI OCR receipt parsing endpoint following provider key update and session routing configuration.
- Fixed Serial Number Scanner buttons not responding on mobile: repaired a JavaScript syntax error in escapeHtml (unterminated string in the HTML entity map) that stopped the whole page script from parsing, so Start Camera, Stop, and Torch now bind and work.
- Fixed Serial Number Scanner camera never decoding: request 1080p stream with continuous autofocus instead of the default 640x480 fixed-focus feed, switched the scan box from square to a wide horizontal band for 1D barcodes, and enabled the native BarcodeDetector fast path on Chrome Android.
- Fixed Serial Number Scanner camera start crash ("cameraIdOrConfig object should have exactly 1 key"): html5-qrcode 2.3.8 only accepts a single-key constraints object, so start() now passes { facingMode } only; the 1080p resolution and continuous-autofocus upgrade is re-applied to the live track via separate applyConstraints calls (resolution first, focusMode second, so unsupported autofocus can no longer abort the resolution bump), and the stream is recovered from the library-injected video element because start() resolves with null. Verified live in browser at 1920x1080 with no startup errors.
- Added invoice search, equipment detection, and batch barcode linkage to Serial Number Scanner: created PostgreSQL `barcode` table with `UNIQUE(linked_product, barcode)` and relational `linked_barcode text[]` on `invoice`; built backend endpoints (`/api/v1/invoices/scanner/search`, `/:bubbleId/scanner-context`, `/:bubbleId/barcodes`); and updated `serial_scanner.html` with invoice search dropdown, equipment target cards (panels & inverters with 0/N counters and progress bars), partial saving support (e.g. saving 12/20 at any time), silent auto-skipping of already saved barcodes on rescan, audio/haptic cues, and batch saving.

=====================


