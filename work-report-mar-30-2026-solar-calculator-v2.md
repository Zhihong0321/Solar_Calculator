DATE  : Mar 30, 2026
REPO NAME : Solar Calculator v2

- Fixed A4 preview view for invoices by adjusting viewport and CSS widths to display as actual A4 documents on all screen sizes
- Implemented Paged.js to automatically group and visually paginate A4 invoice layouts across screens and force page breaks for terms and signature
- Linked Tiger Neo 3 invoice proposals to the local slide presentation
- Added customer and system size overlay to the Tiger Neo 3 slide deck
- Fixed BugReport startup crash by restoring route imports and auth checks
- Pushed BugReport startup fix branch update to GitHub
- Replaced Tiger Neo 3 proposal viewer with the new mobile HTML version and archived the old presentation folder.
- Built and pushed the Tiger Neo 3 proposal viewer replacement update.
- Reviewed referral assignment workflow and agent handoff flow
- Added referral referrer badges to invoice cards in agent home.
- Added referral lead selection and invoice linkage in create and edit quotation flows
- Changed logout redirects to return users to the landing login page instead of the domestic calculator.
- Fixed login redirect loops by validating auth cookies and routing logged-out users to a stable login page.
- Verified the production invoice referral schema and identified the correct live referrer fields for invoice labels.
- Made invoice referral badges use the live production referrer field and restored invoice list compatibility with the current schema.
- Reworked the My Referrals page into a mobile card layout and added quick invoice shortcuts for linked leads.

=====================
