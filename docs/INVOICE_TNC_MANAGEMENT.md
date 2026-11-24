# Invoice / Quotation Terms & Conditions (TNC): how they are managed

Last updated: 2026-11-23

## Where the text lives

`invoice_template.terms_and_conditions`, row `id = 1` ("Eternalgy", the default template).
An invoice uses its own `template_id`; if it has none, the default template is used
(`invoiceRepo.js` ~L965-985, `invoiceLookupSupport.js`).

The stored text is never changed by code. Rules below rewrite it **when a page is shown**.

## Rules applied when a page is shown

Applied in this order by `applyInvoiceTermsPolicies` in
`src/modules/Invoicing/api/invoiceViewRoutes.js`:

| # | Rule | File | Applies to |
|---|---|---|---|
| 1 | Payment terms: 5% / 60% / 35% before 1 Jul 2026, 5% / 75% / 20% from 1 Jul 2026 (by invoice date) | `services/invoicePaymentTermsPolicy.js` | by invoice date |
| 2 | "Warranty Repairs and Unauthorised Works" clause, inserted before the REFUND POLICY heading | `services/invoiceWarrantyTermsPolicy.js` | all unsigned quotations; signed ones only if dated 1 Aug 2026 or later |
| 3 | Refund after SEDA approval = **amount paid minus RM1500** (rewrites the "5% + N% Refund (After SEDA Application)" paragraph, keeps its own percentage) | `services/invoiceRefundTermsPolicy.js` | every document, signed or not, any date |
| 4 | Roof Leaking Warranty = **6 months** ("During the period of the warranty where…" becomes "During the 6-month warranty period where…", only under the "Roof Leaking Warranty" heading) | `services/invoiceRoofLeakWarrantyTermsPolicy.js` | every document |
| 5 | Overdue payment = **2%/month interest**: line "Overdue Payment: For overdue payment there will be a 2%/month interest." added at the end of "Our Payment Terms", before "Our Refund Policy:" | `services/invoiceOverduePaymentTermsPolicy.js` | every document |

Every rule is idempotent (text that already has the change is left alone), and returns the text
untouched if its paragraph is not found. A missing paragraph never stops a document from rendering.

## Where the TNC is shown

All go through `applyInvoiceTermsPolicies`, so they show the same text:

- A4 view and A4 PDF: `services/invoiceHtmlGeneratorA4.js` (falls back to a 3-line placeholder from
  `invoiceV3Content.js` only when the template has no TNC)
- V2 view and V2 PDF: `services/invoiceHtmlGeneratorV2.js`
- Stored preview snapshots (`v3-quotation-view/local-previews`): rewritten the same way when shown
- Language (en / zh / ms) only changes labels; the TNC body is English in all of them.

Not TNC: the "SuRIA - Terms & Conditions" popup in `public/js/pages/create_invoice.js` is the SuRIA
rebate scheme text. It has no refund wording.

## Refund after SEDA approval (changed 2026-11-23)

Current wording of that paragraph:

> 5% + 75% Refund (After SEDA Application): Customers who have paid the 5% downpayment and the subsequent
> 75% fee but wish to cancel their project after SEDA approval may request a refund. The refund amount will
> be the amount paid minus RM1500.

It replaced the itemised deductions (RM600 admin fee, RM600 site survey / engineering design,
RM300 SEDA application fee, total RM1500). The amount is the same; only the wording changed.

To update the stored copy too (so any other system reading the same row shows the same text), run
`scripts/update_invoice_template_refund_after_seda.sql` (transaction with before/after checks; end it with
`COMMIT;` or `ROLLBACK;`). Tests: `node scripts/test_invoice_refund_terms_policy.js`.

## Roof leak warranty and overdue interest (changed 2026-11-24)

- Roof Leaking Warranty is 6 months. The "Workmanship Warranty" paragraph has similar words and is not touched.
- Overdue payment carries 2%/month interest. The TNC does not define a payment due date or a number of days
  (the final payment is "due upon the completion of the installation"), so "overdue" has no fixed start yet.
- **The "Warranty" box on the document is separate.** It comes from `product.product_warranty_desc` (products
  "Installation" and "Workmanship"), which currently reads "1 Year Roof Leaking Warranty / 3 Years Workmanship
  Warranty". It still says 1 Year until that product text is changed (not done).
- Stored copy: run `scripts/update_invoice_template_roof_leak_and_overdue.sql` (one transaction, before/after
  checks, end with `COMMIT;` or `ROLLBACK;`). Tests: `scripts/test_invoice_roof_leak_warranty_terms_policy.js`,
  `scripts/test_invoice_overdue_payment_terms_policy.js`.

## Regrouped layout (2026-11-24)

The stored text is regrouped into four sections: **PAYMENT TERMS**, **REFUND POLICY**, **WARRANTY POLICY**,
**PRIVACY POLICY** (full text: `docs/INVOICE_TNC_REGROUPED_DRAFT.txt`). Every term is kept word for word; the only
two changed lines are "Our Payment Terms:" (now the section heading "PAYMENT TERMS") and "Our Refund Policy:" (now
"Refund Rules:"). "Warranty Coverage:" moved from the refund section to the end of the warranty section.

- One script does it all: `scripts/update_invoice_template_tnc_regrouped.sql` (backs the old text up into
  `invoice_template_terms_backup`, updates row 1, before/after checks, end with `COMMIT;` or `ROLLBACK;`). Its text
  already contains the refund, 6-month and overdue wording and the warranty clause, so the two earlier SQL scripts
  are no longer needed.
- The rules work on both layouts, so deploy and SQL can happen in either order: the payment rule recognises the
  "PAYMENT TERMS" heading (no duplicate block), the warranty clause goes at the end of the warranty section, and the
  overdue line goes after the last installation-payment paragraph when "Our Refund Policy:" is absent.
- `scripts/test_invoice_tnc_regrouped_structure.js` proves it against the production text
  (`scripts/fixtures/invoice_template_terms_2026-10-20.txt`, md5 `db391435889ba60333dbe8b0d8d29461`).
- Known quirk (already there before): for invoices dated before 1 Jul 2026 the "20% After Installation Complete:"
  heading is not rewritten to 35%, while the sentence "The remaining 35%..." is.
- After the SQL runs, the warranty clause is stored, so signed documents dated before 1 Aug 2026 also show it.

## How to change the TNC next time

- Small wording change, same for everyone: update the paragraph in `invoice_template` row 1 with SQL.
- Must differ by date or signed status: add a rule like the five above, and register it in
  `applyInvoiceTermsPolicies` (and in `applyLegacyTermsPolicies` in `services/invoiceTncService.js`).
- Check every place in the table above shows it, and add a script test next to the others in `scripts/`.

## Half-built: versioned TNC

`invoice_tnc_version` / `invoice_tnc_pin` (migration `migrations/add_invoice_tnc_version.sql`,
`services/invoiceTncService.js`, `invoiceTncVersionRepo.js`) is a WIP system on branch
`codex/pre-activity-report-v2`: published versions are frozen and a document is pinned to the version in force
when the customer signs. **The table does not exist in production**, so it does nothing today and the code
falls back to the rules above. If it ships, put the refund wording above into its first version.

## Status (2026-11-24)

- Refund rule committed and pushed (`2bcf203`, `e0102d4`), not deployed.
- Roof leak 6 months and overdue 2%/month rules committed (`2bbe7b7`), not pushed or deployed.
- Regrouped layout: rule fixes, SQL, draft and tests written and tested, not committed or deployed.
- Row 1 SQL (`update_invoice_template_tnc_regrouped.sql`) not yet run on production.
- Until both are done, customers still see the old refund wording.
- A second system that reads the same database (if any) shows the new wording only after the SQL runs.
