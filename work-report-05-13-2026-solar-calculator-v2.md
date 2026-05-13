# Work Report — May 13, 2026 — Solar Calculator v2

## Task: Update Hybrid Package Prices and Invoice Descriptions

Updated all hybrid inverter packages in the `package` table to match the new pricing from `HYBIRD-PACKAGE-V1.csv`.

### What was done
- Queried and analyzed the `package`, `product`, `package_item`, `package_formula`, and `package_test` schema
- Compared all 131 hybrid packages (1P and 3P, 590W / 620W / 650W) against the CSV
- Found every package price was exactly RM600 below the CSV target price
- Found all packages were missing the MSIG insurance line in `invoice_desc`
- Executed a single UPDATE statement that:
  - Increased `price` by +600 for all hybrid packages
  - Appended `3 Year MSIG All-Risk Solar System Coverage up to RM10000 assured` to `invoice_desc`
  - Set `updated_at = now()`

### Result
- **131 rows updated** — all hybrid packages now match CSV prices and include the MSIG coverage line
- Verified spot-checked packages: prices match CSV exactly, MSIG line present

---

## Task: ADD ON ATS Banner for Hybrid Inverter Packages

Added an optional ATS add-on prompt to both the invoice creation and invoice edit flows.

### What was done
- Added `ATS_ADDON_PRICE = 500` and `ATS_ADDON_DESCRIPTION = 'ADD ON ATS'` constants to both `create_invoice.js` and `edit_invoice.js`
- Added helper functions to both JS files:
  - `isATSItem(item)` — detects if an invoice item is an ATS item
  - `isHybridPackage(packageName)` — detects hybrid packages by name (matches HYBRID / HYBIRD)
  - `hasATSInManualItems()` — checks if ATS already exists in current manual items
  - `syncATSAddonBanner()` — shows/hides the banner based on hybrid detection + existing ATS check
  - `onATSAddonToggle(checked)` — adds or removes the ATS item from `manualItems` and refreshes preview
- Added the ATS banner HTML to `create_invoice.html` and `edit_invoice.html` inside the "Additional Items" section
- Called `syncATSAddonBanner()` from `showPackage()` in both JS files (fires on package load/change)
- In edit flow: also called after existing items are hydrated so the banner hides correctly if ATS already exists

### Behavior
- Banner appears only when: selected package is Hybrid AND no ATS item already in the invoice
- Tick checkbox → ADD ON ATS (RM 500, qty 1) is added to invoice items and live preview updates
- Untick → ATS item is removed
- If ATS already exists (loaded from saved invoice), banner stays hidden
