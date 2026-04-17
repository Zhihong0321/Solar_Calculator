DATE  : Apr 17, 2026
REPO NAME : Solar Calculator v2

- Fixed domestic-mobile repeat bill checks so stale solar requests and previous result state no longer overwrite the next package match.
- Clarified the mobile calculator language toggle so it shows the active language and switch target, and synced the page language state to prevent EN/Chinese mismatch confusion.
- Updated the live B3-16.0-LV battery product warranty name to DIRECT SAJ in the database.
- Added linked_product to invoice_item in the live database and invoice code paths so quotation extra items can link directly to product records.
- Wired calculator battery selection into quotation handoff so 16/32/48 kWh choices auto-create linked B3-16.0-LV battery invoice items at RM 7,500 each.
- Extended invoice warranty collection so final quotation previews also scan invoice_item linked_product records, including battery items.
- Retired the hybrid inverter upgrade script path from create and edit quotation flows so agents can only change packages directly.
- Added a TNB BILL LIBRARY quick access link to the shared customer bill Google Drive folder.

=====================
