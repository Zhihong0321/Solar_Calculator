// invoiceHtmlGeneratorV2.js

const { parseOptionalCurrency, normalizeSolarEstimateFields } = require('./solarEstimateValues');
const { buildInvoiceInteractiveSupport } = require('./invoiceHtmlGeneratorV2InteractiveSupport');

function buildTigerNeoProposalUrl(invoice) {
    const invoiceUid = String(invoice.share_token || invoice.bubble_id || invoice.id || '').trim();
    if (!invoiceUid) return '';
    return `/view/${encodeURIComponent(invoiceUid)}/tiger-neo-3-proposal`;
}

function normalizeInvoicePackageType(...rawValues) {
    const values = rawValues
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean);

    if (values.length === 0) return '';

    const hasCommercialSignal = values.some((value) => (
        value === 'commercial'
        || value === 'tariff b&d low voltage'
        || value === 'non-resi'
        || value === 'non_resi'
        || value === 'non residential'
        || value === 'non-residential'
        || value.includes('commercial')
        || value.includes('tariff b&d')
        || value.includes('low voltage')
        || value.includes('non residential')
        || value.includes('non-residential')
        || value.includes('non domestic')
        || value.includes('non-domestic')
    ));

    if (hasCommercialSignal) return 'commercial';

    const hasResidentialSignal = values.some((value) => (
        value === 'resi'
        || value === 'residential'
        || value.includes('residential')
    ));

    if (hasResidentialSignal) return 'residential';

    return values[0];
}

function generateInvoiceHtmlV2(invoice, template, options = {}) {
    const items = invoice.items || [];
    const templateData = template || {};

    const hasTigerNeo3 = items.some(item => (item.description || '').toLowerCase().includes('tiger neo 3'));
    const tigerNeoProposalUrl = hasTigerNeo3 ? buildTigerNeoProposalUrl(invoice) : '';
    const layoutMode = String(options.layout || options.viewMode || '').toLowerCase();
    const isA4Preview = layoutMode === 'a4' || layoutMode === 'a4-preview' || layoutMode === 'print';
    const showInteractiveControls = !options.forPdf && !isA4Preview;
    const viewerHasAuthenticatedUser = Boolean(options.viewerHasAuthenticatedUser);
    const estimateIdentifier = invoice.share_token || invoice.bubble_id || '';
    const estimatePanelQty = parseFloat(invoice.panel_qty) || 0;
    const estimatePanelRating = parseFloat(invoice.panel_rating) || 0;
    const canEstimateSolarSavings = estimatePanelQty > 0 && estimatePanelRating > 0 && Boolean(estimateIdentifier);
    const trackerIdentifier = invoice.share_token || invoice.bubble_id || invoice.id || '';

    // Calculate totals from items
    const sstAmount = parseFloat(invoice.sst_amount) || 0;
    const totalAmount = parseFloat(invoice.total_amount) || 0;
    const discountAmount = parseFloat(invoice.discount_amount) || 0;
    const voucherAmount = parseFloat(invoice.voucher_amount) || 0;
    const cnyPromoAmount = parseFloat(invoice.cny_promo_amount) || 0;
    const holidayBoostAmount = parseFloat(invoice.holiday_boost_amount) || 0;
    const earnNowRebateAmount = parseFloat(invoice.earn_now_rebate_amount) || 0;
    const earthMonthGoGreenBonusAmount = parseFloat(invoice.earth_month_go_green_bonus_amount) || 0;
    const normalizedEstimate = normalizeSolarEstimateFields({
        customerAverageTnb: invoice.customer_average_tnb,
        estimatedSaving: invoice.estimated_saving,
        estimatedNewBillAmount: invoice.estimated_new_bill_amount
    });
    const beforeSolarBill = normalizedEstimate.beforeSolarBill;
    const storedAfterSolarBill = normalizedEstimate.estimatedNewBillAmount;
    const estimatedMonthlySaving = normalizedEstimate.estimatedSaving;
    const storedSunPeakHour = parseOptionalCurrency(invoice.solar_sun_peak_hour) ?? 3.4;
    const storedMorningUsagePercent = parseOptionalCurrency(invoice.solar_morning_usage_percent) ?? 30;
    const afterSolarBill = storedAfterSolarBill;
    const hasSolarSavingsSection = [beforeSolarBill, afterSolarBill, estimatedMonthlySaving]
        .every((value) => value !== null);
    const normalizedPackageType = normalizeInvoicePackageType(
        invoice.package_type,
        invoice.type,
        invoice.package_name
    );
    const isEvCharger = 
        (invoice.package_name && invoice.package_name.toLowerCase().includes('ev charger')) ||
        ['1779719505392x510517187223558528', '1779719505392x532985182726628480', '1779719505392x185856407051952896', '1779719505392x930851860072331776', '1779719505392x911258790790266368'].includes(invoice.linked_package);
    const isCommercialPackage = normalizedPackageType === 'commercial';
    const _showSolarSavingsSection = !isCommercialPackage && (hasSolarSavingsSection || (showInteractiveControls && canEstimateSolarSavings));
    // TODO: Temporarily hidden — energy saving comparison is wrong/misleading, pending fix
    const showSolarSavingsSection = false;
    const solarSavingsSectionBadge = hasSolarSavingsSection ? 'Monthly Estimate' : 'Package Estimate';
    const solarSavingsSectionIntro = hasSolarSavingsSection
        ? 'Your solar estimate at a glance'
        : 'Estimate your savings with this package';
    const solarSavingsHelperText = showInteractiveControls
        ? (hasSolarSavingsSection
            ? 'Switch between low and high day usage to compare direct offset versus export, based on this quotation package.'
            : 'Enter your average TNB bill, then compare Low Day Usage (30%) vs High Day Usage (80%) using this package size.')
        : 'Based on this quotation package and the latest saved estimate.';

    // Decide title based on status: QUOTATION for drafts/pending, INVOICE for confirmed/paid
    const isConfirmed = (invoice.status || '').toLowerCase() === 'confirmed' || (invoice.status || '').toLowerCase() === 'paid';
    const titleLabel = isConfirmed ? 'INVOICE' : 'QUOTATION';
    const isCommercialQuotation = !isConfirmed && isCommercialPackage;
    const hasSiteVisitItem = items.some(item => {
        const sourceText = `${item.description || ''} ${item.product_name || ''}`.toLowerCase();
        return /site\s+vi(?:sit|tit)\s+by/.test(sourceText);
    });
    const showPreSiteVisitReminder = isCommercialQuotation && !hasSiteVisitItem;

    const subtotal = totalAmount
        - sstAmount
        + discountAmount
        + voucherAmount
        + cnyPromoAmount
        + holidayBoostAmount
        + earnNowRebateAmount
        + earthMonthGoGreenBonusAmount;

    // Get company info from template
    const companyName = templateData.company_name || 'Atap Solar';
    const companyAddress = templateData.company_address || '';
    const companyPhone = templateData.company_phone || '';
    const companyEmail = templateData.company_email || '';
    const bankName = templateData.bank_name || '';
    const bankAccountNo = templateData.bank_account_no || '';
    const bankAccountName = templateData.bank_account_name || '';
    const logoUrl = templateData.logo_url || '/logo-08.png';
    const terms = templateData.terms_and_conditions || '';

    // Generate items HTML
    let itemsHtml = '';
    items.forEach((item, index) => {
        const qty = parseFloat(item.qty) || 0;
        const totalPrice = parseFloat(item.total_price) || 0;
        const unitPrice = qty > 0 ? totalPrice / qty : 0;
        const isNegative = totalPrice < 0;
        const priceColor = isNegative ? 'color: red;' : '';

        itemsHtml += `
      <tr class="${index % 2 !== 0 ? 'alternate-row' : ''}">
          <td class="col-no" data-label="#">${String(index + 1).padStart(2, '0')}</td>
          <td class="col-desc" data-label="DESCRIPTION">${item.description ? item.description.replace(/\\n/g, '<br>') : ''}</td>
          <td class="col-price" data-label="PRICE">RM ${Math.abs(unitPrice).toFixed(2)}</td>
          <td class="col-qty" data-label="QUANTITY">${qty}</td>
          <td class="col-amount" data-label="AMOUNT" style="${priceColor}">${isNegative ? '-' : ''}RM ${Math.abs(totalPrice).toFixed(2)}</td>
      </tr>
      `;
    });

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    ${isA4Preview 
        ? '<meta name="viewport" content="width=820">' 
        : '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">'
    }
    <title>${titleLabel} ${invoice.invoice_number}${isA4Preview ? ' - A4 Preview' : ''}</title>
    ${isA4Preview ? '<script src="https://unpkg.com/pagedjs/dist/paged.polyfill.js"></script>' : ''}
    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <!-- Boxicons for icons -->
    <link href='https://unpkg.com/boxicons@2.1.4/css/boxicons.min.css' rel='stylesheet'>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/signature_pad@4.1.7/dist/signature_pad.umd.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <style>
/* CSS copied from invoice-v2/style.css */
:root {
    --primary-color: #555555;
    --text-main: #333333;
    --text-muted: #7a7a7a;
    --bg-light: #fdfdfd;
    --bg-alternate: #f4f5f5;
    --border-color: #e5e5e5;
    --font-family: 'Inter', sans-serif;
}

* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

body {
    font-family: var(--font-family);
    color: var(--text-main);
    background-color: #eceff1;
    font-size: 14px;
    line-height: 1.5;
    padding: 40px 20px;
    display: flex;
    justify-content: center;
    flex-direction: column;
    align-items: center;
    -webkit-font-smoothing: antialiased;
}

body.a4-preview {
    background: #e7ebef;
    padding: 16px;
    height: auto;
}

body.a4-preview .pagedjs_page {
    background-color: #ffffff;
    box-shadow: 0 15px 40px rgba(0, 0, 0, 0.08);
    margin: 0 auto 24px auto;
}

@page {
    size: A4;
    margin: 15mm 20mm 20mm 20mm;
}

.invoice-container {
    background-color: #ffffff;
    max-width: 820px;
    width: 100%;
    box-shadow: 0 15px 40px rgba(0, 0, 0, 0.08);
    position: relative;
    padding-bottom: 30px;
}

body.a4-preview .invoice-container {
    width: 100%;
    max-width: 100%;
    box-shadow: none;
    padding-bottom: 0;
    overflow: visible;
}

body.a4-preview .invoice-actions,
body.a4-preview .promotional-banner,
body.a4-preview .no-print {
    display: none !important;
}

body.a4-preview .floating-a4-preview {
    display: none !important;
}

body.a4-preview .footer-bottom-bar {
    display: none !important;
}

body.a4-preview .invoice-footer {
    margin-bottom: 0;
}

body.a4-preview .items-table thead {
    display: table-header-group;
}

body.a4-preview .items-table tr,
body.a4-preview .billing-details,
body.a4-preview .summary-section,
body.a4-preview .terms-signature,
body.a4-preview .invoice-footer,
body.a4-preview .signature-image,
body.a4-preview .promotional-banner,
body.a4-preview .avoid-break,
body.a4-preview .solar-estimate-section,
body.a4-preview .solar-estimate-shell,
body.a4-preview .solar-estimate-cards {
    break-inside: avoid;
    page-break-inside: avoid;
}

body.a4-preview .terms-signature {
    break-before: page;
    page-break-before: always;
}

/* Header Start */
.invoice-header {
    display: flex;
    justify-content: space-between;
    align-items: stretch; /* Stretch to align the bottom of the black box with information on the right */
    margin-bottom: 40px;
}

.company-logo {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: 20px;
    background-color: #000000; /* Force black background for the logo section */
    color: #fff;
    padding: 30px 40px;
    width: 440px;
    border-bottom-right-radius: 4px;
}

.company-info {
    text-align: left;
}

.logo-box {
    flex-shrink: 0;
}

.logo-box img {
    max-height: 60px;
    object-fit: contain;
    filter: brightness(0) invert(1);
}

.company-info h2 {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 4px;
    letter-spacing: 0.5px;
}

.company-info p {
    font-size: 10px;
    color: #dfdfdf;
    font-weight: 400;
}

.invoice-title {
    padding: 40px 50px 30px 0; /* Consistent bottom padding to align with the black box */
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    justify-content: flex-start;
}

.invoice-title h1 {
    font-size: 40px;
    letter-spacing: 6px;
    color: var(--text-main);
    font-weight: 700;
    text-transform: uppercase;
}

.invoice-actions {
    display: flex;
    gap: 8px;
    margin-top: 15px;
    flex-wrap: wrap;
    justify-content: flex-end;
}

.pre-site-visit-alert {
    margin: 0 50px 30px;
    padding: 24px 26px;
    border: 3px solid #b91c1c;
    background: linear-gradient(135deg, #fff7ed 0%, #fee2e2 100%);
    box-shadow: 0 14px 30px rgba(185, 28, 28, 0.16);
}

.pre-site-visit-alert-label {
    display: inline-flex;
    align-items: center;
    margin-bottom: 12px;
    padding: 6px 10px;
    background: #7f1d1d;
    color: #fff;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
}

.pre-site-visit-alert h2 {
    margin: 0 0 10px;
    color: #7f1d1d;
    font-size: 28px;
    line-height: 1.05;
    font-weight: 800;
    text-transform: uppercase;
}

.pre-site-visit-alert p {
    margin: 0;
    color: #7f1d1d;
    font-size: 15px;
    line-height: 1.6;
    font-weight: 600;
}

.action-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-radius: 4px;
    transition: all 0.2s;
    cursor: pointer;
    background: transparent;
}

.btn-referral { color: #10b981; border: 1px solid #10b981; }
.btn-referral:hover { background: #10b981; color: #fff; }

.btn-share {
    color: #ffffff;
    background: #0f2f6d;
    border: 1px solid #0f2f6d;
}
.btn-share:hover {
    background: #0a2350;
    border-color: #0a2350;
    color: #ffffff;
}

.btn-proposal { color: #2563eb; border: 1px solid #2563eb; }
.btn-proposal:hover { background: #2563eb; color: #fff; }

.btn-seda { color: #f97316; border: 1px solid #f97316; }
.btn-seda:hover { background: #f97316; color: #fff; }

.btn-pdf { color: #334155; border: 1px solid #334155; }
.btn-pdf:hover { background: #334155; color: #fff; }

.btn-preview { color: #0f172a; border: 1px solid #0f172a; }
.btn-preview:hover { background: #0f172a; color: #fff; }

.floating-a4-preview {
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 90;
    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.22);
}

.floating-a4-preview button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 18px;
    border-radius: 9999px;
    background: linear-gradient(135deg, #0f172a, #334155);
    color: #ffffff;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border: 1px solid rgba(255, 255, 255, 0.12);
    transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
}

.floating-a4-preview button:hover {
    transform: translateY(-1px);
    box-shadow: 0 14px 32px rgba(15, 23, 42, 0.28);
}

/* Billing Details */
.billing-details {
    display: flex;
    justify-content: space-between;
    padding: 0 50px;
    margin-bottom: 30px;
}

.label {
    display: block;
    font-size: 11px;
    color: var(--text-muted);
    margin-bottom: 6px;
    text-transform: uppercase;
    font-weight: 600;
    letter-spacing: 0.5px;
}

.invoice-to h3 {
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 4px;
    color: #222;
}

.invoice-to p {
    font-size: 13px;
    color: var(--text-muted);
}

.meta-row {
    display: flex;
    margin-bottom: 4px;
    font-size: 13px;
}

.meta-row .meta-label {
    width: 120px;
    color: var(--text-muted);
}

.meta-row .meta-value {
    color: var(--text-main);
    font-weight: 500;
}

.divider {
    border: none;
    border-top: 1px solid var(--border-color);
    margin: 0 50px 30px 50px;
}

/* Items Table */
.items-table-wrapper {
    padding: 0 50px;
    margin-bottom: 40px;
}

.items-table {
    width: 100%;
    border-collapse: collapse;
}

.items-table th {
    background-color: var(--primary-color);
    color: #fff;
    text-align: left;
    padding: 14px 15px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
}

.items-table td {
    padding: 16px 15px;
    font-size: 13px;
    border-bottom: 1px solid rgba(0,0,0,0.02);
}

.alternate-row {
    background-color: var(--bg-alternate);
}

.items-table .col-no, .items-table .col-qty {
    text-align: center;
}

.items-table th.col-no, .items-table th.col-qty {
    text-align: center;
}

.items-table .col-amount, .items-table .col-price {
    text-align: right;
}

.items-table th.col-amount, .items-table th.col-price {
    text-align: right;
}

.items-table .col-desc {
    font-weight: 600;
    color: #222;
}

/* Summary Section */
.summary-section {
    display: flex;
    justify-content: space-between;
    padding: 0 50px;
    margin-bottom: 50px;
}

.summary-left {
    padding-top: 25px;
}

.total-due-label {
    font-size: 14px;
    font-weight: 600;
    color: #222;
}

.total-due-amount {
    font-size: 26px;
    font-weight: 700;
    margin: 8px 0;
    color: #111;
}

.total-due-line {
    height: 3px;
    width: 200px;
    background-color: #444;
    margin-bottom: 10px;
}

.late-charge {
    font-size: 11px;
    color: var(--text-muted);
}

.summary-right {
    width: 320px;
}

.summary-row {
    display: flex;
    justify-content: space-between;
    padding: 12px 15px;
    font-size: 14px;
}

.summary-label {
    color: var(--text-main);
    font-weight: 500;
}

.summary-value {
    font-weight: 600;
}

.summary-divider {
    border: none;
    border-top: 1px solid var(--border-color);
    margin: 0 15px;
}

.total-row {
    background-color: var(--primary-color);
    color: #fff;
    margin-top: 10px;
    padding: 14px 15px;
    font-weight: 700;
    font-size: 16px;
    border-radius: 2px;
}

.total-row .summary-label {
    color: #fff;
    font-weight: 600;
}

.payment-method {
    margin-top: 14px;
    border: 1.5px solid #334155;
    border-radius: 16px;
    padding: 18px 15px;
    background: transparent;
    box-shadow: none;
}

.payment-method .label {
    color: var(--text-main);
    margin-bottom: 12px;
}

.payment-method .meta-row {
    margin-bottom: 8px;
}

.payment-method .meta-label,
.payment-method .meta-value {
    color: var(--text-main);
}

.payment-method .meta-value {
    font-weight: 700;
}

.payment-method .payment-ref-row {
    margin-top: 10px;
    margin-bottom: 0;
    padding-top: 12px;
    border-top: 1px solid rgba(51, 65, 85, 0.25);
}

/* Terms & Signature */
.terms-signature {
    display: flex;
    flex-direction: column;
    padding: 0 50px;
    margin-bottom: 60px;
}

.terms {
    max-width: 100%;
    margin-bottom: 40px;
}

.terms h3 {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 12px;
    color: #222;
}

.terms p {
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.6;
}

.signature {
    align-self: flex-end;
    text-align: center;
    width: 200px;
}

.signature-image {
    height: 120px;
    overflow: hidden;
    margin-bottom: 15px;
    display: flex;
    justify-content: center;
    align-items: center;
}

.signature-image img {
    margin: -20px;
    width: 280px;
    max-width: none;
    object-fit: contain;
}

.signature h4 {
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 4px;
    color: #222;
}

.signature p {
    font-size: 12px;
    color: var(--text-muted);
}

/* Footer Section */
.invoice-footer {
    display: flex;
    justify-content: space-between;
    padding: 25px 0;
    border-top: 1px solid var(--border-color);
    margin: 0 50px; 
}

.footer-col {
    display: flex;
    align-items: center;
    gap: 12px;
}

.icon-circle {
    display: flex;
    justify-content: center;
    align-items: center;
    color: var(--text-main);
}

.icon-circle i {
    font-size: 22px;
}

.footer-text p {
    font-size: 11px;
    color: var(--text-muted);
    line-height: 1.5;
}

.footer-bottom-bar {
    height: 48px;
    background-color: var(--primary-color);
    width: 100%;
    position: absolute;
    bottom: 0;
    left: 0;
}

/* Print optimizations */
@media print {
    @page {
        size: A4;
        margin: 12mm;
    }

    body { background: white; padding: 0; }
    .invoice-container {
        padding: 0;
        margin: 0;
        box-shadow: none;
        max-width: 100%;
    }
    .no-print { display: none !important; }
    .promotional-banner { display: none !important; }
    .items-table thead { display: table-header-group; }
    .items-table tr { break-inside: avoid; page-break-inside: avoid; }
}

/* Mobile Responsiveness */
@media (max-width: 768px) {
    body {
        padding: 0;
        background-color: #ffffff; 
    }

    .invoice-container {
        box-shadow: none;
        border-radius: 0;
        padding-bottom: 70px;
    }

    .invoice-header {
        flex-direction: column;
        align-items: center;
        text-align: center;
        margin-bottom: 30px;
    }

    .company-logo {
        flex-direction: column;
        justify-content: center;
        text-align: center;
        width: 100%;
        border-bottom-right-radius: 0;
        padding: 25px;
        gap: 15px;
    }

    .company-info {
        text-align: center;
    }

    .logo-box {
        overflow: visible;
    }

    .logo-box img {
        max-height: 120px;
        margin: -20px 0;
    }

    .invoice-title {
        padding: 25px 0 0 0;
        align-items: center;
    }

    .invoice-title h1 {
        font-size: 32px;
        letter-spacing: 4px;
    }

    .invoice-actions {
        justify-content: center;
        margin-top: 15px;
        gap: 10px;
    }

    .pre-site-visit-alert {
        margin: 0 20px 24px;
        padding: 18px 18px 20px;
    }

    .pre-site-visit-alert-label {
        font-size: 10px;
        letter-spacing: 0.08em;
    }

    .pre-site-visit-alert h2 {
        font-size: 22px;
    }

    .pre-site-visit-alert p {
        font-size: 14px;
        line-height: 1.55;
    }

    .billing-details {
        flex-direction: column;
        gap: 30px;
        padding: 0 20px;
    }

    .meta-row {
        justify-content: space-between;
    }

    .meta-row .meta-label {
        width: auto;
    }

    .divider {
        margin: 0 20px 30px 20px;
    }

    .items-table-wrapper {
        padding: 0 20px;
        margin-bottom: 30px;
    }

    /* Transform Table to Cards for Mobile */
    .items-table thead {
        display: none; 
    }

    .items-table, .items-table tbody, .items-table tr, .items-table td {
        display: block;
        width: 100%;
    }

    .items-table tr {
        margin-bottom: 15px;
        padding: 8px 15px;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        background-color: #fff;
    }

    .items-table .alternate-row {
        background-color: var(--bg-alternate); 
    }

    .items-table td {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 0;
        text-align: right;
        border-bottom: 1px solid var(--border-color);
    }
    
    .items-table td:last-child {
        border-bottom: none;
    }

    .items-table td::before { 
        content: attr(data-label);
        font-weight: 600;
        text-transform: uppercase;
        color: var(--text-muted);
        font-size: 11px;
    }

    .items-table .col-no, .items-table .col-qty, .items-table .col-amount, .items-table .col-price {
        text-align: right;
    }
    
    .items-table .col-desc {
        text-align: right;
    }

    .summary-section {
        flex-direction: column;
        padding: 0 20px;
        gap: 30px;
    }

    .summary-right {
        width: 100%;
    }

    .terms-signature {
        flex-direction: column;
        padding: 0 20px;
        gap: 40px;
        align-items: flex-start;
        margin-bottom: 40px;
    }

    .terms {
        max-width: 100%;
    }

    .signature {
        align-self: center;
        margin-top: 10px;
    }

    .invoice-footer {
        flex-direction: column;
        gap: 25px;
        padding: 25px 0;
        margin: 0 20px;
        align-items: flex-start;
    }
    
    .footer-col {
        width: 100%;
    }

    .promotional-banner {
        padding: 0 20px !important;
        margin-bottom: 30px !important;
    }

    .solar-estimate-section {
        padding: 0 12px !important;
        margin-bottom: 24px !important;
    }

    .solar-estimate-shell {
        padding: 14px !important;
        border-radius: 12px !important;
    }

    .solar-estimate-header {
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 12px !important;
        margin-bottom: 14px !important;
    }

    .solar-estimate-title {
        font-size: 16px !important;
        line-height: 1.3 !important;
    }

    .solar-estimate-helper {
        font-size: 11px !important;
        line-height: 1.5 !important;
    }

    .solar-estimate-header-actions {
        align-items: stretch !important;
        gap: 8px !important;
    }

    .solar-estimate-badge,
    .solar-estimate-recalculate {
        align-self: flex-start !important;
    }

    .solar-estimate-badge {
        font-size: 9px !important;
        padding: 5px 10px !important;
    }

    .solar-estimate-recalculate {
        font-size: 10px !important;
        padding: 9px 12px !important;
    }

    .solar-estimate-status,
    .solar-estimate-save-hint {
        font-size: 11px !important;
        line-height: 1.5 !important;
    }

    .solar-estimate-cards {
        grid-template-columns: 1fr !important;
        gap: 10px !important;
    }

    .solar-estimate-card {
        min-height: 112px !important;
        padding: 14px !important;
    }

    .solar-estimate-card-label-wrap {
        min-height: 34px !important;
        margin-bottom: 10px !important;
    }

    .solar-estimate-card-label {
        font-size: 9px !important;
        line-height: 1.35 !important;
        letter-spacing: 0.08em !important;
    }

    .solar-estimate-card-value {
        font-size: 22px !important;
    }

    .solar-calc-panel {
        margin-top: 14px !important;
        padding: 12px !important;
        border-radius: 12px !important;
    }

    .solar-calc-header {
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 10px !important;
        margin-bottom: 12px !important;
    }

    .solar-calc-title {
        font-size: 12px !important;
    }

    .solar-calc-button-row {
        gap: 6px !important;
    }

    .solar-calc-button,
    .solar-calc-save-button {
        font-size: 9px !important;
        padding: 9px 10px !important;
        flex: 1 1 auto !important;
        justify-content: center !important;
    }

    .solar-calc-summary {
        font-size: 11px !important;
        margin-bottom: 10px !important;
    }

    .solar-calc-legend {
        gap: 10px !important;
        margin-bottom: 10px !important;
        font-size: 10px !important;
    }

    .solar-calc-chart-box {
        padding: 10px !important;
        border-radius: 12px !important;
    }

    .solar-calc-chart-note {
        font-size: 10px !important;
        line-height: 1.45 !important;
        margin-top: 8px !important;
    }

    .solar-note-box {
        margin-top: 12px !important;
        padding: 10px 12px !important;
    }

    .solar-note-text {
        font-size: 10px !important;
        line-height: 1.55 !important;
    }
}
    </style>
</head>
<body${isA4Preview ? ' class="a4-preview"' : ''}>
    <script>
      // Client-side date formatting to user's local timezone
      function formatLocalTime() {
        const elements = document.querySelectorAll('.local-time');
        elements.forEach(el => {
          const iso = el.getAttribute('data-iso');
          const showTime = el.getAttribute('data-show-time') === 'true';
          if (iso) {
            try {
              const date = new Date(iso);
              const options = { year: 'numeric', month: 'short', day: 'numeric' };
              if (showTime) { options.hour = '2-digit'; options.minute = '2-digit'; }
              el.textContent = date.toLocaleString(undefined, options);
            } catch (e) {
              console.error('Date formatting error:', e);
            }
          }
        });
      }

      // Run on load
      document.addEventListener('DOMContentLoaded', formatLocalTime);
    </script>

    ${showInteractiveControls ? buildInvoiceInteractiveSupport({
        identifier: estimateIdentifier,
        hasSolarSavingsSection,
        canEstimateSolarSavings,
        beforeSolarBill,
        afterSolarBill,
        estimatedMonthlySaving,
        storedSunPeakHour,
        storedMorningUsagePercent
    }) : ''}

    <div class="invoice-container">
        <!-- Header -->
        <header class="invoice-header">
            <div class="company-logo">
                <div class="logo-box">
                    <!-- Dynamic Logo -->
                    <img src="${logoUrl}" alt="Logo">
                </div>
                <div class="company-info">
                    <h2>${companyName}</h2>
                    <p style="white-space: pre-line;">${companyAddress}</p>
                </div>
            </div>
            <div class="invoice-title">
                <h1>${titleLabel}</h1>
                ${showInteractiveControls ? `
                <div class="invoice-actions no-print">
                  ${(invoice.share_token || invoice.bubble_id) && viewerHasAuthenticatedUser ? `
                  <button onclick='quickShareInvoice(${JSON.stringify(invoice.share_token || invoice.bubble_id)}, ${JSON.stringify(invoice.invoice_number || '')}, ${JSON.stringify(titleLabel)})' class="action-btn btn-share">
                    <span>Share</span>
                  </button>
                  ` : ''}
                  ${invoice.share_token ? `
                  <button onclick="window.open('https://referral.atap.solar', '_blank')" class="action-btn btn-referral">
                    <span>Refer Program</span>
                  </button>
                  ` : ''}
                  ${!isEvCharger && invoice.linked_seda_registration ? `
                  <button onclick="window.open('/seda-register?id=${invoice.linked_seda_registration}', '_blank')" class="action-btn btn-seda">
                    <span>SEDA Form</span>
                  </button>
                  ` : ''}
                  ${hasTigerNeo3 && tigerNeoProposalUrl ? `
                  <button data-track-button="Generate Tiger Neo 3 Proposal" onclick='window.open(${JSON.stringify(tigerNeoProposalUrl)}, "_blank", "noopener")' class="action-btn btn-proposal">
                    <span>GENERATE TIGER NEO 3 PROPOSAL</span>
                  </button>
                  ` : ''}
                  ${!isEvCharger && !hasTigerNeo3 && (invoice.share_token || invoice.bubble_id) && invoice.customer_name && invoice.customer_name !== 'Sample Quotation' ? `
                  <button onclick="viewProposal('${invoice.share_token || invoice.bubble_id}')" class="action-btn btn-proposal">
                    <span>View Proposal</span>
                  </button>
                  ` : ''}
                  ${(invoice.share_token || invoice.bubble_id) ? `
                  <button onclick="openA4Preview('${invoice.share_token || invoice.bubble_id}')" class="action-btn btn-preview">
                    <span>A4 Preview</span>
                  </button>
                  ` : ''}
                  ${!isEvCharger && (invoice.share_token || invoice.bubble_id) ? `
                  <button onclick="downloadInvoicePdf('${invoice.share_token || invoice.bubble_id}')" class="action-btn btn-pdf">
                    <span id="pdfButtonText">Download PDF</span>
                  </button>
                  ` : ''}
                </div>
                ` : ''}
            </div>
        </header>

        ${showPreSiteVisitReminder ? `
        <section class="pre-site-visit-alert">
            <span class="pre-site-visit-alert-label">Important Commercial Notice</span>
            <h2>Pre-Site-Visit Quotation</h2>
            <p>This quotation is preliminary and the quoted price is not final. Final pricing is subject to site visit findings, technical assessment, and scope confirmation.</p>
        </section>
        ` : ''}

        <!-- Billing details 1 -->
        <section class="billing-details">
            <div class="invoice-to">
                <span class="label">INVOICE TO</span>
                <h3>${invoice.customer_name || 'Valued Customer'}</h3>
                <p style="white-space: pre-line;">${invoice.customer_address || ''}</p>
            </div>
            <div class="invoice-meta">
                <div class="meta-row">
                    <span class="meta-label">Invoice No</span>
                    <span class="meta-value">: ${invoice.invoice_number}</span>
                </div>
                <div class="meta-row">
                    <span class="meta-label">${titleLabel} Date</span>
                    <span class="meta-value">: <span class="local-time" data-iso="${(() => { try { return new Date(invoice.invoice_date).toISOString(); } catch (e) { return ''; } })()}" data-show-time="true">${invoice.invoice_date || '-'}</span></span>
                </div>
                ${invoice.due_date ? `
                <div class="meta-row">
                    <span class="meta-label">Due Date</span>
                    <span class="meta-value">: <span class="local-time" data-iso="${(() => { try { return new Date(invoice.due_date).toISOString(); } catch (e) { return ''; } })()}" data-show-time="true">${invoice.due_date}</span></span>
                </div>` : ''}
            </div>
        </section>

        <!-- Divider -->
        <hr class="divider">

        <!-- Billing details 2 -->
        <section class="billing-details secondary-details">
            <div class="contact-person">
                <span class="label">Contact Person</span>
                <div class="meta-row">
                    <span class="meta-label">Phone</span>
                    <span class="meta-value">: ${invoice.customer_phone || '-'}</span>
                </div>
                <div class="meta-row">
                    <span class="meta-label">E-mail</span>
                    <span class="meta-value">: ${invoice.customer_email || '-'}</span>
                </div>
            </div>
        </section>

        ${showSolarSavingsSection ? `
        <section class="solar-estimate-section avoid-break" style="padding: 0 50px; margin-bottom: 32px;">
            <div class="solar-estimate-shell" style="border: 1px solid #b7e4c7; border-radius: 14px; background: linear-gradient(135deg, #f0fdf4 0%, #ffffff 52%, #f8fafc 100%); padding: 22px; box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);">
                <div class="solar-estimate-header" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 18px;">
                    <div>
                        <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #047857; margin-bottom: 6px;">Estimated Solar Saving</div>
                        <div class="solar-estimate-title" style="font-size: 20px; font-weight: 700; color: #0f172a;">${solarSavingsSectionIntro}</div>
                        <div class="solar-estimate-helper" style="margin-top: 6px; font-size: 12px; line-height: 1.6; color: #475569;">${solarSavingsHelperText}</div>
                    </div>
                    <div class="solar-estimate-header-actions" style="display: flex; flex-direction: column; align-items: flex-end; gap: 10px;">
                        <div class="solar-estimate-badge" style="padding: 6px 12px; border-radius: 999px; background: #dcfce7; color: #047857; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;">
                            ${solarSavingsSectionBadge}
                        </div>
                        ${showInteractiveControls && canEstimateSolarSavings ? `
                        <button type="button" id="solarRecalculateBtn" class="solar-estimate-recalculate" onclick="openSolarEstimatePrompt()" style="border: 1px solid #0f172a; border-radius: 999px; background: #ffffff; color: #0f172a; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 10px 16px; cursor: pointer; white-space: nowrap;">
                            Recalculate
                        </button>
                        ` : ''}
                    </div>
                </div>
                <div id="solarEstimateStatus" class="solar-estimate-status" style="margin-bottom: 14px; border: 1px solid #bfdbfe; border-radius: 12px; background: #eff6ff; padding: 12px 14px; font-size: 12px; line-height: 1.6; color: #1d4ed8;">
                    ${hasSolarSavingsSection
                        ? 'This quotation already has a saved solar estimate. Use the day-usage buttons below to compare scenarios.'
                        : 'No saved estimate yet. Use Recalculate to preview this package against your average TNB bill.'}
                </div>
                <div class="solar-bill-cycle-row" style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 14px;">
                    <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #475569;">Bill Cycle Mode</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        <button type="button" id="solarBillCycleBtn_fullMonth" onclick="setSolarBillCycleMode('fullMonth')" style="border: 1px solid #cbd5e1; border-radius: 999px; background: #ffffff; color: #0f172a; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; padding: 10px 14px; cursor: pointer;">
                            Full Month Bill Cycle
                        </button>
                        <button type="button" id="solarBillCycleBtn_under28Days" onclick="setSolarBillCycleMode('under28Days')" style="border: 1px solid #cbd5e1; border-radius: 999px; background: #ffffff; color: #0f172a; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; padding: 10px 14px; cursor: pointer;">
                            &lt;28 Days Bill Cycle
                        </button>
                    </div>
                </div>
                <div id="solarMatchedBillHint" class="solar-estimate-save-hint" style="display: none; margin-bottom: 14px; font-size: 12px; line-height: 1.6; color: #475569;"></div>
                <div id="solarBillCycleHint" class="solar-estimate-save-hint" style="display: none; margin-bottom: 14px; font-size: 12px; line-height: 1.6; color: #475569;"></div>
                <div class="solar-estimate-cards" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px;">
                    <div class="solar-estimate-card" style="border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff; padding: 16px; min-height: 148px; display: flex; flex-direction: column;">
                        <div class="solar-estimate-card-label-wrap" style="min-height: 48px; margin-bottom: 12px; display: flex; align-items: flex-start;">
                            <div class="solar-estimate-card-label" style="font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #64748b; line-height: 1.5;">Your Average TNB Bill<br>Before Solar</div>
                        </div>
                        <div id="solarEstimateBeforeValue" class="solar-estimate-card-value" style="font-size: 28px; font-weight: 700; color: #0f172a; line-height: 1.1; margin-top: auto;">${beforeSolarBill !== null ? `RM ${beforeSolarBill.toFixed(2)}` : 'RM --'}</div>
                    </div>
                    <div class="solar-estimate-card" style="border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff; padding: 16px; min-height: 148px; display: flex; flex-direction: column;">
                        <div class="solar-estimate-card-label-wrap" style="min-height: 48px; margin-bottom: 12px; display: flex; align-items: flex-start;">
                            <div class="solar-estimate-card-label" style="font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #64748b; line-height: 1.5;">New Bill After Solar<br>After Export Earning</div>
                        </div>
                        <div id="solarEstimateAfterValue" class="solar-estimate-card-value" style="font-size: 28px; font-weight: 700; color: #0f172a; line-height: 1.1; margin-top: auto;">${afterSolarBill !== null ? `RM ${afterSolarBill.toFixed(2)}` : 'RM --'}</div>
                    </div>
                    <div class="solar-estimate-card" style="border: 1px solid #059669; border-radius: 12px; background: #059669; padding: 16px; min-height: 148px; display: flex; flex-direction: column;">
                        <div class="solar-estimate-card-label-wrap" style="min-height: 48px; margin-bottom: 12px; display: flex; align-items: flex-start;">
                            <div class="solar-estimate-card-label" style="font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #d1fae5; line-height: 1.5;">Your Estimated Monthly Total Saving</div>
                        </div>
                        <div id="solarEstimateSavingValue" class="solar-estimate-card-value" style="font-size: 28px; font-weight: 700; color: #ffffff; line-height: 1.1; margin-top: auto;">${estimatedMonthlySaving !== null ? `RM ${estimatedMonthlySaving.toFixed(2)}` : 'RM --'}</div>
                    </div>
                </div>
                ${showInteractiveControls && canEstimateSolarSavings ? `
                <div class="solar-calc-panel" style="margin-top: 18px; border: 1px solid #dbeafe; border-radius: 14px; background: #f8fbff; padding: 16px;">
                    <div class="solar-calc-params" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 14px;">
                        <label style="display: flex; flex-direction: column; gap: 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #475569;">
                            <span>Sun Peak Hour</span>
                            <input type="number" id="solarSunPeakHourInput" min="3.0" max="4.5" step="0.1" value="${storedSunPeakHour.toFixed(1)}" style="border: 1px solid #cbd5e1; border-radius: 10px; background: #ffffff; color: #0f172a; font-size: 14px; font-weight: 700; padding: 10px 12px; outline: none;">
                        </label>
                        <label style="display: flex; flex-direction: column; gap: 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #475569;">
                            <span>Morning Offset (%)</span>
                            <input type="number" id="solarMorningUsageInput" min="1" max="100" step="1" value="${storedMorningUsagePercent.toFixed(0)}" style="border: 1px solid #cbd5e1; border-radius: 10px; background: #ffffff; color: #0f172a; font-size: 14px; font-weight: 700; padding: 10px 12px; outline: none;">
                        </label>
                        <div style="display: flex; align-items: end;">
                            <button type="button" onclick="refreshSolarEstimateWithCurrentInputs()" style="width: 100%; border: 1px solid #0f172a; border-radius: 10px; background: #0f172a; color: #ffffff; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 11px 14px; cursor: pointer;">
                                Update Preview
                            </button>
                        </div>
                    </div>
                    <div class="solar-calc-header" style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px;">
                        <div class="solar-calc-title" style="font-size: 13px; font-weight: 700; color: #0f172a;">How the saving is calculated</div>
                        <div class="solar-calc-button-row" style="display: flex; flex-wrap: wrap; gap: 8px;">
                            <button type="button" id="solarScenarioBtn_low30" class="solar-calc-button" onclick="switchSolarScenario('low30')" style="border: 1px solid #cbd5e1; border-radius: 999px; background: #ffffff; color: #0f172a; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; padding: 10px 14px; cursor: pointer;">
                                Low Day Usage (30%)
                            </button>
                            <button type="button" id="solarScenarioBtn_high80" class="solar-calc-button" onclick="switchSolarScenario('high80')" style="border: 1px solid #cbd5e1; border-radius: 999px; background: #ffffff; color: #0f172a; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; padding: 10px 14px; cursor: pointer;">
                                High Day Usage (80%)
                            </button>
                            <button type="button" id="saveSolarScenarioBtn" class="solar-calc-save-button" onclick="saveCurrentSolarScenario()" style="display: none; border: 1px solid #059669; border-radius: 999px; background: #059669; color: #ffffff; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; padding: 10px 14px; cursor: pointer;">
                                Save This Scenario
                            </button>
                        </div>
                    </div>
                    <div id="solarScenarioSummary" class="solar-calc-summary" style="margin-bottom: 14px; font-size: 12px; line-height: 1.6; color: #334155;">
                        Choose a scenario to see how direct offset and export change your savings.
                    </div>
                    <div class="solar-calc-legend" style="display: flex; flex-wrap: wrap; gap: 14px; align-items: center; margin-bottom: 12px; font-size: 12px; color: #475569;">
                        <div style="display: inline-flex; align-items: center; gap: 8px;">
                            <span style="width: 14px; height: 14px; border-radius: 4px; background: #dc6363; border: 1px solid #dc6363;"></span>
                            <span>Usage</span>
                        </div>
                        <div style="display: inline-flex; align-items: center; gap: 8px;">
                            <span style="width: 14px; height: 14px; border-radius: 4px; background: #6d97df; border: 1px solid #dc6a6a;"></span>
                            <span>Solar offset usage</span>
                        </div>
                        <div style="display: inline-flex; align-items: center; gap: 8px;">
                            <span style="width: 14px; height: 14px; border-radius: 4px; background: #6cab4f; border: 1px solid #6cab4f;"></span>
                            <span>Excess solar export</span>
                        </div>
                    </div>
                    <div class="solar-calc-chart-box" style="border: 1px solid #dbeafe; border-radius: 14px; background: #ffffff; padding: 14px;">
                        <div id="solarEstimateChartEmpty" style="font-size: 12px; line-height: 1.7; color: #64748b;">Enter an average TNB bill and choose a scenario to see the 24-hour offset chart.</div>
                        <div id="solarEstimateChartGrid" style="display: grid; grid-template-columns: repeat(24, minmax(0, 1fr)); gap: 4px; align-items: end; min-height: 176px;"></div>
                        <div id="solarEstimateChartHours" style="display: grid; grid-template-columns: repeat(24, minmax(0, 1fr)); gap: 4px; margin-top: 10px;"></div>
                        <div class="solar-calc-chart-note" style="margin-top: 10px; font-size: 11px; color: #64748b;">24 columns, 1 hour per column. 10 rows show relative usage and solar intensity.</div>
                    </div>
                </div>
                <div id="solarEstimateSaveHint" class="solar-estimate-save-hint" style="display: none; margin-top: 14px; font-size: 12px; line-height: 1.6; color: #475569;"></div>
                ` : ''}
                <div class="solar-note-box" style="margin-top: 14px; border: 1px solid #fde68a; border-radius: 12px; background: #fffbeb; padding: 12px 14px;">
                    <div class="solar-note-text" style="font-size: 11px; line-height: 1.6; color: #78350f;">
                        Note: Solar saving estimation may vary after final installation. Actual performance can be affected by roof shape and angle, shading, weather conditions, and site-specific installation factors. This estimate assumes a flat roof surface for calculation.
                    </div>
                </div>
            </div>
        </section>
        ` : ''}

        <!-- Items Table -->
        <section class="items-table-wrapper">
            <table class="items-table">
                <thead>
                    <tr>
                        <th class="col-no">#</th>
                        <th class="col-desc">DESCRIPTION</th>
                        <th class="col-price">PRICE</th>
                        <th class="col-qty">QUANTITY</th>
                        <th class="col-amount">AMOUNT</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>
        </section>

        <!-- Warranties -->
        ${invoice.warranties && invoice.warranties.length > 0 ? `
        <section class="avoid-break" style="padding: 0 50px; margin-bottom: 40px;">
           <div class="bg-slate-50 rounded-t-lg border border-slate-200 px-4 py-3 flex text-[11px] font-bold text-slate-500 uppercase tracking-wider">
             Product Warranties
           </div>
           <div class="border border-t-0 border-slate-200 rounded-b-lg p-5 bg-white shadow-sm">
             <div class="space-y-4">
               ${invoice.warranties.map((w, idx) => `
                 <div class="flex flex-col sm:flex-row gap-2 sm:gap-6 sm:items-start text-sm">
                   <div class="sm:w-1/3 font-bold text-slate-800">${w.name || 'Product'}</div>
                   <div class="flex-1 text-slate-600 text-xs whitespace-pre-line leading-relaxed">${w.terms || ''}</div>
                 </div>
                 ${idx < invoice.warranties.length - 1 ? '<hr class="border-slate-50 my-4">' : ''}
               `).join('')}
             </div>
           </div>
        </section>
        ` : ''}

        <!-- Summary -->
        <section class="summary-section">
            <div class="summary-left">
                <span class="total-due-label">Total Due</span>
                <h2 class="total-due-amount">RM ${totalAmount.toFixed(2)}</h2>
                <div class="total-due-line"></div>
                ${invoice.status ? `<p class="late-charge">Status: ${invoice.status}</p>` : ''}
            </div>
            <div class="summary-right">
                <div class="summary-row">
                    <span class="summary-label">Sub Total</span>
                    <span class="summary-value">RM ${subtotal.toFixed(2)}</span>
                </div>
                ${discountAmount > 0 ? `
                <div class="summary-row">
                    <span class="summary-label" style="color: red;">Discount</span>
                    <span class="summary-value" style="color: red;">-RM ${Math.abs(discountAmount).toFixed(2)}</span>
                </div>` : ''}
                ${voucherAmount > 0 ? `
                <div class="summary-row">
                    <span class="summary-label" style="color: red;">Voucher</span>
                    <span class="summary-value" style="color: red;">-RM ${Math.abs(voucherAmount).toFixed(2)}</span>
                </div>` : ''}
                ${cnyPromoAmount > 0 ? `
                <div class="summary-row">
                    <span class="summary-label" style="color: orange;">CNY 2026 Reward</span>
                    <span class="summary-value" style="color: orange;">-RM ${Math.abs(cnyPromoAmount).toFixed(2)}</span>
                </div>` : ''}
                ${holidayBoostAmount > 0 ? `
                <div class="summary-row">
                    <span class="summary-label" style="color: green;">Holiday Boost Reward</span>
                    <span class="summary-value" style="color: green;">-RM ${Math.abs(holidayBoostAmount).toFixed(2)}</span>
                </div>` : ''}
                ${earnNowRebateAmount > 0 ? `
                <div class="summary-row">
                    <span class="summary-label" style="color: #d97706;">Earn Now Rebate</span>
                    <span class="summary-value" style="color: #d97706;">-RM ${Math.abs(earnNowRebateAmount).toFixed(2)}</span>
                </div>` : ''}
                ${earthMonthGoGreenBonusAmount > 0 ? `
                <div class="summary-row">
                    <span class="summary-label" style="color: #047857;">Earth Month Go Green Bonus</span>
                    <span class="summary-value" style="color: #047857;">-RM ${Math.abs(earthMonthGoGreenBonusAmount).toFixed(2)}</span>
                </div>` : ''}
                ${sstAmount > 0 ? `
                <hr class="summary-divider">
                <div class="summary-row">
                    <span class="summary-label">Tax (6%)</span>
                    <span class="summary-value">RM ${sstAmount.toFixed(2)}</span>
                </div>` : ''}
                <div class="summary-row total-row">
                    <span class="summary-label">TOTAL</span>
                    <span class="summary-value">RM ${totalAmount.toFixed(2)}</span>
                </div>
                ${bankName ? `
                <div class="payment-method">
                    <span class="label">Payment Method</span>
                    <div class="meta-row">
                        <span class="meta-label">Bank Name</span>
                        <span class="meta-value">: ${bankName || '-'}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">Account No</span>
                        <span class="meta-value">: ${bankAccountNo || '-'}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">Account Name</span>
                        <span class="meta-value">: ${bankAccountName || '-'}</span>
                    </div>
                    <div class="meta-row payment-ref-row">
                        <span class="meta-label">Payment Ref</span>
                        <span class="meta-value" style="letter-spacing: 0.04em;">: ${invoice.invoice_number || invoice.bubble_id || '-'}</span>
                    </div>
                </div>
                ` : ''}
            </div>
        </section>

        <!-- Tiger Neo 3 Promotional Banner -->
        ${hasTigerNeo3 && tigerNeoProposalUrl && !isA4Preview ? `
        <a class="promotional-banner no-print" data-track-button="Tiger Neo 3 Promotional Banner" href="${tigerNeoProposalUrl}" target="_blank" rel="noopener noreferrer" style="display: block; padding: 0 50px; margin-bottom: 40px; cursor: pointer;">
            <div style="border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.08); transition: transform 0.2s; position: relative;" onmouseover="this.style.transform='translateY(-2px)';" onmouseout="this.style.transform='translateY(0)';">
                <img src="/slide-001.webp" alt="Rise With Tiger Neo 3" style="width: 100%; display: block; object-fit: cover;">
                <div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(to top, rgba(0,0,0,0.7), transparent); padding: 20px 15px 10px; color: white; text-align: right; font-size: 11px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;">
                    Generate Tiger Neo 3 Proposal <i class='bx bx-right-arrow-alt' style="vertical-align: middle; font-size: 14px;"></i>
                </div>
            </div>
        </a>
        ` : ''}

        <!-- Terms & Signature -->
        <section class="terms-signature">
            <div class="terms">
                <h3>Terms & Conditions</h3>
                <p style="white-space: pre-line;">${templateData.terms_and_conditions || ''}</p>
                <div class="mt-6 text-[10px] text-slate-400 font-medium">
                  ${titleLabel} Created by: <span class="text-slate-600">${invoice.created_by_user_name || 'System'}</span>
                </div>
            </div>
            <div class="signature">
                ${invoice.customer_signature ? `
                <div class="signature-image relative group">
                    <img src="${invoice.customer_signature.startsWith('//') ? 'https:' + invoice.customer_signature : invoice.customer_signature}" alt="Signature">
                    ${showInteractiveControls ? `
                    <button onclick="resetSignature()" class="absolute top-0 right-0 opacity-0 group-hover:opacity-100 bg-white/90 shadow-sm border border-slate-200 text-slate-600 hover:text-red-500 p-1 rounded transition-all no-print" title="Re-sign" style="font-size: 10px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
                      ✕
                    </button>
                    ` : ''}
                </div>
                ` : ''}
                ${showInteractiveControls && (!invoice.customer_signature || invoice.customer_signature.trim() === '') ? `
                <div class="no-print" style="margin-bottom: 10px;">
                    <button onclick="openSignatureModal()" class="px-4 py-2 bg-emerald-600 text-white rounded font-bold shadow hover:bg-emerald-700 w-full transition-transform active:scale-95">Sign this ${titleLabel}</button>
                </div>
                ` : ''}
                <h4>${invoice.customer_name || 'Customer'}</h4>
                ${invoice.signature_date ? `<p style="font-size: 8px; color: #999; margin-top: 5px;">Signed on ${invoice.signature_date}</p>` : ''}
                ${showInteractiveControls && invoice.customer_signature ? `
                <div class="mt-2 no-print">
                  <button onclick="resetSignature()" class="text-[9px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest transition-colors">Re-sign</button>
                </div>
                ` : ''}
            </div>
        </section>

        <footer class="mt-12 mb-4 text-center no-print">
          <p class="text-[9px] text-slate-300 uppercase tracking-[0.3em] font-medium">Thank you for your business</p>
        </footer>

        <!-- Footer Footer -->
        <footer class="invoice-footer">
            <div class="footer-col" style="flex: 1;">
                <div class="icon-circle"><i class='bx bxs-phone'></i></div>
                <div class="footer-text">
                    <p>${companyPhone || '-'}</p>
                </div>
            </div>
            <div class="footer-col" style="flex: 1.5; justify-content: center;">
                <div class="icon-circle"><i class='bx bxs-map'></i></div>
                <div class="footer-text text-center">
                    <p style="white-space: pre-line;">${companyAddress || '-'}</p>
                </div>
            </div>
            <div class="footer-col" style="flex: 1; justify-content: flex-end;">
                ${companyEmail ? `
                <div class="icon-circle"><i class='bx bxs-envelope'></i></div>
                <div class="footer-text text-right">
                    <p>${companyEmail}</p>
                </div>
                ` : ''}
            </div>
        </footer>
        <div class="footer-bottom-bar"></div>
    </div>
    ${showInteractiveControls && trackerIdentifier ? `
    <script>
      window.EternalgyInvoiceTracker = {
        invoiceIdentifier: ${JSON.stringify(trackerIdentifier)},
        pageType: 'invoice',
        endpoint: '/api/invoice-view-activity'
      };
    </script>
    <script src="/js/invoice-view-tracker.js" defer></script>
    ` : ''}
</body>
</html>
  `;
    return html;
}

module.exports = {
    generateInvoiceHtmlV2
};
