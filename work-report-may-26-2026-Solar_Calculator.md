# Work Report - May 26, 2026 - Solar Calculator

## Task: Query SEDA Registration TNB Bill Attachments (Last 60 Days)

- Queried `seda_registration` table via Postgres proxy for TNB Bill attachment URLs
- Found **129 records** with at least one TNB Bill in the last 60 days (Mar 29 – May 25, 2026)
- Extracted **354 TNB Bill URLs** total (127 bill_1, 116 bill_2, 111 bill_3)
- Two URL hosting patterns identified:
  - `calculator.atap.solar/seda-files/...` (public-facing)
  - `admin.atap.solar/api/files/seda/tnb_bills/...` (admin API)
- File formats: mostly `.pdf`, some `.jpg`/`.jpeg`/`.png`
- Full list saved to `tnb_bills_last_60_days.txt` in repo root
