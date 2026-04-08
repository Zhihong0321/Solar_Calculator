DATE  : Apr 8, 2026
REPO NAME : Solar Calculator v2

- Updated solar calculator EEI savings logic to use actual consumption after morning offset and export
- Separated actual EEI savings from bill reduction and surfaced it in the solar calculator UI
- Added a bill-cycle toggle to switch solar savings between full-month and under-28-day SST modes
- Synced the invoice view mini calculator with shared solar calculator bill-cycle logic and mode toggles
- Created shared hybrid inverter upgrade pricing table in Postgres and drafted Admin OS implementation guidance
- Added shared invoice audit stamping and mobile edit history for Agent OS
- Fixed shared invoice history query to handle integer audit IDs
- Fixed shared invoice history bind count handling for dynamic audit queries

=====================
