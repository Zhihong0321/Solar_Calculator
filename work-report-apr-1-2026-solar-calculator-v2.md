DATE  : Apr 1, 2026
REPO NAME : Solar Calculator v2

- Fixed My Invoices auth ID handling so invoice lists and office/payment routes load for current production sessions.
- Added public solar estimate recalculate and save flow on invoice view
- Highlighted payment method box and added payment reference on invoice view
- Updated invoice view Tiger Neo 3 presentation button to open the new mobile HTML slide deck
- Added day-usage scenario toggle and hourly solar offset chart on invoice view
- Fixed invoice solar scenario toggle using correct day-usage percentage
- Improved mobile layout for invoice solar comparison section
- Fixed solar savings cap so export credit cannot exceed payable bill
- Aligned invoice recalculate display with closest matched TNB bill
- Refined invoice solar chart shape and switched labels to AM/PM
- Applied tiered invoice discount caps for create and edit flows
- Fixed invoice solar estimate save precision mismatch for matched TNB bill amounts
- Fixed invoice solar comparison chart to reflect true high-vs-low daytime usage distribution
- Added April create-invoice promo toggles with panel-based rebate amounts
- Moved create-invoice promo toggles between package info and preview
- Applied invoice bill-amount precision migration so solar estimate saves can store cents
- Locked A4 solar savings block to stay on one page instead of splitting across pages
- Fixed create quotation form getting stuck before submit when April promo payload was built
- Hardened My Invoices auth handling for JWT sub/email identities and added redirect on unauthorized invoice list loads.
- Simplified My Invoices auth flow to use one canonical app user identity and added a visible load error state instead of silent failure.

=====================
