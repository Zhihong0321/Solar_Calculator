DATE  : Jul 10, 2026
REPO NAME : Solar Calculator v2

- Investigated daily OTP reauthentication and traced the session boundary to the external auth.atap.solar JWT service.
- Refined the OTP investigation: the app may reject a still-persistent one-month cookie because JWT validity, cookie delivery, or signature verification fails independently.
- Updated the referral overview table headers and added separate Record Date and Last Activity Date columns.
- Corrected referral overview linkage labels to show both Customer Profile and the actual Linked Invoice number.
- Added the referral overview soft-delete button and restricted the overview to users with the ee-core access tag.
- Made the referral overview mobile-friendly by rendering each lead row as a responsive card below the desktop breakpoint.

=====================
