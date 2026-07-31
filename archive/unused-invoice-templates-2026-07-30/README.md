# Archived Invoice Templates

**Archive Date:** 2026-07-30  
**Reason:** Templates not in production use; replaced by V2 and A4 views

## Archived Components

### 1. Legacy View (V1)
- **Generator:** `invoiceHtmlGenerator.js`
- **Routes:** `/legacy-view/:tokenOrId`, `/legacy-view/:tokenOrId/pdf`, `/proposal/:shareToken`
- **Description:** Original HTML invoice display with basic layout
- **Last Active:** Moved to `/legacy-view/` on 2026-03-20, unused since V2 became default

### 2. V3 View (Mobile SPA)
- **Generator:** `invoiceHtmlGeneratorV3.js`
- **Routes:** `/view-v3/:tokenOrId`, `/view-v3-preview/:tokenOrId`, and related endpoints
- **Description:** Single-page app with tabbed sections (home, spec, quotation, slide, tnc) and bottom navigation
- **Features:** Multi-language support, mobile/tablet optimized
- **Status:** Never went into production; V2 remained the default

## Active Templates (Still in Use)

### V2 View (Default)
- **Generator:** `invoiceHtmlGeneratorV2.js`
- **Routes:** `/view/:tokenOrId`, `/view2/:tokenOrId`
- **Description:** Mobile-optimized with green gradient, card layout, bill projections
- **Status:** ✅ Current production default

### A4 Print View
- **Generator:** `invoiceHtmlGeneratorA4.js`
- **Routes:** `/view/:tokenOrId?layout=a4`
- **Description:** Print-optimized A4 layout (210mm × 297mm)
- **Status:** ✅ Active for printing/PDF generation

## Restoration Instructions

If you need to restore these templates:

1. Copy the generator files back to `src/modules/Invoicing/services/`
2. Restore the route handlers from this archive's `ROUTES_REMOVED.md`
3. Re-add imports in `invoiceViewRoutes.js`:
   ```javascript
   const invoiceHtmlGenerator = require('../services/invoiceHtmlGenerator');
   const invoiceHtmlGeneratorV3 = require('../services/invoiceHtmlGeneratorV3');
   ```

## Testing

A test server script is available at project root: `test-invoice-templates.js`
Run: `node test-invoice-templates.js` to preview all templates locally.

## Related Files

- Route handlers: See `ROUTES_REMOVED.md` in this directory
- V3 development folder: `/v3-quotation-view/` (contains sample outputs and preview files)
