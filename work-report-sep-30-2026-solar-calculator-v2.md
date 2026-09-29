DATE  : Sep 30, 2026
REPO NAME : Solar Calculator v2

- Pointed the My Customers "Edit SEDA Form" button (Paid tab) at the hosted SEDA form on e-welcome, with customer, invoice and SEDA share token in the link.
- Made the SEDA share token refresh automatically when missing or expired, so the link never dead-ends, and kept the raw token out of the customer list response.
- Moved the SEDA token refresh logic into the shared SEDA repo so the customer portal and My Customers use the same code.

=====================
