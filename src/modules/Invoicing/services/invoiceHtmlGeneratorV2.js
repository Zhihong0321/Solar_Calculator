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
    // Battery is attached as a line item (see create_invoice.js BATTERY_PRODUCT_REF
    // / BATTERY_PRODUCT_NAME). Match either the product ref or the description
    // substring so future product variants stay covered.
    const BATTERY_PRODUCT_REF = '1776182988047x800815659516747800';
    const hasBatteryItem = items.some((item) => {
        const text = `${item.description || ''} ${item.product_name || ''}`.toLowerCase();
        return item.linked_product === BATTERY_PRODUCT_REF || text.includes('battery');
    });
    // Hidden for battery invoices because the savings comparison is
    // currently solar-only (no charge/discharge math). Re-enable for
    // pure-solar packages once the calc covers battery scenarios.
    const showSolarSavingsSection = !isCommercialPackage
        && !isEvCharger
        && !hasBatteryItem
        && (hasSolarSavingsSection || (showInteractiveControls && canEstimateSolarSavings));
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
    // Surface ALL action buttons in preview mode so reviewers can see them.
    // In production these are gated by viewerHasAuthenticatedUser and
    // linked_seda_registration; for the static design preview we force them on.
    const previewForceAllActions = options.previewForceAllActions === true;
    const effectiveViewerAuthenticated = previewForceAllActions ? true : viewerHasAuthenticatedUser;
    const effectiveLinkedSeda = previewForceAllActions
        ? (invoice.linked_seda_registration || 'preview-seda-321')
        : invoice.linked_seda_registration;

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

        const descText = item.description || '';
        const isDiscountOrVoucher = isNegative || 
            descText.toLowerCase().includes('discount') || 
            descText.toLowerCase().includes('voucher') || 
            descText.toLowerCase().includes('promo') ||
            descText.toLowerCase().includes('rebate') ||
            descText.toLowerCase().includes('bonus') ||
            descText.toLowerCase().includes('reward');

        itemsHtml += `
      <tr class="${index % 2 !== 0 ? 'alternate-row' : ''}${isDiscountOrVoucher ? ' discount-row' : ''}">
          <td class="col-no" data-label="#">${String(index + 1).padStart(2, '0')}</td>
          <td class="col-desc" data-label="DESCRIPTION">${descText ? descText.replace(/\\n/g, '<br>') : ''}</td>
          <td class="col-price" data-label="PRICE">RM ${Math.abs(unitPrice).toFixed(2)}</td>
          <td class="col-qty" data-label="QUANTITY">${qty}</td>
          <td class="col-amount" data-label="AMOUNT">${isNegative ? '-' : ''}RM ${Math.abs(totalPrice).toFixed(2)}</td>
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
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <!-- Boxicons for icons -->
    <link href='https://unpkg.com/boxicons@2.1.4/css/boxicons.min.css' rel='stylesheet'>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/signature_pad@4.1.7/dist/signature_pad.umd.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <style>
/* === Eternalgy Design System v2 === */
:root {
    --gp: #16a34a;
    --gl: #22c55e;
    --gb: #dcfce7;
    --gbd: #86efac;
    --gd: #14532d;
    --nb: #0d1f0f;
    --dk: #1a2e1c;
    --dkx: #091407;
    --g50: #fafafa;
    --g100: #f3f4f6;
    --g200: #e5e7eb;
    --g300: #d1d5db;
    --g400: #9ca3af;
    --g500: #6b7280;
    --g700: #374151;
    --g900: #111827;
    --wb: #fffbeb;
    --wbd: #fde68a;
    --wt: #d97706;
    --wdk: #92400e;
    --eb: #fef2f2;
    --ebd: #fecaca;
    --et: #991b1b;
    --ib: #eff6ff;
    --it: #3b82f6;
    --f: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    --app-bg: #f1f5f1;
    --font-mono: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
}

* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    -webkit-tap-highlight-color: transparent;
}

body {
    font-family: var(--f);
    color: var(--g900);
    background: var(--g100);
    font-size: 13px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    padding: 28px 16px;
    display: flex;
    justify-content: center;
    flex-direction: column;
    align-items: center;
}

body.a4-preview {
    background: var(--g100);
    padding: 16px;
    height: auto;
}

body.a4-preview .pagedjs_page {
    background-color: #fff;
    box-shadow: 0 4px 14px rgba(0,0,0,0.06);
    margin: 0 auto 16px;
}

@page {
    size: A4;
    margin: 12mm 14mm;
}

.invoice-container {
    background-color: #fff;
    max-width: 760px;
    width: 100%;
    border-radius: 16px;
    position: relative;
    padding: 24px 24px 20px;
}

body.a4-preview .invoice-container {
    width: 100%;
    max-width: 100%;
    box-shadow: none;
    padding-bottom: 0;
    border-radius: 0;
    overflow: visible;
}

body.a4-preview .invoice-actions,
body.a4-preview .promotional-banner,
body.a4-preview .no-print { display: none !important; }

body.a4-preview .footer-bar { display: none !important; }

body.a4-preview .invoice-footer { margin-bottom: 0; }

body.a4-preview .items-table thead { display: table-header-group; }

body.a4-preview .items-table tr,
body.a4-preview .billing-block,
body.a4-preview .summary-block,
body.a4-preview .terms-signature,
body.a4-preview .invoice-footer,
body.a4-preview .solar-strip,
body.a4-preview .warranties,
body.a4-preview .promotional-banner,
body.a4-preview .avoid-break { break-inside: avoid; page-break-inside: avoid; }

body.a4-preview .terms-signature { break-before: page; page-break-before: always; }

/* === Header === */
.invoice-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 24px;
    padding-bottom: 20px;
    margin-bottom: 24px;
    border-bottom: 1px solid var(--line);
}

.brand-block {
    display: flex;
    align-items: center;
    gap: 12px;
}

.brand-block .logo-box {
    flex-shrink: 0;
}

.brand-block .logo-box img {
    max-height: 36px;
    max-width: 140px;
    object-fit: contain;
    filter: none;
}

.brand-block .company-info {
    text-align: left;
}

.brand-block .company-info h2 {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
    letter-spacing: 0.01em;
    margin-bottom: 2px;
}

.brand-block .company-info p {
    font-size: 11px;
    color: var(--ink-muted);
    line-height: 1.4;
    font-weight: 400;
}

.invoice-title {
    padding: 0;
    text-align: right;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
}

.invoice-title h1 {
    font-family: var(--font-display);
    font-size: 32px;
    font-weight: 500;
    letter-spacing: -0.02em;
    color: var(--ink);
    text-transform: uppercase;
    line-height: 1;
}

.invoice-title .doc-num {
    font-size: 10px;
    color: var(--ink-muted);
    text-transform: uppercase;
    letter-spacing: 0.14em;
    margin-top: 6px;
    font-weight: 500;
}

.invoice-actions {
    display: flex;
    gap: 6px;
    margin-top: 14px;
    flex-wrap: wrap;
    justify-content: flex-end;
}

.pre-site-visit-alert {
    margin-bottom: 20px;
    padding: 14px 16px;
    border: 1px solid #dc2626;
    border-left-width: 3px;
    background: #fef2f2;
}

.pre-site-visit-alert-label {
    display: inline-block;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #dc2626;
    margin-bottom: 6px;
}

.pre-site-visit-alert h2 {
    margin: 0 0 4px;
    color: #7f1d1d;
    font-family: var(--font-display);
    font-size: 18px;
    line-height: 1.2;
    font-weight: 500;
    text-transform: none;
}

.pre-site-visit-alert p {
    margin: 0;
    color: #7f1d1d;
    font-size: 12px;
    line-height: 1.5;
    font-weight: 400;
}

.action-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 5px 10px;
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    border-radius: 2px;
    transition: all 0.15s;
    cursor: pointer;
    background: transparent;
    border: 1px solid var(--line);
    color: var(--ink);
    font-family: var(--font-body);
}

.action-btn:hover { background: var(--ink); color: var(--card); border-color: var(--ink); }

.btn-referral { color: var(--accent); border-color: var(--accent); }
.btn-referral:hover { background: var(--accent); color: var(--card); border-color: var(--accent); }

.btn-share {
    color: var(--card);
    background: var(--ink);
    border: 1px solid var(--ink);
}
.btn-share:hover {
    background: #333;
    border-color: #333;
    color: #ffffff;
}

.btn-proposal { color: #1d4ed8; border-color: #1d4ed8; }
.btn-proposal:hover { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }

.btn-seda { color: #c2410c; border-color: #c2410c; }
.btn-seda:hover { background: #c2410c; color: #fff; border-color: #c2410c; }

.btn-pdf { color: var(--ink-muted); border-color: var(--ink-muted); }
.btn-pdf:hover { background: var(--ink-muted); color: var(--card); border-color: var(--ink-muted); }

.btn-preview { color: var(--ink); border-color: var(--ink); }
.btn-preview:hover { background: var(--ink); color: var(--card); }

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

/* === Billing === */
.billing-block {
    display: grid;
    grid-template-columns: 1.2fr 1fr;
    gap: 32px;
    margin-bottom: 24px;
}

.eyebrow {
    display: block;
    font-size: 9px;
    font-weight: 600;
    color: var(--ink-muted);
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.16em;
}

.party-name {
    font-family: var(--font-display);
    font-size: 16px;
    font-weight: 500;
    margin-bottom: 2px;
    color: var(--ink);
    line-height: 1.3;
}

.party-detail {
    font-size: 12px;
    color: var(--ink-muted);
    line-height: 1.5;
    white-space: pre-line;
}

.meta-list { display: flex; flex-direction: column; gap: 4px; }

.meta-row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    padding: 2px 0;
    gap: 12px;
}

.meta-row .meta-label {
    width: auto;
    color: var(--ink-muted);
}

.meta-row .meta-value {
    color: var(--ink);
    font-weight: 500;
    text-align: right;
}

/* === Solar savings strip === */
.solar-strip {
    border: 1px solid var(--line);
    border-left: 3px solid var(--accent);
    padding: 14px 16px;
    margin-bottom: 24px;
    background: var(--card);
}

.solar-strip-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 12px;
    gap: 12px;
    flex-wrap: wrap;
}

.solar-strip-title {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--accent);
}

.solar-strip-recalc {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--ink);
    background: transparent;
    border: 0;
    padding: 0;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
    font-family: var(--font-body);
}

.solar-strip-recalc:hover { color: var(--accent); }

.solar-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
}

.solar-stat-label {
    font-size: 9px;
    color: var(--ink-muted);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 4px;
    font-weight: 600;
}

.solar-stat-value {
    font-family: var(--font-display);
    font-size: 22px;
    font-weight: 500;
    color: var(--ink);
    line-height: 1.05;
    font-variant-numeric: tabular-nums;
}

.solar-stat.is-saving .solar-stat-value { color: var(--accent); }

.solar-mode-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 12px;
    flex-wrap: wrap;
}

.solar-mode-pill {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    padding: 5px 10px;
    border: 1px solid var(--line);
    border-radius: 2px;
    background: transparent;
    color: var(--ink);
    cursor: pointer;
    transition: all 0.15s;
    font-family: var(--font-body);
}

.solar-mode-pill:hover { border-color: var(--ink); }
.solar-mode-pill.is-active { background: var(--ink); color: var(--card); border-color: var(--ink); }

.solar-status {
    font-size: 11px;
    color: var(--ink-muted);
    margin-top: 8px;
    line-height: 1.5;
    min-height: 0;
}

.solar-status:empty { display: none; }

.solar-note {
    font-size: 10px;
    color: var(--ink-soft);
    margin-top: 10px;
    line-height: 1.5;
}

/* === Items table === */
.items-block { margin-bottom: 24px; }

.items-table {
    width: 100%;
    border-collapse: collapse;
}

.items-table th {
    text-align: left;
    padding: 8px 10px;
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--ink-muted);
    border-bottom: 1px solid var(--ink);
}

.items-table th.col-no, .items-table th.col-qty { text-align: center; }
.items-table th.col-amount, .items-table th.col-price { text-align: right; }

.items-table td {
    padding: 10px 10px;
    font-size: 12px;
    border-bottom: 1px solid var(--line);
    font-variant-numeric: tabular-nums;
}

.items-table td.col-desc {
    color: var(--ink);
    font-weight: 500;
    font-variant-numeric: normal;
}

.items-table td.col-no, .items-table td.col-qty { text-align: center; }
.items-table td.col-amount, .items-table td.col-price { text-align: right; }

.items-table tr.discount-row td { color: var(--ink-muted); }
.items-table tr.discount-row td.col-desc { color: var(--ink); font-weight: 500; }

/* === Warranties === */
.warranties { margin-bottom: 24px; }
.warranties-head {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--ink-muted);
    padding: 8px 0;
    border-top: 1px solid var(--ink);
    border-bottom: 1px solid var(--line);
}
.warranty-row {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 16px;
    padding: 10px 0;
    border-bottom: 1px solid var(--line);
    font-size: 12px;
}
.warranty-name { font-weight: 600; color: var(--ink); }
.warranty-terms { color: var(--ink-muted); line-height: 1.5; white-space: pre-line; }

/* === Summary === */
.summary-block {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
    padding-top: 20px;
    margin-bottom: 24px;
    border-top: 1px solid var(--line);
}

.total-due {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-top: 0;
}

.total-due-label {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--ink-muted);
}

.total-due-amount {
    font-family: var(--font-display);
    font-size: 32px;
    font-weight: 500;
    color: var(--ink);
    letter-spacing: -0.02em;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
}

.total-due-status {
    font-size: 11px;
    color: var(--ink-muted);
    text-transform: capitalize;
}

.summary-right { width: auto; display: flex; flex-direction: column; }

.summary-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
}

.summary-row.is-discount .summary-label,
.summary-row.is-discount .summary-value { color: var(--ink-muted); }

.summary-row.is-total {
    padding: 10px 0;
    border-top: 1px solid var(--ink);
    margin-top: 6px;
    align-items: baseline;
}

.summary-row.is-total .summary-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--ink-muted);
}

.summary-row.is-total .summary-value {
    font-family: var(--font-display);
    font-size: 20px;
    font-weight: 500;
    color: var(--ink);
}

.payment-info {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
}

.payment-info .eyebrow { margin-bottom: 8px; }
.payment-info .meta-row { padding: 2px 0; }

/* === Terms & signature === */
.terms-signature {
    display: grid;
    grid-template-columns: 1.5fr 1fr;
    gap: 32px;
    padding: 24px 0 20px;
    border-top: 1px solid var(--line);
    margin-bottom: 20px;
}

.terms { max-width: 100%; margin-bottom: 0; }

.terms h3 {
    font-size: 10px;
    font-weight: 600;
    margin-bottom: 8px;
    color: var(--ink-muted);
    text-transform: uppercase;
    letter-spacing: 0.16em;
}

.terms p {
    font-size: 9px;
    color: var(--ink-soft);
    line-height: 1.55;
    white-space: normal;
}

.terms .created-by {
    font-size: 9px;
    color: var(--ink-soft);
    margin-top: 12px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
}

.signature {
    text-align: center;
    width: auto;
    align-self: flex-start;
}

.signature-image {
    height: 70px;
    overflow: hidden;
    margin-bottom: 6px;
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
}

.signature-image img {
    margin: 0;
    width: auto;
    max-width: 200px;
    max-height: 100px;
    object-fit: contain;
}

.signature h4 {
    font-family: var(--font-display);
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 2px;
    color: var(--ink);
}

.signature .signed-on {
    font-size: 9px;
    color: var(--ink-soft);
}

.signature .sign-btn {
    display: block;
    width: 100%;
    padding: 10px;
    background: var(--ink);
    color: var(--card);
    border: 0;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    cursor: pointer;
    font-family: var(--font-body);
    transition: background 0.15s;
}

.signature .sign-btn:hover { background: var(--accent); }

.signature .re-sign {
    font-size: 9px;
    color: var(--ink-soft);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    margin-top: 6px;
    background: none;
    border: 0;
    cursor: pointer;
    padding: 0;
    font-family: var(--font-body);
}

.signature .re-sign:hover { color: var(--ink); }

/* === Footer === */
.invoice-footer {
    display: flex;
    justify-content: space-between;
    padding: 16px 0 0;
    border-top: 1px solid var(--line);
    margin: 0;
    gap: 16px;
    font-size: 10px;
    color: var(--ink-muted);
    align-items: flex-start;
}

.footer-col { display: flex; align-items: center; gap: 8px; }

.icon-circle {
    display: flex;
    justify-content: center;
    align-items: center;
    color: var(--ink-muted);
    font-size: 14px;
    line-height: 1;
}

.footer-text p { font-size: 10px; color: var(--ink-muted); line-height: 1.4; }

.thank-you {
    font-size: 9px;
    text-align: center;
    color: var(--ink-soft);
    text-transform: uppercase;
    letter-spacing: 0.3em;
    margin-top: 16px;
    font-weight: 500;
}

.footer-bar { display: none; }

/* === Certifications footer · minimal mono · business premium === */
.certifications {
    background: #fff;
    border: 1px solid var(--g200);
    border-radius: 6px;
    padding: 10px 12px 10px;
    margin-top: 6px;
    break-inside: avoid;
    page-break-inside: avoid;
}

.cert-head {
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--g100);
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
}

.cert-headline {
    font-family: var(--font-mono);
    font-size: 10.5px;
    font-weight: 600;
    color: var(--g900);
    line-height: 1.3;
    letter-spacing: -0.005em;
}

.cert-subline {
    font-family: var(--font-mono);
    font-size: 8px;
    font-weight: 400;
    color: var(--g400);
    line-height: 1.3;
    text-transform: uppercase;
    letter-spacing: 0.1em;
}

.cert-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
}

.cert-card {
    padding: 6px 8px;
    display: grid;
    grid-template-columns: 18px 1fr;
    gap: 7px;
    align-items: start;
    border-bottom: 1px solid var(--g100);
    break-inside: avoid;
    page-break-inside: avoid;
}

.cert-card:nth-child(odd) { border-right: 1px solid var(--g100); }
.cert-card:nth-child(1),
.cert-card:nth-child(2) { padding-top: 2px; }
.cert-card:nth-child(3),
.cert-card:nth-child(4) { padding-bottom: 2px; border-bottom: none; }

.cert-logo {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 1px;
}

.cert-logo img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    display: block;
}

.cert-name {
    font-family: var(--font-mono);
    font-size: 9px;
    font-weight: 600;
    color: var(--g900);
    line-height: 1.3;
    margin-bottom: 2px;
}

.cert-meta {
    font-family: var(--font-mono);
    font-size: 8.5px;
    font-weight: 400;
    color: var(--g500);
    line-height: 1.45;
    word-break: break-word;
}

/* === Promotional banner (Tiger Neo 3) === */
.promotional-banner {
    display: block;
    padding: 0;
    margin-bottom: 20px;
    cursor: pointer;
}

.promotional-banner .banner-frame {
    border-radius: 2px;
    overflow: hidden;
    transition: transform 0.2s;
}

.promotional-banner:hover .banner-frame { transform: translateY(-1px); }

.promotional-banner img { width: 100%; display: block; object-fit: cover; }

.promotional-banner .banner-caption {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    background: var(--ink);
    color: var(--card);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    transition: background 0.2s;
}

.promotional-banner:hover .banner-caption { background: var(--accent); }

/* === Print === */
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
        border: 0;
    }
    .no-print { display: none !important; }
    .promotional-banner { display: none !important; }
    .items-table thead { display: table-header-group; }
    .items-table tr { break-inside: avoid; page-break-inside: avoid; }
}

/* === Mobile (≤720px) === */
@media (max-width: 720px) {
    body {
        padding: 0;
        background-color: var(--card);
    }

    .invoice-container {
        border: 0;
        padding: 20px 16px 16px;
    }

    .invoice-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 16px;
        padding-bottom: 16px;
        margin-bottom: 20px;
    }

    .brand-block { gap: 10px; }
    .brand-block .logo-box img { max-height: 30px; }

    .invoice-title { text-align: left; align-items: flex-start; }
    .invoice-title h1 { font-size: 24px; }

    .invoice-actions {
        justify-content: flex-start;
        margin-top: 8px;
        gap: 6px;
    }

    .pre-site-visit-alert {
        padding: 12px 14px;
        margin-bottom: 16px;
    }
    .pre-site-visit-alert h2 { font-size: 16px; }
    .pre-site-visit-alert p { font-size: 11px; }

    .billing-block,
    .summary-block,
    .terms-signature {
        grid-template-columns: 1fr;
        gap: 16px;
        margin-bottom: 20px;
    }

    .summary-block { padding-top: 16px; }
    .summary-right { width: 100%; }

    /* Solar strip -> row layout on mobile */
    .solar-stats {
        grid-template-columns: 1fr;
        gap: 0;
    }
    .solar-stat {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 12px;
        padding: 8px 0;
        border-bottom: 1px solid var(--line);
    }
    .solar-stat:last-child { border-bottom: 0; }
    .solar-stat-label { margin-bottom: 0; }
    .solar-stat-value { font-size: 18px; }
    .solar-strip { padding: 12px 14px; margin-bottom: 16px; }

    /* Items table -> card layout */
    .items-block { margin-bottom: 16px; }
    .items-table thead { display: none; }
    .items-table, .items-table tbody, .items-table tr, .items-table td { display: block; width: 100%; }
    .items-table tr { padding: 8px 0; border-bottom: 1px solid var(--line); }
    .items-table td {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        padding: 4px 0;
        border: 0;
        gap: 12px;
    }
    .items-table td::before {
        content: attr(data-label);
        font-size: 9px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: var(--ink-muted);
        flex-shrink: 0;
    }
    .items-table td.col-desc { text-align: right; }

    .items-table tr.discount-row {
        display: flex !important;
        flex-direction: row !important;
        justify-content: space-between !important;
        align-items: baseline !important;
        padding: 8px 0 !important;
        gap: 12px;
    }
    .items-table tr.discount-row td {
        display: block !important;
        width: auto !important;
        padding: 0 !important;
        border-bottom: none !important;
    }
    .items-table tr.discount-row td::before { content: none !important; }
    .items-table tr.discount-row td.col-no,
    .items-table tr.discount-row td.col-price,
    .items-table tr.discount-row td.col-qty { display: none !important; }
    .items-table tr.discount-row td.col-desc {
        text-align: left !important;
        font-weight: 500 !important;
        color: var(--ink) !important;
        flex: 1;
    }
    .items-table tr.discount-row td.col-amount {
        text-align: right !important;
        font-weight: 500 !important;
        white-space: nowrap;
    }

    .warranty-row { grid-template-columns: 1fr; gap: 4px; }

    .terms-signature {
        padding: 16px 0;
        margin-bottom: 16px;
    }

    .signature { align-self: stretch; }

    .invoice-footer {
        flex-direction: column;
        gap: 8px;
        padding: 12px 0 0;
    }
    .footer-col { width: 100%; }

    .certifications { margin-top: 16px; padding: 12px 14px 10px; }
    .cert-grid { grid-template-columns: 1fr; }
    .cert-card { padding: 6px 8px; }
    .cert-card:nth-child(odd) { border-right: none; }
    .cert-card { border-bottom: 1px solid var(--g100); }
    .cert-card:last-child { border-bottom: none; }

    .promotional-banner { margin-bottom: 16px; }
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
            <div class="brand-block">
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
                  ${(invoice.share_token || invoice.bubble_id) && effectiveViewerAuthenticated ? `
                  <button onclick='quickShareInvoice(${JSON.stringify(invoice.share_token || invoice.bubble_id)}, ${JSON.stringify(invoice.invoice_number || '')}, ${JSON.stringify(titleLabel)})' class="action-btn btn-share">
                    <span>Share</span>
                  </button>
                  ` : ''}
                  ${invoice.share_token ? `
                  <button onclick="window.open('https://referral.atap.solar', '_blank')" class="action-btn btn-referral">
                    <span>Refer Program</span>
                  </button>
                  ` : ''}
                  ${!isEvCharger && effectiveLinkedSeda ? `
                  <button onclick="window.open('/seda-register?id=${effectiveLinkedSeda}', '_blank')" class="action-btn btn-seda">
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

        <!-- Billing block -->
        <section class="billing-block">
            <div>
                <span class="eyebrow">Invoice To</span>
                <div class="party-name">${invoice.customer_name || 'Valued Customer'}</div>
                <div class="party-detail">${invoice.customer_address || ''}</div>
            </div>
            <div class="meta-list">
                <div class="meta-row">
                    <span class="meta-label">Invoice No</span>
                    <span class="meta-value">${invoice.invoice_number}</span>
                </div>
                <div class="meta-row">
                    <span class="meta-label">${titleLabel} Date</span>
                    <span class="meta-value"><span class="local-time" data-iso="${(() => { try { return new Date(invoice.invoice_date).toISOString(); } catch (e) { return ''; } })()}" data-show-time="true">${invoice.invoice_date || '-'}</span></span>
                </div>
                ${invoice.due_date ? `
                <div class="meta-row">
                    <span class="meta-label">Due Date</span>
                    <span class="meta-value"><span class="local-time" data-iso="${(() => { try { return new Date(invoice.due_date).toISOString(); } catch (e) { return ''; } })()}" data-show-time="true">${invoice.due_date}</span></span>
                </div>` : ''}
                ${invoice.customer_phone ? `
                <div class="meta-row">
                    <span class="meta-label">Phone</span>
                    <span class="meta-value">${invoice.customer_phone}</span>
                </div>` : ''}
                ${invoice.customer_email ? `
                <div class="meta-row">
                    <span class="meta-label">Email</span>
                    <span class="meta-value">${invoice.customer_email}</span>
                </div>` : ''}
            </div>
        </section>

        ${showSolarSavingsSection ? `
        <section class="solar-strip avoid-break">
            <div class="solar-strip-head">
                <span class="solar-strip-title">${solarSavingsSectionBadge} · ${solarSavingsSectionIntro}</span>
                ${showInteractiveControls && canEstimateSolarSavings ? `
                <button type="button" id="solarRecalculateBtn" class="solar-strip-recalc" onclick="openSolarEstimatePrompt()">Recalculate</button>
                ` : ''}
            </div>
            <div class="solar-stats">
                <div class="solar-stat">
                    <div class="solar-stat-label">Before Solar</div>
                    <div id="solarEstimateBeforeValue" class="solar-stat-value">${beforeSolarBill !== null ? `RM ${beforeSolarBill.toFixed(2)}` : 'RM —'}</div>
                </div>
                <div class="solar-stat">
                    <div class="solar-stat-label">After Solar</div>
                    <div id="solarEstimateAfterValue" class="solar-stat-value">${afterSolarBill !== null ? `RM ${afterSolarBill.toFixed(2)}` : 'RM —'}</div>
                </div>
                <div class="solar-stat is-saving">
                    <div class="solar-stat-label">Monthly Saving</div>
                    <div id="solarEstimateSavingValue" class="solar-stat-value">${estimatedMonthlySaving !== null ? `RM ${estimatedMonthlySaving.toFixed(2)}` : 'RM —'}</div>
                </div>
            </div>
            <div id="solarEstimateStatus" class="solar-status">${hasSolarSavingsSection
                ? 'Saved estimate on file. Use Recalculate to compare other bills.'
                : 'No saved estimate yet. Use Recalculate to preview this package against your average TNB bill.'}</div>
            ${showInteractiveControls && canEstimateSolarSavings ? `
            <div class="solar-mode-row">
                <button type="button" id="solarBillCycleBtn_fullMonth" class="solar-mode-pill" onclick="setSolarBillCycleMode('fullMonth')">Full Month</button>
                <button type="button" id="solarBillCycleBtn_under28Days" class="solar-mode-pill" onclick="setSolarBillCycleMode('under28Days')">&lt;28 Days</button>
            </div>
            <div id="solarMatchedBillHint" class="solar-status"></div>
            <div id="solarBillCycleHint" class="solar-status"></div>
            ` : ''}
            <div class="solar-note">Estimates may vary after installation due to roof shape, angle, shading, weather, and site conditions. Assumes a flat roof surface.</div>
            <div id="solarEstimateSaveHint" class="solar-status"></div>
        </section>
        ` : ''}

        <!-- Items Table -->
        <section class="items-block">
            <table class="items-table">
                <thead>
                    <tr>
                        <th class="col-no">#</th>
                        <th class="col-desc">Description</th>
                        <th class="col-price">Price</th>
                        <th class="col-qty">Qty</th>
                        <th class="col-amount">Amount</th>
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
        <section class="summary-block">
            <div class="total-due">
                <span class="total-due-label">Total Due</span>
                <h2 class="total-due-amount">RM ${totalAmount.toFixed(2)}</h2>
                ${invoice.status ? `<p class="total-due-status">Status · ${invoice.status}</p>` : ''}
            </div>
            <div class="summary-right">
                <div class="summary-row">
                    <span class="summary-label">Sub Total</span>
                    <span class="summary-value">RM ${subtotal.toFixed(2)}</span>
                </div>
                ${discountAmount > 0 ? `
                <div class="summary-row is-discount">
                    <span class="summary-label">Discount</span>
                    <span class="summary-value">−RM ${Math.abs(discountAmount).toFixed(2)}</span>
                </div>` : ''}
                ${voucherAmount > 0 ? `
                <div class="summary-row is-discount">
                    <span class="summary-label">Voucher</span>
                    <span class="summary-value">−RM ${Math.abs(voucherAmount).toFixed(2)}</span>
                </div>` : ''}
                ${cnyPromoAmount > 0 ? `
                <div class="summary-row is-discount">
                    <span class="summary-label">CNY 2026 Reward</span>
                    <span class="summary-value">−RM ${Math.abs(cnyPromoAmount).toFixed(2)}</span>
                </div>` : ''}
                ${holidayBoostAmount > 0 ? `
                <div class="summary-row is-discount">
                    <span class="summary-label">Holiday Boost Reward</span>
                    <span class="summary-value">−RM ${Math.abs(holidayBoostAmount).toFixed(2)}</span>
                </div>` : ''}
                ${earnNowRebateAmount > 0 ? `
                <div class="summary-row is-discount">
                    <span class="summary-label">Earn Now Rebate</span>
                    <span class="summary-value">−RM ${Math.abs(earnNowRebateAmount).toFixed(2)}</span>
                </div>` : ''}
                ${earthMonthGoGreenBonusAmount > 0 ? `
                <div class="summary-row is-discount">
                    <span class="summary-label">Earth Month Go Green Bonus</span>
                    <span class="summary-value">−RM ${Math.abs(earthMonthGoGreenBonusAmount).toFixed(2)}</span>
                </div>` : ''}
                ${sstAmount > 0 ? `
                <div class="summary-row">
                    <span class="summary-label">Tax (SST 6%)</span>
                    <span class="summary-value">RM ${sstAmount.toFixed(2)}</span>
                </div>` : ''}
                <div class="summary-row is-total">
                    <span class="summary-label">Total</span>
                    <span class="summary-value">RM ${totalAmount.toFixed(2)}</span>
                </div>
                ${bankName ? `
                <div class="payment-info">
                    <span class="eyebrow">Payment</span>
                    <div class="meta-row">
                        <span class="meta-label">Bank</span>
                        <span class="meta-value">${bankName || '—'}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">Account No</span>
                        <span class="meta-value">${bankAccountNo || '—'}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">Account Name</span>
                        <span class="meta-value">${bankAccountName || '—'}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">Payment Ref</span>
                        <span class="meta-value" style="font-variant-numeric: tabular-nums; letter-spacing: 0.04em;">${invoice.invoice_number || invoice.bubble_id || '—'}</span>
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
                <h3>Terms &amp; Conditions</h3>
                <p>${(templateData.terms_and_conditions || '').replace(/<br\s*\/?>/gi, ' ').replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim()}</p>
                <div class="created-by">
                  ${titleLabel} Created by: <span style="color: var(--ink-muted);">${invoice.created_by_user_name || 'System'}</span>
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

        <p class="thank-you">Thank you for your business</p>

        <!-- Certifications · minimal mono -->
        <section class="certifications avoid-break">
            <div class="cert-head">
                <span class="cert-headline">Registered &amp; Certified As</span>
                <span class="cert-subline">Eternalgy Sdn Bhd · Malaysia</span>
            </div>
            <div class="cert-grid">
                <div class="cert-card">
                    <div class="cert-logo"><img src="/logo/cidb-registered.png" alt="CIDB"></div>
                    <div>
                        <div class="cert-name">CIDB Registered Contractor</div>
                        <div class="cert-meta">0120250324-WP152634 · G3 · Cat B · CE · ME</div>
                    </div>
                </div>
                <div class="cert-card">
                    <div class="cert-logo"><img src="/logo/Seda-Malaysia001.png" alt="SEDA"></div>
                    <div>
                        <div class="cert-name">SEDA Solar PV Service Provider</div>
                        <div class="cert-meta">SEDA/RPVSP/2024/321</div>
                    </div>
                </div>
                <div class="cert-card">
                    <div class="cert-logo"><img src="/logo/Seda-Malaysia001.png" alt="SEDA"></div>
                    <div>
                        <div class="cert-name">SEDA Solar PV Investor</div>
                        <div class="cert-meta">Eternalgy Sdn Bhd</div>
                    </div>
                </div>
                <div class="cert-card">
                    <div class="cert-logo"><img src="/logo/myhijau_plain.jpg" alt="MyHijau"></div>
                    <div>
                        <div class="cert-name">MyHijau Equipment Cert</div>
                        <div class="cert-meta">SAJ Inverter · MyHS00025/25</div>
                    </div>
                </div>
            </div>
        </section>

        <!-- Footer Footer -->
        <footer class="invoice-footer">
            <div class="footer-col">
                <div class="icon-circle"><i class='bx bxs-phone'></i></div>
                <div class="footer-text">
                    <p>${companyPhone || '—'}</p>
                </div>
            </div>
            <div class="footer-col" style="justify-content: center; text-align: center;">
                <div class="icon-circle"><i class='bx bxs-map'></i></div>
                <div class="footer-text">
                    <p>${companyAddress || '—'}</p>
                </div>
            </div>
            <div class="footer-col" style="justify-content: flex-end; text-align: right;">
                ${companyEmail ? `
                <div class="icon-circle"><i class='bx bxs-envelope'></i></div>
                <div class="footer-text">
                    <p>${companyEmail}</p>
                </div>
                ` : ''}
            </div>
        </footer>
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
