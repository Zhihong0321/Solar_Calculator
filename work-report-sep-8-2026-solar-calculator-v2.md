DATE  : Sep 8, 2026
REPO NAME : Solar Calculator v2

- Fixed PDF upload in claim submission with rasterization fallback and resilient manual entry on failed OCR.
- Added photo/PDF upload support for hostel, toll, and meal sections in Business Trip Allowance form with R2 upload and clickable links in My Claims and Admin Review.
- Added Excel (CSV) report generation in Claim Review admin system with filter-aware exports and UTF-8 BOM encoding.
- Validated and restored AI OCR receipt parsing endpoint following provider key update and session routing configuration.
- Fixed Serial Number Scanner buttons not responding on mobile: repaired a JavaScript syntax error in escapeHtml (unterminated string in the HTML entity map) that stopped the whole page script from parsing, so Start Camera, Stop, and Torch now bind and work.

=====================

