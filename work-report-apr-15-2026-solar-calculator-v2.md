DATE  : Apr 15, 2026
REPO NAME : Solar Calculator v2

- Verified production hybrid rule coverage for SAJ R5 5KW example
- Backfilled missing product bubble IDs in production
- Kept hybrid upgrade UI visible in create invoice and added disabled-state messaging instead of hiding it
- Applied the same always-visible hybrid upgrade UI behavior to edit invoice flow
- Made hybrid upgrade UI always visible and greyed out instead of hidden in create and edit invoice flows
- Added hybrid upgrade fallback to package details endpoint so invoice pages can load upgrade options even when the dedicated hybrid route fails
- Added safe audit-context fallbacks so the invoicing app can boot even if agentAuditContext is missing in deployment
- Patched production hybrid upgrade rules to use 3P target snapshots and added the missing 3P R5 10KW to H2 10KW mapping
- Removed stock-ready wording and warnings from hybrid upgrade UI flows
- Fixed invoice creation referral lead dropdown to keep assigned leads selectable when linked_invoice stores a customer id.
- Fixed residential proposal view to show calculator-matched solar savings.
- Verified proposal savings rendering matches saved residential calculator values and leaves commercial proposals unchanged.
- Verified create-invoice keeps latest solar savings values from calculator through URL handoff, hidden fields, request payload, and invoice persistence.
- Built and pushed the residential proposal savings display fix.

=====================
