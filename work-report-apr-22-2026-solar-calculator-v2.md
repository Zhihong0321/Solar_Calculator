DATE  : Apr 22, 2026
REPO NAME : Solar Calculator v2

- Extracted shared invoice page startup and prefill helpers so create and edit quotation pages use the same initialization flow.
- Extracted shared invoice page listener wiring and workspace status helpers so create and edit quotation pages share more UI behavior.
- Extracted shared invoice workspace shell navigation helpers so create and edit quotation pages use the same section navigation behavior.
- Prepared and pushed a dedicated playtest branch with the current invoice maintenance changes for deployment validation.
- Added a playtest-only phone-based auth bypass so the test deployment can skip OTP and log in directly as the target user.
- Simplified the playtest auth bypass so enabling the flag fully disables normal auth checks and auto-resolves the configured test user.
- Removed the playtest auth env gates and hardcoded direct login as 01121000099 on the playtest branch for immediate deployment testing.
- Fixed voucher loading fallback for invoice create and edit pages.
- Hardened SEDA PDF upload handling for iPhone-safe filename fallback and non-breaking error responses.
- Committed and pushed the invoice voucher loading fallback fix on a dedicated branch.
- Removed the accidental playtest auto-auth bypass from the active SEDA PDF upload fix branch and pushed the auth rollback.
- Made invoice edit voucher loading fail fast and continue when saved voucher selection lookup stalls.
- Fixed voucher expiry SQL so text-based available-until values load correctly on invoice voucher screens.
- Refreshed the AI-first maintenance map and logged the next recommended maintenance target.
- Extracted invoiceHtmlGeneratorV2 browser interaction helpers into a focused support module.
- Fixed invoice edit version saves so April promo flags are preserved and added a regression test.
- Added explicit create-vs-edit promo warning comments so invoice edits preserve saved promo settings.

=====================
