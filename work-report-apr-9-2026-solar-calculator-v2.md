DATE  : Apr 9, 2026
REPO NAME : Solar Calculator v2

- Made the WhatsApp check proxy resilient to upstream 'not ready' failures and configurable via WHATSAPP_API_URL
- Added a temporary kill switch to disable WhatsApp customer API calls and photo sync
- Made the commercial ROI report auto-refresh when simulation parameters or working hours change.
- Fixed commercial panel quantity recalculation so the saving report refreshes immediately and stays in sync with the quantity input.
- Unified commercial ROI recomputation so every parameter change reruns the same analysis path.
- Looked up the 500 kWh low-voltage bill simulation amount
- Compared the 500 kWh low-voltage bill simulation against the standalone bill formula
- Explained why the 500 kWh low-voltage bill script differs from the bill simulation table
- Rewrote the LV non-domestic bill script to match the tariff table schema
- Rewrote the LV non-domestic bill calculator for real-life commercial billing

=====================
