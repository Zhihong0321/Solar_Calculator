DATE  : Apr 10, 2026
REPO NAME : Solar Calculator v2

- Overhauled Invoice V3 view from single scrolling layout to a modern mobile-first SPA with bottom navigation tabs and localized content support, keeping local preview workflow intact.
- Investigated my-invoice visibility and verified the invoices were stored under user 1 with a Gan Zhi Hong agent link
- Added user_debug table and auth fallback logging to trace identity resolution mismatches
- Standardized invoicing identity to prefer user bubble_id and normalized legacy invoice creator records
- Removed production-facing user.id leaks from user profile and sales team responses
- Standardized auth consumption around user bubble ID with compatibility-safe route fixes
- Validated bubble-ID auth patch with local smoke tests against Railway production data reads
- Ran local auth and route smoke tests for bubble ID identity rollout readiness
- Validated project build after bubble ID identity rollout changes

=====================
