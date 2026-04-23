DATE  : Apr 23, 2026
REPO NAME : Solar Calculator v2

- Created a premium HTML preview for grouped before-and-after solar comparison blocks.
- Reworked the solar comparison preview into a one-screen hierarchy for bill, section, and block comparison.
- Adjusted the solar comparison preview to follow the user's gain and saved layout more literally.
- Fixed Invoice Office payment classification so submitted payments no longer appear as verified payments.
- Created a new standalone solar comparison preview with a new filename and a visibly different layout concept.
- Added permanent codebase guardrails and a decision record to prevent submitted payments from being treated as verified payments.
- Rebuilt the new solar comparison preview to follow the user's sketch structure more literally.
- Updated actual EEI saving math to use post-solar EEI rate x net import.
- Corrected the new solar comparison preview to use two side-by-side block sets per section.
- Rebuilt the solar comparison preview as a strict table-based placement layout from the user's dashed reference.
- Adjusted the solar comparison preview to be mobile-first and fit phone screen ratios.
- Rebuilt the mobile solar comparison preview to match the user's latest final layout with section totals and grand total.
- Added per-block color styling to the mobile solar comparison preview with washed-out before states and saturated after states.
- Upgraded the mobile solar comparison preview with production-level styling while keeping the final layout unchanged.
- Removed the visible guide-line feel and tightened the mobile comparison bars with slimmer, closer block styling.
- Built a domestic-v4 calculator page from the redesign and wired it to the existing domestic calculator APIs.
- Added the EEI comparison block to domestic-v4 savings breakdown and aligned it with the actual net-import EEI formula.
- Added a floating panel qty and morning-offset quick-adjust tray to domestic-v4 with stale-response guarding so package data only updates from verified latest results.
- Locked domestic-v4 panel reduction to recommended minus two by default and added a bottom request button to unlock deeper reduction down to 5 panels.
- Updated domestic-v4 to use the official Eternalgy logo and auto-scroll to the next section after successful bill analysis and ROI generation.
- Fixed domestic-v4 EEI display to show the actual received EEI amount instead of clamping valid EEI credits to zero.
- Updated domestic-v4 EEI breakdown to use its own RM80 scale and added a themed popup explaining the EEI calculation formula.
- Fixed domestic-v4 deep panel reduction unlock and rebuilt the EEI popup to show the requested import, export, net import, EEI rate, and formula breakdown.

=====================
