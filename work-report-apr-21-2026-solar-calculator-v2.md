DATE  : Apr 21, 2026
REPO NAME : Solar Calculator v2

- Added quick share button to invoice view header
- Restricted invoice view share button to logged-in agents only
- Installed the AI-first maintenance bundle in the repo.
- Verified the AI-first maintenance bundle install and activation status.
- Ran the first AI-first maintenance baseline pass and logged the repo state.
- Ran the AI-first maintenance mapping pass and ranked the next cleanup target.
- Archived the unused legacy backup folder out of the active repo path.
- Removed the unreferenced temporary database probe script from the repo root.
- Extracted invoice financial-rule helpers from invoiceRepo into a focused module and verified the split.
- Updated the repo-local AI-first maintenance bundle from GitHub to the latest upstream commit.
- Extracted invoice schema helpers from invoiceRepo into a focused support module and verified the split.
- Hardened the domestic panel quantity recalculation so slow responses cannot overwrite a newer package selection.
- Swapped the domestic calculator route to the mobile page and preserved the old calculator at /legacy-domestic.
- Validated read-only database proxy access for DB-backed maintenance checks.
- Extracted invoice voucher helpers into a focused support module and verified the split with DB proxy checks.
- Extracted invoice estimate helpers into a focused support module and verified the split with DB schema checks.
- Fixed critical "Network error" fetch failures in SEDA file upload by resolving path.extname unhandled rejection.
- Fixed Express ECONNRESET crash during SEDA upload rejections by properly draining the multipart request stream.
- Extracted invoice-item insertion helpers into a focused support module and verified the split locally.
- Extracted invoice lookup helpers into a focused support module and verified the split with live table checks.
- Verified live DB write paths safely and cleaned up the temporary verification rows.
- Hotfixed the SEDA MyKad PDF upload path with a larger limit and early user-side size validation after live failure reports.
- Re-enabled SEDA MyKad PDF and TNB bill PDF uploads through the site-wide file upload processor and revalidated the SEDA upload flow.
- Removed shared filename-based upload rejection so SEDA uploads sanitize original names instead of blocking them.

=====================
