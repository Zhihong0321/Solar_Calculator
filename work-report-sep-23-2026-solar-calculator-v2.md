DATE  : Sep 23, 2026
REPO NAME : Solar Calculator v2

- Found why My Customers shows Site Image off: the list checks an unused SEDA column instead of uploaded site assessment photos.
- Pointed the My Customers Site Image flag at invoice site-assessment photos, on when at least one photo exists.
- Fixed production customer list crash caused by array_length on a text ownership field.
- Pointed the My Customers Signature flag at invoice customer_signature presence.
- Checked why EV charger package 1988 quotes at 2788: the card price is hardcoded, and create quotation uses the database package price.
- Explained the EV charger quote screen shows only 5 hardcoded packages and leaves out the with-charger installation packages.
- Made the EV charger quote screen load all 8 database packages so the card price matches the quotation.
- Fixed EV charger quotation create failure by using the allowed customer lead sources.
- Added password-protected user, invoice, SEDA, and recorded payment API endpoints with a full documentation page and checks.
- Committed and pushed the integration API, then verified all user, invoice, SEDA, and payment read endpoints on production.

=====================
