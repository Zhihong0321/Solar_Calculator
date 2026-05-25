# Work Report — May 25, 2026 — Solar Calculator v2

## Completed
- Created simplified EV Charger invoice creation flow with 5 fixed package options
  - New HTML template: `public/templates/create_ev_charger_invoice.html`
  - New JS page: `public/js/pages/ev_charger_invoice.js`
  - New route: `GET /create-ev-charger-invoice` in `src/modules/Invoicing/api/invoiceRoutes.js`
  - Added navigation entry in `public/js/navigation.js`
  - Reuses existing `POST /api/v1/invoices/on-the-fly` backend (no backend changes needed)
  - Prices populated from CSV data: chargers RM 4,888/8,888; installations RM 1,688/1,988/1,988
  - 7 preset extra charge buttons from CSV (site visit, extra cable, conceal, etc.)
- Hide SEDA Form, View Proposal, and Download PDF buttons on customer-facing invoice view page for EV Charger packages

=====================
