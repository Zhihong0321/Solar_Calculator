DATE  : May 5, 2026
REPO NAME : Solar Calculator v2

- Checked why the Soh Lik Kuang invoice is not visible in Agent OS.
- Restored the Soh Lik Kuang invoice from deleted status to draft in production.
- Added user profile signature capture and storage
- Linked Tiger Neo 3 invoice proposal actions to the new proposal generator.
- Investigated shared customer invoice flooding for Sadisen Pillai.
- Changed invoice customer handling to create-only with no customer name matching.
- Checked the database and identified the earliest invoice for SADISEN PILLAI A/L SADANAN PILLAI
- Removed invoice edit preservation of existing customer links.
- Resolved the creator of SADISEN PILLAI A/L SADANAN PILLAI's earliest invoice to GAN ZHI HONG
- Verified invoice creation stores the authenticated user's canonical ID in created_by
- Prepared a demo-ready simulated 72-hour PRE Activity Report based on the PRE Activity V2 model
- Seeded 6 open PRE Activity V2 demo rows in prod_main so the manager live board shows active tasks again
- Queried `prod_main` via the Railway Postgres proxy to confirm the `package*` and `product` schemas, including columns and constraints.
- Linked all 39 `COMMERCIAL * JINKO 650W` packages to the correct panel/inverter products and refreshed `linked_package_item` records.
- Updated all `package.type = Commercial` rows to `Tariff B&D Low Voltage` for commercial calculator compatibility.
- Filled missing `package.bubble_id` for all affected commercial 650W packages so non-domestic package-match state is recognized.
- Patched all remaining `package` rows with missing `bubble_id` values and verified zero missing entries remain.
- Verified each commercial 650W package has a linked panel item and that `package_item.qty` matches `package.panel_qty` for all 39 rows.
- Patched all packages with missing `panel_qty` (name-based and linked-item inference) and verified `panel_qty` has no null entries.

=====================
