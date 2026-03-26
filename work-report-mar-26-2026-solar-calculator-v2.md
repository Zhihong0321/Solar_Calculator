DATE  : Mar 26, 2026
REPO NAME : Solar Calculator v2

- Fixed voucher dropdown showing all vouchers in create/edit quotation flow - changed fetch to status=active so only active non-deleted vouchers appear to agents
- Implemented backend voucher validation - updated `getVoucherByCode` in `invoiceRepo.js` to strictly check for `active = TRUE` status, preventing unauthorised or inactive voucher usage at the API level

=====================
