/**
 * HTML Invoice Generator Module
 * Generates HTML for invoice display
 */

/**
 * Generate invoice HTML
 * @param {object} invoice - Invoice object with items
 * @param {object} template - Template data
 * @param {object} options - Generation options
 * @returns {string} HTML content
 */
function generateInvoiceHtml(invoice, template, options = {}) {
  const items = invoice.items || [];
  const templateData = template || {};

  // Calculate totals from items
  const subtotal = parseFloat(invoice.subtotal) || 0;
  const sstAmount = parseFloat(invoice.sst_amount) || 0;
  const discountAmount = parseFloat(invoice.discount_amount) || 0;
  const voucherAmount = parseFloat(invoice.voucher_amount) || 0;
  const totalAmount = parseFloat(invoice.total_amount) || 0;

  // Get company info from template
  const companyName = templateData.company_name || 'Atap Solar';
  const companyAddress = templateData.company_address || '';
  const companyPhone = templateData.company_phone || '';
  const companyEmail = templateData.company_email || '';
  const sstRegNo = templateData.sst_registration_no || '';
  const bankName = templateData.bank_name || '';
  const bankAccountNo = templateData.bank_account_no || '';
  const bankAccountName = templateData.bank_account_name || '';
  const logoUrl = templateData.logo_url || '';
  const terms = templateData.terms_and_conditions || '';
  const disclaimer = templateData.disclaimer || '';

  // Generate items HTML - Mobile optimized without unit price column
  let itemsHtml = '';
  items.forEach((item, index) => {
    const qty = parseFloat(item.qty) || 0;
    const totalPrice = parseFloat(item.total_price) || 0;
    const isDiscount = item.item_type === 'discount';
    const isVoucher = item.item_type === 'voucher';

    const totalClass = (isDiscount || isVoucher) ? 'text-red-600' : 'text-gray-900';

    itemsHtml += `
      <div class="invoice-item py-4 px-2 border-b border-gray-100 last:border-b-0">
        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
          <div class="flex-1">
            <p class="font-semibold text-gray-900 text-base sm:text-[15px] leading-relaxed mb-1">
              ${item.description}
            </p>
            ${!isDiscount && !isVoucher ? `
            <p class="text-xs text-gray-500 font-medium">
              Qty: ${qty.toFixed(2)}
            </p>
            ` : ''}
          </div>
          <div class="text-right sm:text-right mt-1 sm:mt-0">
            <p class="font-bold ${totalClass} text-base sm:text-[15px] whitespace-nowrap">
              ${(isDiscount || isVoucher) ? '-' : ''}RM ${Math.abs(totalPrice).toFixed(2)}
            </p>
          </div>
        </div>
      </div>
    `;
  });

  // Generate HTML - Premium Mobile-Optimized Design
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <title>Invoice ${invoice.invoice_number}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
      color: #111827; 
      -webkit-tap-highlight-color: transparent;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      background-color: #fafafa;
      letter-spacing: -0.01em;
    }
    .invoice-container {
      max-width: 100%;
      margin: 0 auto;
      padding: 20px 16px;
      background-color: #ffffff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }
    @media (min-width: 640px) {
      .invoice-container {
        padding: 32px 24px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
      }
    }
    @media (min-width: 768px) {
      .invoice-container {
        max-width: 720px;
        padding: 48px 40px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
      }
    }
    .section-label {
      font-size: 10px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 10px;
    }
    .invoice-item {
      transition: background-color 0.15s ease;
    }
    .invoice-item:hover {
      background-color: #f9fafb;
    }
    .premium-border {
      border-color: #e5e7eb;
    }
    .premium-divider {
      border-color: #d1d5db;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 10px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-radius: 4px;
    }
    .status-draft {
      background-color: #fef3c7;
      color: #92400e;
      border: 1px solid #fde68a;
    }
    @media print {
      body { 
        background: white;
        padding: 0;
      }
      .invoice-container {
        max-width: 100% !important;
        padding: 0 !important;
        box-shadow: none !important;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    
    <!-- Download PDF Button (only shown in web view, not in PDF mode) -->
    ${!options.forPdf && invoice.share_token ? `
    <div class="mb-6 flex justify-end">
      <a href="/view/${invoice.share_token}/pdf"
         class="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg shadow-md transition-colors no-print">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
        </svg>
        Download PDF
      </a>
    </div>
    ` : ''}
    
    <!-- Header Section -->
    <header class="mb-8 pb-6 border-b premium-divider">
      <div class="flex flex-col gap-6">
        <!-- Company Info -->
        <div>
          ${logoUrl ? `<img src="${logoUrl}" alt="${companyName}" class="h-12 sm:h-14 mb-4 object-contain">` : ''}
          <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight tracking-tight">
            ${companyName}
          </h1>
          <div class="text-sm text-gray-600 leading-relaxed space-y-1">
            ${companyAddress ? `<div class="font-normal whitespace-pre-line">${companyAddress}</div>` : ''}
            ${companyPhone || companyEmail ? `<div class="mt-2 space-y-1">` : ''}
            ${companyPhone ? `<div class="font-medium">Tel: <span class="font-normal">${companyPhone}</span></div>` : ''}
            ${companyEmail ? `<div class="font-medium">Email: <span class="font-normal">${companyEmail}</span></div>` : ''}
            ${companyPhone || companyEmail ? `</div>` : ''}
            ${sstRegNo ? `<div class="mt-2 font-semibold text-gray-900 text-sm">SST Reg No: <span class="font-normal">${sstRegNo}</span></div>` : ''}
          </div>
        </div>
        
        <!-- Invoice Meta -->
        <div class="flex flex-row justify-between items-start pt-4 border-t premium-border sm:border-t-0 sm:pt-0 sm:flex-col sm:items-end sm:gap-4">
          <div class="flex-1 sm:flex-none">
            <p class="section-label mb-1">Invoice Number</p>
            <p class="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">${invoice.invoice_number}</p>
          </div>
          <div class="text-right sm:text-right">
            <p class="section-label mb-1">Date</p>
            <p class="text-base sm:text-lg font-semibold text-gray-900">${invoice.invoice_date}</p>
            ${invoice.due_date ? `<p class="text-sm text-gray-600 mt-1">Due: ${invoice.due_date}</p>` : ''}
            <p class="mt-2">
              <span class="status-badge status-draft">${invoice.status.toUpperCase()}</span>
            </p>
          </div>
        </div>
      </div>
    </header>

    <!-- Bill To Section -->
    <section class="mb-8">
      <p class="section-label">Bill To</p>
      <p class="text-lg sm:text-xl font-bold text-gray-900 mb-2 leading-tight">
        ${invoice.customer_name_snapshot || 'Customer'}
      </p>
      ${invoice.customer_address_snapshot ? `<p class="text-sm text-gray-600 leading-relaxed font-normal whitespace-pre-line">${invoice.customer_address_snapshot}</p>` : ''}
      ${invoice.customer_phone_snapshot ? `<p class="text-sm text-gray-600 mt-1">Tel: ${invoice.customer_phone_snapshot}</p>` : ''}
      ${invoice.customer_email_snapshot ? `<p class="text-sm text-gray-600 mt-1">Email: ${invoice.customer_email_snapshot}</p>` : ''}
    </section>

    <!-- Package Info (if applicable) -->
    ${invoice.package_name_snapshot ? `
    <section class="mb-8 pb-6 border-b premium-divider">
      <p class="section-label">Package Information</p>
      <p class="text-base font-semibold text-gray-900">${invoice.package_name_snapshot}</p>
    </section>
    ` : ''}

    <!-- Items Section -->
    <section class="mb-8">
      <div class="mb-4 pb-2 border-b premium-divider">
        <p class="section-label">Items</p>
      </div>
      <div class="space-y-0">
        ${itemsHtml}
      </div>
    </section>

    <!-- Totals Section -->
    <section class="mb-8">
      <div class="flex flex-col sm:flex-row sm:justify-between gap-6">
        <!-- Totals -->
        <div class="flex-1 space-y-3 sm:max-w-xs">
          <div class="flex justify-between items-center text-sm sm:text-base text-gray-700">
            <span class="font-medium">Subtotal</span>
            <span class="font-semibold text-gray-900">RM ${subtotal.toFixed(2)}</span>
          </div>
          ${discountAmount > 0 ? `
          <div class="flex justify-between items-center text-sm sm:text-base text-red-600">
            <span class="font-medium">Discount</span>
            <span class="font-semibold">-RM ${Math.abs(discountAmount).toFixed(2)}</span>
          </div>
          ` : ''}
          ${voucherAmount > 0 ? `
          <div class="flex justify-between items-center text-sm sm:text-base text-red-600">
            <span class="font-medium">Voucher</span>
            <span class="font-semibold">-RM ${Math.abs(voucherAmount).toFixed(2)}</span>
          </div>
          ` : ''}
          ${sstAmount > 0 ? `
          <div class="flex justify-between items-center text-sm sm:text-base text-gray-700">
            <span class="font-medium">SST (${invoice.sst_rate || 6}%)</span>
            <span class="font-semibold text-gray-900">RM ${sstAmount.toFixed(2)}</span>
          </div>
          ` : ''}
          <div class="flex justify-between items-center pt-4 mt-4 border-t-2 border-gray-900">
            <span class="text-lg font-bold text-gray-900">Total</span>
            <span class="text-xl sm:text-2xl font-bold text-gray-900">RM ${totalAmount.toFixed(2)}</span>
          </div>
        </div>

        <!-- Payment Info -->
        ${bankName ? `
        <div class="flex-1 pt-6 border-t premium-divider sm:border-t-0 sm:pt-0 sm:pl-6 sm:border-l premium-divider">
          <p class="section-label mb-4">Payment Information</p>
          <div class="space-y-3 text-sm sm:text-base">
            <div>
              <span class="text-gray-500 font-medium block mb-1">Bank</span>
              <span class="text-gray-900 font-semibold text-base">${bankName}</span>
            </div>
            ${bankAccountNo ? `
            <div>
              <span class="text-gray-500 font-medium block mb-1">Account Number</span>
              <span class="text-gray-900 font-semibold text-base">${bankAccountNo}</span>
            </div>
            ` : ''}
            ${bankAccountName ? `
            <div>
              <span class="text-gray-500 font-medium block mb-1">Account Holder</span>
              <span class="text-gray-900 font-semibold text-base">${bankAccountName}</span>
            </div>
            ` : ''}
          </div>
        </div>
        ` : ''}
      </div>
    </section>

    <!-- Terms & Conditions -->
    ${terms ? `
    <section class="mb-6 pt-6 border-t premium-divider">
      <h3 class="section-label mb-3">Terms & Conditions</h3>
      <p class="text-[10px] text-gray-600 leading-relaxed whitespace-pre-line">${terms}</p>
    </section>
    ` : ''}

    <!-- Disclaimer -->
    ${disclaimer ? `
    <section class="mb-6 pt-6 border-t premium-divider bg-yellow-50 -mx-4 px-4 py-4 sm:-mx-6 sm:px-6">
      <h3 class="text-xs font-semibold text-yellow-900 mb-2 uppercase tracking-wide">Disclaimer</h3>
      <p class="text-xs text-yellow-800 leading-relaxed">${disclaimer}</p>
    </section>
    ` : ''}

    <!-- Footer -->
    <footer class="mt-8 pt-6 border-t premium-divider text-center">
      <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Official Digital Document</p>
    </footer>
  </div>
</body>
</html>
  `;

  return html;
}

// Alias for backward compatibility
function generateInvoiceHtmlSync(invoice, template, options) {
  return generateInvoiceHtml(invoice, template, options);
}

module.exports = {
  generateInvoiceHtml,
  generateInvoiceHtmlSync
};
