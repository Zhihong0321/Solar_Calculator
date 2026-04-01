// invoiceHtmlGeneratorV2.js

function buildTigerNeoPresentationUrl(invoice) {
    const presentationPath = '/t3_html_presentation/solar-proposal-2026-tiger-neo-3/';
    const params = new URLSearchParams();
    if (invoice.customer_name) params.set('customer_name', invoice.customer_name);
    if (invoice.customer_address) params.set('customer_address', invoice.customer_address);

    const panelQty = parseFloat(invoice.panel_qty) || 0;
    const panelRating = parseFloat(invoice.panel_rating) || 0;
    const systemSizeKwp = parseFloat(invoice.system_size_kwp) || (panelQty && panelRating ? (panelQty * panelRating) / 1000 : 0);

    if (panelQty > 0) params.set('panel_qty', String(panelQty));
    if (panelRating > 0) params.set('panel_rating', String(panelRating));
    if (systemSizeKwp > 0) params.set('system_size_kwp', systemSizeKwp.toFixed(2));

    const query = params.toString();
    return query ? `${presentationPath}?${query}` : presentationPath;
}

function parseOptionalCurrency(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function generateInvoiceHtmlV2(invoice, template, options = {}) {
    const items = invoice.items || [];
    const templateData = template || {};

    const hasTigerNeo3 = items.some(item => (item.description || '').toLowerCase().includes('tiger neo 3'));
    const layoutMode = String(options.layout || options.viewMode || '').toLowerCase();
    const isA4Preview = layoutMode === 'a4' || layoutMode === 'a4-preview' || layoutMode === 'print';
    const showInteractiveControls = !options.forPdf && !isA4Preview;
    const estimateIdentifier = invoice.share_token || invoice.bubble_id || '';
    const estimatePanelQty = parseFloat(invoice.panel_qty) || 0;
    const estimatePanelRating = parseFloat(invoice.panel_rating) || 0;
    const canEstimateSolarSavings = estimatePanelQty > 0 && estimatePanelRating > 0 && Boolean(estimateIdentifier);

    // Calculate totals from items
    const sstAmount = parseFloat(invoice.sst_amount) || 0;
    const totalAmount = parseFloat(invoice.total_amount) || 0;
    const discountAmount = parseFloat(invoice.discount_amount) || 0;
    const voucherAmount = parseFloat(invoice.voucher_amount) || 0;
    const cnyPromoAmount = parseFloat(invoice.cny_promo_amount) || 0;
    const holidayBoostAmount = parseFloat(invoice.holiday_boost_amount) || 0;
    const beforeSolarBill = parseOptionalCurrency(invoice.customer_average_tnb);
    const storedAfterSolarBill = parseOptionalCurrency(invoice.estimated_new_bill_amount);
    const estimatedMonthlySaving = parseOptionalCurrency(invoice.estimated_saving);
    const afterSolarBill = beforeSolarBill !== null && estimatedMonthlySaving !== null
        ? Math.max(0, beforeSolarBill - estimatedMonthlySaving)
        : storedAfterSolarBill;
    const hasSolarSavingsSection = [beforeSolarBill, afterSolarBill, estimatedMonthlySaving]
        .every((value) => value !== null);
    const showSolarSavingsSection = hasSolarSavingsSection || (showInteractiveControls && canEstimateSolarSavings);
    const solarSavingsSectionBadge = hasSolarSavingsSection ? 'Monthly Estimate' : 'Package Estimate';
    const solarSavingsSectionIntro = hasSolarSavingsSection
        ? 'Your solar estimate at a glance'
        : 'Estimate your savings with this package';
    const solarSavingsHelperText = hasSolarSavingsSection
        ? 'Based on this quotation package and the latest saved estimate.'
        : 'Enter your average TNB bill to preview savings using default assumptions: 3.4 sun peak, 30% offset, and this package size.';

    // Decide title based on status: QUOTATION for drafts/pending, INVOICE for confirmed/paid
    const isConfirmed = (invoice.status || '').toLowerCase() === 'confirmed' || (invoice.status || '').toLowerCase() === 'paid';
    const titleLabel = isConfirmed ? 'INVOICE' : 'QUOTATION';

    const subtotal = totalAmount - sstAmount + discountAmount + voucherAmount + cnyPromoAmount + holidayBoostAmount;

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
body.a4-preview .promotional-banner {
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

    ${showInteractiveControls ? `
    ${(invoice.share_token || invoice.bubble_id) ? `
    <div class="floating-a4-preview no-print">
      <button onclick="openA4Preview('${invoice.share_token || invoice.bubble_id}')">
        <span>A4 Preview</span>
      </button>
    </div>
    ` : ''}

    <!-- Signature Modal -->
    <div id="signatureModal" class="fixed inset-0 z-[100] hidden bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all scale-95 opacity-0" id="signatureBox">
        <div class="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 class="text-sm font-bold text-slate-800 uppercase tracking-wider">Customer Signature</h3>
            <p class="text-[10px] text-slate-500 font-medium">Please sign within the box below</p>
          </div>
          <button onclick="closeSignatureModal()" class="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-white transition-all">✕</button>
        </div>
        <div class="p-6">
          <div class="relative bg-slate-50 border-2 border-dashed border-slate-200 rounded-lg overflow-hidden touch-none" style="height: 240px;">
            <canvas id="signatureCanvas" class="absolute inset-0 w-full h-full cursor-crosshair"></canvas>
          </div>
          <div class="flex justify-between items-center mt-6 gap-3">
            <button onclick="clearSignature()" class="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 uppercase tracking-widest transition-colors">Clear Space</button>
            <div class="flex gap-2 flex-1">
              <button onclick="closeSignatureModal()" class="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50 transition-all uppercase tracking-widest">Cancel</button>
              <button onclick="saveSignature()" id="saveSignBtn" class="flex-[2] px-4 py-2.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 shadow-lg transition-all uppercase tracking-widest flex items-center justify-center gap-2">
                Confirm & Sign
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <script>
      let signaturePad;
      const modal = document.getElementById('signatureModal');
      const box = document.getElementById('signatureBox');
      const canvas = document.getElementById('signatureCanvas');

      function openSignatureModal() {
        modal.classList.remove('hidden');
        setTimeout(() => {
          box.classList.remove('scale-95', 'opacity-0');
          resizeCanvas();
          if (!signaturePad) {
            signaturePad = new SignaturePad(canvas, {
              backgroundColor: 'rgba(255, 255, 255, 0)',
              penColor: '#0f172a'
            });
          }
        }, 10);
      }

      function closeSignatureModal() {
        box.classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
          modal.classList.add('hidden');
        }, 200);
      }

      function resizeCanvas() {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        canvas.getContext("2d").scale(ratio, ratio);
        if (signaturePad) signaturePad.clear();
      }

      window.onresize = resizeCanvas;

      function clearSignature() {
        if (signaturePad) signaturePad.clear();
      }

      async function saveSignature() {
        if (!signaturePad || signaturePad.isEmpty()) {
          return Swal.fire({ icon: 'warning', title: 'Empty Signature', text: 'Please provide your signature before confirming.', confirmButtonColor: '#0f172a' });
        }

        const btn = document.getElementById('saveSignBtn');
        const originalText = btn.innerHTML;
        
        try {
          btn.disabled = true;
          btn.innerHTML = 'Saving...';

          const dataUrl = signaturePad.toDataURL('image/png');
          const pathParts = window.location.pathname.split('/');
          const identifier = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];
          
          const response = await fetch('/view/' + identifier + '/signature', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ signature: dataUrl })
          });

          const result = await response.json();
          if (result.success) {
            Swal.fire({
              icon: 'success',
              title: 'Signed!',
              text: 'Your signature has been securely recorded.',
              timer: 2000,
              showConfirmButton: false
            }).then(() => {
              window.location.reload();
            });
          } else {
            throw new Error(result.error || 'Failed to save signature');
          }
        } catch (err) {
          Swal.fire({ icon: 'error', title: 'Error', text: err.message, confirmButtonColor: '#0f172a' });
          btn.disabled = false;
          btn.innerHTML = originalText;
        }
      }

      async function downloadInvoicePdf(shareToken) {
        const button = document.querySelector('button[onclick*="downloadInvoicePdf"]');
        const buttonText = document.getElementById('pdfButtonText');
        try {
          button.disabled = true;
          button.classList.add('opacity-75', 'cursor-not-allowed');
          buttonText.textContent = 'Preparing...';
          const response = await fetch('/view/' + shareToken + '/pdf');
          const data = await response.json();
          if (data.success && data.downloadUrl) {
            let downloadUrl = data.downloadUrl;
            if (!downloadUrl.startsWith('http')) downloadUrl = 'https://' + downloadUrl;
            window.open(downloadUrl, '_blank');
          } else {
            alert('Failed: ' + (data.error || 'Unknown error'));
          }
        } catch (err) {
          alert('Error: ' + err.message);
        } finally {
            button.disabled = false;
            button.classList.remove('opacity-75', 'cursor-not-allowed');
            buttonText.textContent = 'Download PDF';
        }
      }

      function viewProposal(shareToken) {
        window.open('/proposal/' + shareToken, '_blank');
      }

      function openA4Preview(shareToken) {
        window.open('/view/' + shareToken + '?layout=a4', '_blank', 'noopener');
      }

      const solarEstimateState = {
        identifier: ${JSON.stringify(estimateIdentifier)},
        hasSavedEstimate: ${hasSolarSavingsSection ? 'true' : 'false'},
        canEstimate: ${canEstimateSolarSavings ? 'true' : 'false'},
        currentAverageBill: ${beforeSolarBill !== null ? beforeSolarBill.toFixed(2) : 'null'},
        latestPreview: null
      };

      function formatSolarEstimateMoney(value) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? 'RM ' + numeric.toFixed(2) : 'RM --';
      }

      function updateSolarEstimateStatus(message, tone) {
        const statusEl = document.getElementById('solarEstimateStatus');
        if (!statusEl) return;

        const tones = {
          neutral: { bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' },
          success: { bg: '#ecfdf5', border: '#a7f3d0', color: '#047857' },
          warning: { bg: '#fffbeb', border: '#fde68a', color: '#92400e' }
        };
        const style = tones[tone] || tones.neutral;

        statusEl.textContent = message;
        statusEl.style.background = style.bg;
        statusEl.style.borderColor = style.border;
        statusEl.style.color = style.color;
      }

      function applySolarEstimateToPage(data, options = {}) {
        const beforeValue = document.getElementById('solarEstimateBeforeValue');
        const afterValue = document.getElementById('solarEstimateAfterValue');
        const savingValue = document.getElementById('solarEstimateSavingValue');
        const saveHint = document.getElementById('solarEstimateSaveHint');

        if (beforeValue) beforeValue.textContent = formatSolarEstimateMoney(data.customer_average_tnb);
        if (afterValue) afterValue.textContent = formatSolarEstimateMoney(data.estimated_new_bill_amount);
        if (savingValue) savingValue.textContent = formatSolarEstimateMoney(data.estimated_saving);

        if (saveHint) {
          saveHint.textContent = options.saved
            ? 'Saved to this quotation.'
            : 'Preview updated. Save if you want this estimate stored in the quotation.';
          saveHint.style.display = options.showSaveHint ? 'block' : 'none';
        }

        updateSolarEstimateStatus(
          options.saved
            ? 'This quotation now includes the latest solar estimate.'
            : 'Estimate calculated using default assumptions and this package size.',
          options.saved ? 'success' : 'neutral'
        );
      }

      async function requestSolarEstimate(averageBill, save) {
        const response = await fetch('/view/' + solarEstimateState.identifier + '/solar-estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ averageBill, save })
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to calculate solar estimate');
        }

        return result;
      }

      async function openSolarEstimatePrompt() {
        if (!solarEstimateState.canEstimate || !solarEstimateState.identifier) {
          return Swal.fire({
            icon: 'info',
            title: 'Estimate Unavailable',
            text: 'This quotation package does not have enough panel details for solar estimation.',
            confirmButtonColor: '#0f172a'
          });
        }

        const { value: inputValue } = await Swal.fire({
          title: 'Recalculate Solar Saving',
          input: 'number',
          inputLabel: 'Average Monthly TNB Bill (RM)',
          inputPlaceholder: 'Enter your average bill amount',
          inputValue: solarEstimateState.currentAverageBill || '',
          inputAttributes: {
            min: '1',
            step: '1'
          },
          showCancelButton: true,
          confirmButtonText: 'Calculate',
          confirmButtonColor: '#059669',
          cancelButtonText: 'Cancel',
          preConfirm: (value) => {
            const numeric = Number(value);
            if (!Number.isFinite(numeric) || numeric <= 0) {
              Swal.showValidationMessage('Please enter a valid average TNB bill amount.');
              return false;
            }
            return Math.round(numeric);
          }
        });

        if (!inputValue) {
          return;
        }

        try {
          Swal.fire({
            title: 'Calculating...',
            text: 'Checking this package against your bill amount.',
            allowOutsideClick: false,
            allowEscapeKey: false,
            didOpen: () => Swal.showLoading()
          });

          const result = await requestSolarEstimate(inputValue, false);
          const estimate = result.data;

          solarEstimateState.currentAverageBill = estimate.customer_average_tnb;
          solarEstimateState.latestPreview = estimate;
          applySolarEstimateToPage(estimate, { showSaveHint: true, saved: false });

          const saveChoice = await Swal.fire({
            icon: 'success',
            title: 'Estimate Ready',
            html:
              '<div style="text-align:left;font-size:14px;line-height:1.7;">' +
              '<div><strong>Your Average TNB Bill:</strong> ' + formatSolarEstimateMoney(estimate.customer_average_tnb) + '</div>' +
              '<div><strong>New Bill After Solar:</strong> ' + formatSolarEstimateMoney(estimate.estimated_new_bill_amount) + '</div>' +
              '<div><strong>Estimated Monthly Saving:</strong> ' + formatSolarEstimateMoney(estimate.estimated_saving) + '</div>' +
              '</div>',
            showDenyButton: true,
            confirmButtonText: 'Save Estimate',
            denyButtonText: 'Keep Preview Only',
            confirmButtonColor: '#059669',
            denyButtonColor: '#0f172a'
          });

          if (!saveChoice.isConfirmed) {
            updateSolarEstimateStatus('Preview updated. The quotation is unchanged until you save the estimate.', 'warning');
            return;
          }

          Swal.fire({
            title: 'Saving...',
            text: 'Updating this quotation with the new estimate.',
            allowOutsideClick: false,
            allowEscapeKey: false,
            didOpen: () => Swal.showLoading()
          });

          const savedResult = await requestSolarEstimate(inputValue, true);
          solarEstimateState.hasSavedEstimate = true;
          solarEstimateState.latestPreview = null;
          applySolarEstimateToPage(savedResult.data, { showSaveHint: true, saved: true });

          await Swal.fire({
            icon: 'success',
            title: 'Estimate Saved',
            text: 'The solar saving section has been updated for this quotation.',
            confirmButtonColor: '#059669'
          });
        } catch (err) {
          await Swal.fire({
            icon: 'error',
            title: 'Recalculation Failed',
            text: err.message,
            confirmButtonColor: '#0f172a'
          });
        }
      }

      function resetSignature() {
        Swal.fire({
          title: 'Re-sign Document?',
          text: "This will allow you to clear and replace the current signature.",
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#0f172a',
          cancelButtonColor: '#f1f5f9',
          confirmButtonText: 'Yes, Re-sign',
          cancelButtonText: 'Cancel'
        }).then((result) => {
          if (result.isConfirmed) {
            openSignatureModal();
          }
        });
      }
    </script>
    ` : ''}

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
                  ${invoice.share_token ? `
                  <button onclick="window.open('https://referral.atap.solar', '_blank')" class="action-btn btn-referral">
                    <span>Refer Program</span>
                  </button>
                  ` : ''}
                  ${invoice.linked_seda_registration ? `
                  <button onclick="window.open('/seda-register?id=${invoice.linked_seda_registration}', '_blank')" class="action-btn btn-seda">
                    <span>SEDA Form</span>
                  </button>
                  ` : ''}
                  ${!hasTigerNeo3 && (invoice.share_token || invoice.bubble_id) && invoice.customer_name && invoice.customer_name !== 'Sample Quotation' ? `
                  <button onclick="viewProposal('${invoice.share_token || invoice.bubble_id}')" class="action-btn btn-proposal">
                    <span>View Proposal</span>
                  </button>
                  ` : ''}
                  ${(invoice.share_token || invoice.bubble_id) ? `
                  <button onclick="openA4Preview('${invoice.share_token || invoice.bubble_id}')" class="action-btn btn-preview">
                    <span>A4 Preview</span>
                  </button>
                  ` : ''}
                  ${(invoice.share_token || invoice.bubble_id) ? `
                  <button onclick="downloadInvoicePdf('${invoice.share_token || invoice.bubble_id}')" class="action-btn btn-pdf">
                    <span id="pdfButtonText">Download PDF</span>
                  </button>
                  ` : ''}
                </div>
                ` : ''}
            </div>
        </header>

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
            <div class="payment-method" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border: 1px solid #0f172a; border-radius: 16px; padding: 18px 20px; box-shadow: 0 14px 30px rgba(15, 23, 42, 0.18);">
                <span class="label" style="color: #cbd5e1;">Payment Method</span>
                <div class="meta-row">
                    <span class="meta-label" style="color: #94a3b8;">Bank Name</span>
                    <span class="meta-value" style="color: #ffffff; font-weight: 700;">: ${bankName || '-'}</span>
                </div>
                <div class="meta-row">
                    <span class="meta-label" style="color: #94a3b8;">Account No</span>
                    <span class="meta-value" style="color: #ffffff; font-weight: 700;">: ${bankAccountNo || '-'}</span>
                </div>
                <div class="meta-row">
                    <span class="meta-label" style="color: #94a3b8;">Account Name</span>
                    <span class="meta-value" style="color: #ffffff; font-weight: 700;">: ${bankAccountName || '-'}</span>
                </div>
                <div class="meta-row" style="margin-top: 10px; padding-top: 12px; border-top: 1px solid rgba(148, 163, 184, 0.35);">
                    <span class="meta-label" style="color: #94a3b8;">Payment Ref</span>
                    <span class="meta-value" style="color: #f8fafc; font-weight: 800; letter-spacing: 0.04em;">: ${invoice.invoice_number || invoice.bubble_id || '-'}</span>
                </div>
            </div>
        </section>

        ${showSolarSavingsSection ? `
        <section style="padding: 0 50px; margin-bottom: 32px;">
            <div style="border: 1px solid #b7e4c7; border-radius: 14px; background: linear-gradient(135deg, #f0fdf4 0%, #ffffff 52%, #f8fafc 100%); padding: 22px; box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 18px;">
                    <div>
                        <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #047857; margin-bottom: 6px;">Estimated Solar Saving</div>
                        <div style="font-size: 20px; font-weight: 700; color: #0f172a;">${solarSavingsSectionIntro}</div>
                        <div style="margin-top: 6px; font-size: 12px; line-height: 1.6; color: #475569;">${solarSavingsHelperText}</div>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 10px;">
                        <div style="padding: 6px 12px; border-radius: 999px; background: #dcfce7; color: #047857; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;">
                            ${solarSavingsSectionBadge}
                        </div>
                        ${showInteractiveControls && canEstimateSolarSavings ? `
                        <button type="button" onclick="openSolarEstimatePrompt()" style="border: 1px solid #0f172a; border-radius: 999px; background: #ffffff; color: #0f172a; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 10px 16px; cursor: pointer; white-space: nowrap;">
                            Recalculate
                        </button>
                        ` : ''}
                    </div>
                </div>
                <div id="solarEstimateStatus" style="margin-bottom: 14px; border: 1px solid #bfdbfe; border-radius: 12px; background: #eff6ff; padding: 12px 14px; font-size: 12px; line-height: 1.6; color: #1d4ed8;">
                    ${hasSolarSavingsSection
                        ? 'This quotation already has a saved solar estimate.'
                        : 'No saved estimate yet. Use Recalculate to preview this package against your average TNB bill.'}
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px;">
                    <div style="border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff; padding: 16px; min-height: 148px; display: flex; flex-direction: column;">
                        <div style="min-height: 48px; margin-bottom: 12px; display: flex; align-items: flex-start;">
                            <div style="font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #64748b; line-height: 1.5;">Your Average TNB Bill<br>Before Solar</div>
                        </div>
                        <div id="solarEstimateBeforeValue" style="font-size: 28px; font-weight: 700; color: #0f172a; line-height: 1.1; margin-top: auto;">${beforeSolarBill !== null ? `RM ${beforeSolarBill.toFixed(2)}` : 'RM --'}</div>
                    </div>
                    <div style="border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff; padding: 16px; min-height: 148px; display: flex; flex-direction: column;">
                        <div style="min-height: 48px; margin-bottom: 12px; display: flex; align-items: flex-start;">
                            <div style="font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #64748b; line-height: 1.5;">New Bill After Solar<br>After Export Earning</div>
                        </div>
                        <div id="solarEstimateAfterValue" style="font-size: 28px; font-weight: 700; color: #0f172a; line-height: 1.1; margin-top: auto;">${afterSolarBill !== null ? `RM ${afterSolarBill.toFixed(2)}` : 'RM --'}</div>
                    </div>
                    <div style="border: 1px solid #059669; border-radius: 12px; background: #059669; padding: 16px; min-height: 148px; display: flex; flex-direction: column;">
                        <div style="min-height: 48px; margin-bottom: 12px; display: flex; align-items: flex-start;">
                            <div style="font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #d1fae5; line-height: 1.5;">Your Estimated Monthly Total Saving</div>
                        </div>
                        <div id="solarEstimateSavingValue" style="font-size: 28px; font-weight: 700; color: #ffffff; line-height: 1.1; margin-top: auto;">${estimatedMonthlySaving !== null ? `RM ${estimatedMonthlySaving.toFixed(2)}` : 'RM --'}</div>
                    </div>
                </div>
                ${showInteractiveControls && canEstimateSolarSavings ? `
                <div id="solarEstimateSaveHint" style="display: none; margin-top: 14px; font-size: 12px; line-height: 1.6; color: #475569;"></div>
                ` : ''}
                <div style="margin-top: 14px; border: 1px solid #fde68a; border-radius: 12px; background: #fffbeb; padding: 12px 14px;">
                    <div style="font-size: 11px; line-height: 1.6; color: #78350f;">
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
            </div>
        </section>

        <!-- Tiger Neo 3 Promotional Banner -->
        ${hasTigerNeo3 && !isA4Preview ? `
        <a class="promotional-banner no-print" href="${buildTigerNeoPresentationUrl(invoice)}" target="_blank" rel="noopener noreferrer" style="display: block; padding: 0 50px; margin-bottom: 40px; cursor: pointer;">
            <div style="border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.08); transition: transform 0.2s; position: relative;" onmouseover="this.style.transform='translateY(-2px)';" onmouseout="this.style.transform='translateY(0)';">
                <img src="/slide-001.webp" alt="Rise With Tiger Neo 3" style="width: 100%; display: block; object-fit: cover;">
                <div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(to top, rgba(0,0,0,0.7), transparent); padding: 20px 15px 10px; color: white; text-align: right; font-size: 11px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;">
                    Click to view Interactive Proposal <i class='bx bx-right-arrow-alt' style="vertical-align: middle; font-size: 14px;"></i>
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
</body>
</html>
  `;
    return html;
}

module.exports = {
    generateInvoiceHtmlV2
};
