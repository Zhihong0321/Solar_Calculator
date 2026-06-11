DATE  : Jun 12, 2026
REPO NAME : Solar Calculator v2

- Aligned invoice view solar savings calculations with the domestic calculator and added regression validation.
- Replaced invoice V2 energy-flow rendering with the exact domestic-v4 formula path and validated the updated display output.
- Corrected invoice V2 energy-flow math to use gross remaining home load (`netUsageKwh`) for self-use and grid-import percentages, then revalidated the fixed-package solar estimate rendering.
- Updated the `/domestic` energy-flow card wording to show total solar generation destinations and a simpler kWh-only home-consumption split.
- Updated the invoice view energy-flow card copy to match the new `/domestic` wording and validated the revised render with the regression script.
- Verified local Git branch metadata inconsistency.
- Restored the missing local Git branch reference from origin.
- Committed and pushed current repository changes.

=====================
