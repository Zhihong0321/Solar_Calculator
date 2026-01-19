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
  // Debug: Check share_token value
  if (invoice.share_token) {
    console.log('[HTML Generator] share_token type:', typeof invoice.share_token);
    console.log('[HTML Generator] share_token length:', invoice.share_token.length);
    console.log('[HTML Generator] share_token value:', invoice.share_token.substring(0, 30) + '...');
  }
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
  // Use the specific requested logo
  const displayLogoUrl = '/logo-08.png';
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <title>Quotation ${invoice.invoice_number}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', 'sans-serif'],
          },
          colors: {
            brand: {
              50: '#f8fafc',
              100: '#f1f5f9',
              800: '#1e293b',
              900: '#0f172a',
            }
          }
        }
      }
    }
  </script>
  <style>
    body { 
      font-family: 'Inter', sans-serif; 
      color: #0f172a; 
      -webkit-font-smoothing: antialiased;
      background-color: #f1f5f9;
    }
    .invoice-container {
      max-width: 100%;
      margin: 0 auto;
      background-color: #ffffff;
      /* Reduced padding as requested for mobile optimization */
      padding: 16px 12px; 
    }
    @media (min-width: 640px) {
      .invoice-container {
        max-width: 720px;
        padding: 40px;
        margin: 20px auto;
        box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.1);
        border-radius: 8px;
      }
    }
    .label-text {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      font-weight: 600;
      margin-bottom: 2px;
    }
    .data-text {
      font-size: 14px;
      color: #0f172a;
      font-weight: 500;
    }
    /* Terms text specifically targeted for readable fine print */
    .terms-text {
      font-size: 8px !important; 
      line-height: 1.15;
      color: #64748b;
      text-align: justify;
    }
    .divider {
      border-bottom: 1px solid #e2e8f0;
      margin: 16px 0;
    }
    /* Print optimizations */
    @media print {
      body { background: white; }
      .invoice-container {
        padding: 0;
        margin: 0;
        box-shadow: none;
        max-width: 100%;
      }
      .no-print { display: none !important; }
      .terms-text { font-size: 6px !important; } /* Force print size */
    }
  </style>
</head>
<body>
  <div class="invoice-container relative">
    
    <!-- Action Buttons (Web View Only) -->
    ${!options.forPdf && invoice.share_token ? `
    <div class="mb-4 flex justify-end gap-2 no-print">
      ${invoice.linked_seda_registration ? `
      <button onclick="window.open('/seda-register?id=${invoice.linked_seda_registration}', '_blank')"
         class="inline-flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium px-4 py-2 rounded shadow transition-colors">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
        </svg>
        <span>SEDA Form</span>
      </button>
      ` : ''}
      <button onclick="viewProposal('${invoice.share_token}')"
         class="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded shadow transition-colors">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
        </svg>
        <span>View Proposal</span>
      </button>
      <button onclick="downloadInvoicePdf('${invoice.share_token}')"
         class="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-4 py-2 rounded shadow transition-colors">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
        </svg>
        <span id="pdfButtonText">Download PDF</span>
      </button>
    </div>
    ` : ''}

    ${!options.forPdf ? `
    <script>
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
    </script>
    ` : ''}
    
    <!-- Header -->
    <header class="flex flex-col gap-4 mb-6">
      <div class="flex justify-between items-start">
        <img src="${displayLogoUrl}" alt="${companyName}" class="h-16 object-contain">
        <div class="text-right">
          <h1 class="text-2xl font-bold text-slate-900 tracking-tight">QUOTATION</h1>
          <p class="text-sm font-medium text-slate-500">#${invoice.invoice_number}</p>
          <div class="mt-1 inline-block px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-bold text-slate-700 uppercase tracking-wide">
            ${invoice.status}
          </div>
        </div>
      </div>
      
      <div class="flex flex-col sm:flex-row justify-between gap-4 text-sm text-slate-600 mt-2">
        <!-- From -->
        <div>
           <p class="font-bold text-slate-900">${companyName}</p>
           ${companyAddress ? `<p class="whitespace-pre-line text-xs leading-relaxed">${companyAddress}</p>` : ''}
           <div class="mt-1 text-xs">
             ${companyPhone ? `<span>Tel: ${companyPhone}</span><br>` : ''}
             ${companyEmail ? `<span>Email: ${companyEmail}</span>` : ''}
           </div>
        </div>
        <!-- Dates -->
        <div class="sm:text-right flex flex-col sm:items-end gap-1">
          <div>
            <span class="label-text block">Date Issued</span>
            <span class="font-medium text-slate-900">${invoice.invoice_date}</span>
          </div>
          ${invoice.due_date ? `
          <div>
            <span class="label-text block">Due Date</span>
            <span class="font-medium text-slate-900">${invoice.due_date}</span>
          </div>` : ''}
        </div>
      </div>
    </header>

    <div class="divider"></div>

    <!-- Bill To -->
    <section class="mb-6">
      <p class="label-text mb-1">Bill To</p>
      <p class="text-lg font-bold text-slate-900 leading-none mb-1">
        ${invoice.customer_name_snapshot || 'Valued Customer'}
      </p>
      ${invoice.customer_address_snapshot ? `<p class="text-xs text-slate-600 whitespace-pre-line leading-relaxed mb-1">${invoice.customer_address_snapshot}</p>` : ''}
      <div class="text-xs text-slate-500">
        ${invoice.customer_phone_snapshot ? `<span class="mr-3">Tel: ${invoice.customer_phone_snapshot}</span>` : ''}
        ${invoice.customer_email_snapshot ? `<span>${invoice.customer_email_snapshot}</span>` : ''}
      </div>
    </section>

    <!-- Line Items -->
    <section class="mb-6">
      <div class="bg-slate-50 rounded-t-lg border-b border-slate-200 px-3 py-2 flex text-[10px] font-bold text-slate-500 uppercase tracking-wider">
        <div class="flex-1">Description</div>
        <div class="text-right w-24">Amount</div>
      </div>
      <div class="divide-y divide-slate-100 border-b border-slate-100">
        ${items.map(item => {
          const isDiscount = item.item_type === 'discount' || item.item_type === 'voucher';
          const priceClass = isDiscount ? 'text-red-600' : 'text-slate-900';
          return `
          <div class="px-3 py-3 flex gap-3 items-start">
            <div class="flex-1">
              <p class="text-sm font-medium text-slate-900 leading-snug">${item.description}</p>
              ${!isDiscount && item.qty ? `<p class="text-[10px] text-slate-400 mt-0.5">Qty: ${parseFloat(item.qty)}</p>` : ''}
            </div>
            <div class="text-right w-24">
              <p class="text-sm font-semibold ${priceClass}">${isDiscount ? '-' : ''}RM ${Math.abs(parseFloat(item.total_price)).toFixed(2)}</p>
            </div>
          </div>
          `;
        }).join('')}
      </div>
    </section>

    <!-- Summary & Payment -->
    <div class="flex flex-col sm:flex-row gap-8 mb-8">
      
      <!-- Payment Details (Left on Desktop, Bottom on Mobile) -->
      <div class="flex-1 order-2 sm:order-1">
        ${bankName ? `
        <div class="bg-slate-50 p-4 rounded-lg border border-slate-100">
          <p class="label-text mb-2">Payment Details</p>
          <div class="space-y-1">
            <div class="flex justify-between text-xs">
              <span class="text-slate-500">Bank</span>
              <span class="font-medium text-slate-900 text-right">${bankName}</span>
            </div>
            ${bankAccountNo ? `
            <div class="flex justify-between text-xs">
              <span class="text-slate-500">Account No.</span>
              <span class="font-medium text-slate-900 text-right">${bankAccountNo}</span>
            </div>` : ''}
             ${bankAccountName ? `
            <div class="flex justify-between text-xs">
              <span class="text-slate-500">Account Name</span>
              <span class="font-medium text-slate-900 text-right">${bankAccountName}</span>
            </div>` : ''}
          </div>
        </div>
        ` : ''}
      </div>

      <!-- Totals (Right on Desktop, Top on Mobile) -->
      <div class="flex-1 sm:max-w-xs order-1 sm:order-2">
        <div class="space-y-2 text-sm">
          <div class="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span>RM ${subtotal.toFixed(2)}</span>
          </div>
          ${discountAmount > 0 ? `
          <div class="flex justify-between text-red-600">
            <span>Discount</span>
            <span>-RM ${Math.abs(discountAmount).toFixed(2)}</span>
          </div>` : ''}
           ${voucherAmount > 0 ? `
          <div class="flex justify-between text-red-600">
            <span>Voucher</span>
            <span>-RM ${Math.abs(voucherAmount).toFixed(2)}</span>
          </div>` : ''}
          ${sstAmount > 0 ? `
          <div class="flex justify-between text-slate-600">
            <span>SST (${invoice.sst_rate || 6}%)</span>
            <span>RM ${sstAmount.toFixed(2)}</span>
          </div>` : ''}
          <div class="border-t border-slate-900 pt-3 mt-1 flex justify-between items-end">
            <span class="font-bold text-slate-900">Total</span>
            <span class="text-2xl font-bold text-slate-900 leading-none">RM ${totalAmount.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Terms (40% smaller request applied here: text-[6px]) -->
    ${terms ? `
    <section class="mb-4 pt-4 border-t border-slate-200">
      <p class="label-text mb-1">Terms & Conditions</p>
      <div class="terms-text">
        ${terms.replace(/\n/g, '<br>')}
      </div>
    </section>
    ` : ''}

    <!-- Created By -->
    <div class="text-right text-xs text-slate-400 mb-8">
      Quotation Created by: <span class="font-medium text-slate-600">${invoice.created_by_user_name || 'System'}</span>
    </div>

    <!-- Signature Section -->
    ${(() => {
      if (!invoice.customer_signature) return '';
      
      let sigUrl = invoice.customer_signature;
      if (sigUrl.startsWith('//')) sigUrl = 'https:' + sigUrl;
      
      return `
      <section class="mt-12 pt-8 border-t border-slate-200">
        <div class="max-w-xs">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Read, Agreed, Signed by</p>
          <div class="h-24 flex items-center mb-2">
              <img src="${sigUrl}" alt="Customer Signature" class="max-h-full object-contain">
          </div>
          <div class="border-t border-slate-400 pt-2">
              <p class="text-xs font-bold text-slate-900 uppercase">${invoice.customer_name_snapshot || 'Customer'}</p>
              <p class="text-[10px] text-slate-500">${invoice.customer_phone_snapshot || ''} ${invoice.customer_email_snapshot ? '• ' + invoice.customer_email_snapshot : ''}</p>
              ${invoice.signature_date ? `<p class="text-[9px] text-slate-400 mt-1 uppercase">Signed on ${new Date(invoice.signature_date).toLocaleDateString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>` : ''}
          </div>
        </div>
      </section>
      `;
    })()}

    <!-- Footer -->
    <footer class="mt-12 text-center">
      <p class="text-[8px] text-slate-400 uppercase tracking-widest">Thank you for your business</p>
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
