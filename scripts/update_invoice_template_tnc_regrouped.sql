-- Regroup the TNC in invoice_template row id = 1 (template "Eternalgy") into four sections:
--   PAYMENT TERMS, REFUND POLICY, WARRANTY POLICY, PRIVACY POLICY.
-- Every term is kept word for word; only two heading lines change:
--   "Our Payment Terms:" -> section heading "PAYMENT TERMS", and "Our Refund Policy:" -> "Refund Rules:".
-- The new text also already contains the latest wording, so this ONE script replaces the earlier two:
--   * refund after SEDA approval = amount paid minus RM1500
--   * Roof Leaking Warranty = 6 months
--   * Overdue Payment = 2%/month interest
--   * the Warranty Repairs and Unauthorised Works clause (stored instead of added at render time)
-- (scripts/update_invoice_template_refund_after_seda.sql and update_invoice_template_roof_leak_and_overdue.sql
--  are no longer needed; running them before or after this one is harmless.)
-- Source text: docs/INVOICE_TNC_REGROUPED_DRAFT.txt (checked line by line against the stored text).
--
-- SAFETY: the current text is copied into invoice_template_terms_backup first. To roll back after COMMIT:
--   UPDATE invoice_template SET terms_and_conditions =
--     (SELECT terms_and_conditions FROM invoice_template_terms_backup WHERE template_id = 1 ORDER BY backup_id LIMIT 1),
--     updated_at = NOW() WHERE id = 1;
-- To undo before COMMIT, run ROLLBACK;

BEGIN;

CREATE TABLE IF NOT EXISTS invoice_template_terms_backup (
    backup_id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL,
    terms_and_conditions TEXT,
    note TEXT,
    backed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO invoice_template_terms_backup (template_id, terms_and_conditions, note)
SELECT id, terms_and_conditions, 'before TNC regroup 2026-11-24'
FROM invoice_template
WHERE id = 1;

-- Check 1 (before): old text length and its first line.
SELECT id, length(terms_and_conditions) AS len_before, split_part(terms_and_conditions, E'\n', 1) AS first_line_before
FROM invoice_template
WHERE id = 1;

UPDATE invoice_template
SET terms_and_conditions = replace($tnc$PAYMENT TERMS
5% Downpayment upon Signing Up: Customers are required to make a 5% downpayment of the total project cost upon signing up for our solar PV installation services.

75% Upon SEDA Approved + Before Installation: Upon approval by the Sustainable Energy Development Authority (SEDA) Malaysia and before installation starts, customers are required to make an additional payment of 75% of the total project cost.

20% After Installation Complete: The remaining 20% of the total project cost is due upon the completion of the installation.

Overdue Payment: For overdue payment there will be a 2%/month interest.

REFUND POLICY
Eternalgy Sdn Bhd (hereinafter referred to as "Eternalgy") is committed to providing high-quality solar PV installation services in Malaysia. We understand that sometimes circumstances may arise that necessitate refunds. This Refund Policy outlines the terms and conditions governing refunds for our services.

Refund Rules:
5% Downpayment Refund (Before SEDA Application): Customers who have made the initial 5% downpayment may request a refund, excluding a non-refundable administrative fee of RM600. This refund request must be made before the SEDA application process commences.

5% + 75% Refund (After SEDA Application): Customers who have paid the 5% downpayment and the subsequent 75% fee but wish to cancel their project after SEDA approval may request a refund. The refund amount will be the amount paid minus RM1500.

20% Payment After Installation Complete (Non-Refundable): The 20% payment made upon the completion of the installation is non-refundable. This payment covers the cost of products and services provided by Eternalgy and includes any applicable warranties for the installed solar PV system.

Refund Request Process:
To request a refund, customers must submit their request in writing to Eternalgy's customer support team. The request should include the customer's name, contact information, project details, and the reason for the refund request. Refund requests will be processed in accordance with the terms outlined in this Refund Policy.

For any inquiries or refund requests, please contact our customer support team at:
Eternalgy Sdn Bhd
Address: 23-01, Jalan Mutiara Emas 10/19, Taman Mount Austin, 81100 Johor Bahru, Johor.
Phone: 601121-0000-99
Email: admin@eternalgy.com

Eternalgy Sdn Bhd reserves the right to amend or update this Refund Policy at its discretion. Customers are encouraged to review this policy periodically for any changes. This policy is effective as of 1st Aug 2023.

WARRANTY POLICY
Solar Panel Product Warranty
Beginning on the Warranty Start Date and for the Limited Product Warranty Period，Panel manufactorer warrants that the Module and its respective DC connectors and cables (hereinafter referred to as the “Products”) will be free from material defects in workmanship which impair the performance of the Products. Material defects shall not include changes in appearance or normal wear and tear of the Products.

Solar Panel Power Warranty
Beginning on Warranty Start Date and for the first year following the Warranty Start Date, Panel manufactorer warrants that the Degradation Rate of Modules shall not exceed the applicable First Year Degradation Rate; for each year after the first year, the Degradation Rate of Modules shall not exceed the applicable Annual Degradation Rate, as set forth at Table below.

Workmanship Warranty
During the period of the warranty where Eternalgy Sdn Bhd’s workmanship has resulted in a defective installation then Eternalgy Sdn Bhd will, at its absolute discretion, either carry out any repairs or replacements necessary to allow proper functioning of the Solar PV system.

Roof Leaking Warranty
During the 6-month warranty period where Eternalgy Sdn Bhd’s workmanship has resulted in a Roof Leakage then Eternalgy Sdn Bhd will, at its absolute discretion, either carry out any repairs to fix the roof condition. The covered cost of Roof Repair shall not exceed 20% of the project final price.

Backup Power During Power Outage
The Solar PV system does not act as a backup electricity source during a power outage (blackout). Backup power requires an additional ATS (Automatic Transfer Switch), which is not included in this package.
停电备用功能需另加 ATS，不包括在本配套内。

Warranty Repairs and Unauthorised Works
All defects or issues arising during the warranty period shall be reported to the Company promptly, and all inspection and rectification works shall be carried out solely by the Company or its authorised contractors. Any inspection, repair, modification, or dismantling works carried out by the Customer or any third party without the Company's prior written consent shall not be claimable or reimbursable from the Company under any circumstances, shall void the warranty in respect of the affected works, and the Company shall bear no liability for any costs, damages, or losses arising therefrom.

Warranty Coverage:
Please note that once the installation is complete and the full payment has been made, the products and services provided by Eternalgy are covered under warranty as specified in our warranty policy. Customers may refer to the warranty policy for details regarding warranty coverage and procedures for warranty claims.

PRIVACY POLICY
1. Collection of Personal Information:
We may collect the following types of personal information from you:
Contact Information: Including your name, address, email address, and phone number.
Installation Address: Necessary for site visits and project planning.
Financial Information: Payment details and related financial information for billing purposes.

2. Use of Personal Information:
We will use your personal information for the following purposes:
SEDA ATAP SOLAR Quota Application: To facilitate the application for ATAP SOLAR quota with SEDA Malaysia, we will use the required information provided by you.

Installation Planning: We may share your information with our EPCC partner to plan and execute the installation of the solar PV system upon approval by SEDA Malaysia.

3. Sharing of Personal Information:
We may share your personal information with third parties in the following situations:
SEDA Malaysia: We will share the necessary information required for the ATAP SOLAR quota application with SEDA Malaysia.

EPCC Partner: We will provide your information to our EPCC partner for the sole purpose of facilitating the installation process upon SEDA approval. Our EPCC partner is bound by confidentiality agreements to protect your data.

4. Data Security:
We take reasonable and appropriate measures to safeguard your personal information. Access to your data is restricted to authorized personnel and is protected through security measures, including encryption and access controls.

5. Data Retention:
We will retain your personal information only for the period required to fulfill the purposes outlined in this Privacy Policy or as required by applicable laws and regulations.

6. Consent:
By engaging our services, you consent to the collection and use of your personal information as outlined in this Privacy Policy.

7. Changes to Privacy Policy:
Eternalgy Sdn Bhd reserves the right to amend or update this Privacy Policy as necessary. Any changes will be communicated to you in writing.

8. Contact Information:
If you have any questions or concerns regarding our Privacy Policy, or if you wish to access, update, or delete your personal information, please contact us at:

Eternalgy Sdn Bhd
Address: 23-01, Jalan Mutiara Emas 10/19, Taman Mount Austin, 81100 Johor Bahru, Johor.
Phone: 601121-0000-99
Email: admin@eternalgy.com

This Privacy Policy is effective as of 1 AUG 2023. Your continued engagement with our services indicates your acceptance of this policy.$tnc$, E'\r', ''),
    updated_at = NOW()
WHERE id = 1;

-- Check 2 (after): the four section positions must be increasing (payment < refund < warranty < privacy),
-- and refund_after_seda must end "minus RM1500."
SELECT id,
       length(terms_and_conditions) AS len_after,
       position(E'PAYMENT TERMS\n' in terms_and_conditions) AS pos_payment,
       position(E'\nREFUND POLICY\n' in terms_and_conditions) AS pos_refund,
       position(E'\nWARRANTY POLICY\n' in terms_and_conditions) AS pos_warranty,
       position(E'\nPRIVACY POLICY\n' in terms_and_conditions) AS pos_privacy,
       substring(terms_and_conditions from '5% \+ \d+% Refund \(After SEDA Application\):[^\n]*') AS refund_after_seda
FROM invoice_template
WHERE id = 1;

-- Look at Check 2, then run COMMIT; (or ROLLBACK; to undo).
