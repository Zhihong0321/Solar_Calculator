# Baseline Note

Date: 2026-04-21
Stage: baseline-locked
Target: Solar estimate normalization and invoice preview rendering

What was checked:
- Ran `npm run test:solar-estimate-consistency`
- Ran `node --check server.js`

What appears stable:
- Snapshot-based solar estimate normalization passed for the documented RM300, RM600, RM900, preview-bug, saved-estimate, and legacy-fallback scenarios.
- Invoice preview rendering remained consistent in both `invoiceHtmlGenerator` and `invoiceHtmlGeneratorV2` for those snapshot scenarios.
- `server.js` passed a Node syntax check.

What remains uncertain:
- Live calculator scenarios were skipped because `DATABASE_URL` and `DATABASE_URL_TARIFF` were not available in this environment.
- This run did not verify authenticated flows, database-backed invoice office behavior, or browser navigation flows.

Readiness:
- Ready for `map-ready` read-only maintenance work.
- Not yet a strong enough baseline for risky cleanup or structural changes in DB-backed areas without additional runtime verification.
