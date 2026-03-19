// invoiceHtmlGeneratorV2.js

function generateInvoiceHtmlV2(invoice, template, options = {}) {
    const items = invoice.items || [];
    const templateData = template || {};

    // Calculate totals from items
    const sstAmount = parseFloat(invoice.sst_amount) || 0;
    const totalAmount = parseFloat(invoice.total_amount) || 0;
    const discountAmount = parseFloat(invoice.discount_amount) || 0;
    const voucherAmount = parseFloat(invoice.voucher_amount) || 0;
    const cnyPromoAmount = parseFloat(invoice.cny_promo_amount) || 0;
    const holidayBoostAmount = parseFloat(invoice.holiday_boost_amount) || 0;

    // Calculate pre-discount subtotal for the summary
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
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Responsive Invoice Template</title>
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

.invoice-container {
    background-color: #ffffff;
    max-width: 820px;
    width: 100%;
    box-shadow: 0 15px 40px rgba(0, 0, 0, 0.08);
    position: relative;
    padding-bottom: 30px;
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

.btn-seda { color: #f97316; border: 1px solid #f97316; }
.btn-seda:hover { background: #f97316; color: #fff; }

.btn-pdf { color: #334155; border: 1px solid #334155; }
.btn-pdf:hover { background: #334155; color: #fff; }

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
    body { background: white; padding: 0; }
    .invoice-container {
        padding: 0;
        margin: 0;
        box-shadow: none;
        max-width: 100%;
    }
    .no-print { display: none !important; }
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
<body>
    ${!options.forPdf ? `
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
          
          const response = await fetch('/view2/' + identifier + '/signature', {
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
          const response = await fetch('/view2/' + shareToken + '/pdf');
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
                <h1>INVOICE</h1>
                ${!options.forPdf ? `
                <div class="invoice-actions no-print">
                  ${invoice.share_token ? `
                  <button onclick="window.open('/referral-dashboard/${invoice.share_token}', '_blank')" class="action-btn btn-referral">
                    <span>Customer Refer Program</span>
                  </button>
                  ` : ''}
                  ${invoice.linked_seda_registration ? `
                  <button onclick="window.open('/seda-register?id=${invoice.linked_seda_registration}', '_blank')" class="action-btn btn-seda">
                    <span>SEDA Form</span>
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
                    <span class="meta-label">Invoice Date</span>
                    <span class="meta-value">: ${invoice.invoice_date || '-'}</span>
                </div>
                ${invoice.due_date ? `
                <div class="meta-row">
                    <span class="meta-label">Due Date</span>
                    <span class="meta-value">: ${invoice.due_date}</span>
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
            </div>
        </section>

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
        <section class="promotional-banner no-print" style="padding: 0 50px; margin-bottom: 40px; cursor: pointer;" onclick="window.location.href = 'https://tiger-neo-3-production.up.railway.app/index.html?return=' + encodeURIComponent(window.location.href);">
            <div style="border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.08); transition: transform 0.2s; position: relative;" onmouseover="this.style.transform='translateY(-2px)';" onmouseout="this.style.transform='translateY(0)';">
                <img src="/slide-001.webp" alt="Rise With Tiger Neo 3" style="width: 100%; display: block; object-fit: cover;">
                <div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(to top, rgba(0,0,0,0.7), transparent); padding: 20px 15px 10px; color: white; text-align: right; font-size: 11px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;">
                    Click to view Interactive Proposal <i class='bx bx-right-arrow-alt' style="vertical-align: middle; font-size: 14px;"></i>
                </div>
            </div>
        </section>

        <!-- Terms & Signature -->
        <section class="terms-signature">
            <div class="terms">
                <h3>Terms & Conditions</h3>
                <p style="white-space: pre-line;">${templateData.terms_and_conditions || ''}</p>
            </div>
            <div class="signature">
                ${invoice.customer_signature ? `
                <div class="signature-image">
                    <img src="${invoice.customer_signature.startsWith('//') ? 'https:' + invoice.customer_signature : invoice.customer_signature}" alt="Signature">
                </div>
                ` : ''}
                ${(!options.forPdf && (!invoice.customer_signature || invoice.customer_signature.trim() === '')) ? `
                <div class="no-print" style="margin-bottom: 10px;">
                    <button onclick="openSignatureModal()" class="px-4 py-2 bg-emerald-600 text-white rounded font-bold shadow hover:bg-emerald-700 w-full">Sign this Quotation</button>
                </div>
                ` : ''}
                <h4>${invoice.customer_name || 'Customer'}</h4>
                ${invoice.signature_date ? `<p style="font-size: 10px; margin-top: 4px;">Signed on ${invoice.signature_date}</p>` : ''}
            </div>
        </section>

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
