/**
 * HTML Invoice Generator Module
 * Generates HTML for invoice display
 */
const fs = require('fs');
const path = require('path');

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
  const sstAmount = parseFloat(invoice.sst_amount) || 0;
  const totalAmount = parseFloat(invoice.total_amount) || 0;
  const subtotal = totalAmount - sstAmount; // Note: This subtotal includes discounts/vouchers if they were already deducted from totalAmount
  const discountAmount = parseFloat(invoice.discount_amount) || 0;
  const voucherAmount = parseFloat(invoice.voucher_amount) || 0;

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

    // Respect user input: negative values are displayed as negative (red), positive as positive (black/slate)
    const isNegative = totalPrice < 0;
    const priceClass = isNegative ? 'text-red-600' : 'text-gray-900';

    itemsHtml += `
      <div class="invoice-item py-4 px-2 border-b border-gray-100 last:border-b-0">
        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
          <div class="flex-1">
            <p class="font-semibold text-gray-900 text-base sm:text-[15px] leading-relaxed mb-1">
              ${item.description}
            </p>
            ${!isNegative ? `
            <p class="text-xs text-gray-500 font-medium">
              Qty: ${qty.toFixed(2)}
            </p>
            ` : ''}
          </div>
          <div class="text-right sm:text-right mt-1 sm:mt-0">
            <p class="font-bold ${priceClass} text-base sm:text-[15px] whitespace-nowrap">
              ${isNegative ? '-' : ''}RM ${Math.abs(totalPrice).toFixed(2)}
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
  <script src="https://cdn.jsdelivr.net/npm/signature_pad@4.1.7/dist/signature_pad.umd.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
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
            const options = {
              year: 'numeric', 
              month: 'short', 
              day: 'numeric'
            };
            if (showTime) {
              options.hour = '2-digit';
              options.minute = '2-digit';
            }
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
</head>
<body>
  <div class="invoice-container relative">
    
    <!-- Action Buttons (Web View Only) -->
    ${!options.forPdf ? `
    <div class="mb-4 flex flex-wrap justify-end gap-2 no-print">
      ${invoice.share_token ? `
      <button onclick="window.open('/referral-dashboard/${invoice.share_token}', '_blank')"
         class="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded shadow transition-colors">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
        </svg>
        <span>Customer Refer Customer Program</span>
      </button>
      ` : ''}
      ${invoice.linked_seda_registration ? `
      <button onclick="window.open('/seda-register?id=${invoice.linked_seda_registration}', '_blank')"
         class="inline-flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium px-4 py-2 rounded shadow transition-colors">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
        </svg>
        <span>SEDA Form</span>
      </button>
      ` : ''}
      ${(invoice.share_token || invoice.bubble_id) && invoice.customer_name && invoice.customer_name !== 'Sample Quotation' ? `
      <button onclick="viewProposal('${invoice.share_token || invoice.bubble_id}')"
         class="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded shadow transition-colors">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
        </svg>
        <span>View Proposal</span>
      </button>
      ` : ''}
      ${(invoice.share_token || invoice.bubble_id) ? `
      <button onclick="downloadInvoicePdf('${invoice.share_token || invoice.bubble_id}')"
         class="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-4 py-2 rounded shadow transition-colors">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
        </svg>
        <span id="pdfButtonText">Download PDF</span>
      </button>
      ` : ''}
    </div>
    ` : ''}

    ${!options.forPdf ? `
    <!-- Signature Modal -->
    <div id="signatureModal" class="fixed inset-0 z-[100] hidden bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4" onclick="if(event.target === this) closeSignatureModal()">
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
      function resetSignature() {
        Swal.fire({
          title: 'Re-sign Quotation?',
          text: "This will clear the current signature and allow you to sign again.",
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#0f172a',
          cancelButtonColor: '#f1f5f9',
          confirmButtonText: 'Yes, Re-sign',
          cancelButtonText: 'Cancel',
          customClass: {
            cancelButton: 'text-slate-600'
          }
        }).then((result) => {
          if (result.isConfirmed) {
            openSignatureModal();
          }
        });
      }

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
          btn.innerHTML = '<svg class="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Saving...';

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
            <span class="font-medium text-slate-900">
              <span class="local-time" data-iso="${(() => { try { return new Date(invoice.invoice_date).toISOString(); } catch (e) { return ''; } })()}" data-show-time="false">${invoice.invoice_date || '-'}</span>
            </span>
          </div>
          ${invoice.due_date ? `
          <div>
            <span class="label-text block">Due Date</span>
            <span class="font-medium text-slate-900">
              <span class="local-time" data-iso="${(() => { try { return new Date(invoice.due_date).toISOString(); } catch (e) { return ''; } })()}" data-show-time="false">${invoice.due_date || '-'}</span>
            </span>
          </div>` : ''}
        </div>
      </div>
    </header>

    <div class="divider"></div>

    <!-- Bill To -->
    <section class="mb-6 flex gap-6 items-start">
      <div class="flex-1">
        <p class="label-text mb-1">Bill To</p>
        <p class="text-lg font-bold text-slate-900 leading-none mb-1">
          ${invoice.customer_name || 'Valued Customer'}
        </p>
        ${(invoice.customer_address) ? `<p class="text-xs text-slate-600 whitespace-pre-line leading-relaxed mb-1">${invoice.customer_address}</p>` : ''}
        <div class="text-xs text-slate-500">
          ${(invoice.customer_phone) ? `<span class="mr-3">Tel: ${invoice.customer_phone}</span>` : ''}
          ${(invoice.customer_email) ? `<span>${invoice.customer_email}</span>` : ''}
        </div>
      </div>
      ${(invoice.profile_picture) ? `
      <div class="flex-shrink-0">
        <img src="${invoice.profile_picture}" alt="Customer Profile" class="w-16 h-16 rounded-lg object-cover border border-slate-200 shadow-sm">
      </div>
      ` : ''}
    </section>

    <!-- Line Items -->
    <section class="mb-6">
      <div class="bg-slate-50 rounded-t-lg border-b border-slate-200 px-3 py-2 flex text-[10px] font-bold text-slate-500 uppercase tracking-wider">
        <div class="flex-1">Description</div>
        <div class="text-right w-24">Amount</div>
      </div>
      <div class="divide-y divide-slate-100 border-b border-slate-100">
        ${items.map(item => {
    const val = parseFloat(item.total_price) || 0;
    // Check if value is negative to apply styling, regardless of item_type
    const isNegative = val < 0;
    const priceClass = isNegative ? 'text-red-600' : 'text-slate-900';

    return `
          <div class="px-3 py-3 flex gap-3 items-start">
            <div class="flex-1">
              <p class="text-sm font-medium text-slate-900 leading-snug">${item.description ? item.description.replace(/\n/g, '<br>') : ''}</p>
              ${!isNegative && item.qty ? `<p class="text-[10px] text-slate-400 mt-0.5">Qty: ${parseFloat(item.qty)}</p>` : ''}
            </div>
            <div class="text-right w-24">
              <p class="text-sm font-semibold ${priceClass}">${isNegative ? '-' : ''}RM ${Math.abs(val).toFixed(2)}</p>
            </div>
          </div>
          `;
  }).join('')}
      </div>
    </section>

    <!-- Warranties -->
    ${invoice.warranties && invoice.warranties.length > 0 ? `
    <section class="mb-6 avoid-break">
       <div class="bg-slate-50 rounded-t-lg border-b border-slate-200 px-3 py-2 flex text-[10px] font-bold text-slate-500 uppercase tracking-wider">
         Product Warranties
       </div>
       <div class="border border-t-0 border-slate-100 rounded-b-lg p-4 bg-white">
         <div class="space-y-3">
           ${invoice.warranties.map(w => `
             <div class="flex flex-col sm:flex-row gap-1 sm:gap-4 sm:items-start text-sm">
               <div class="sm:w-1/3 font-medium text-slate-700">${w.name || 'Product'}</div>
               <div class="flex-1 text-slate-500 text-xs whitespace-pre-line leading-relaxed">${w.terms || ''}</div>
             </div>
           `).join('<div class="border-t border-slate-50 my-2"></div>')}
         </div>
       </div>
    </section>
    ` : ''}

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
            <span>SST (6%)</span>
            <span>RM ${sstAmount.toFixed(2)}</span>
          </div>` : ''}
          <div class="border-t border-slate-900 pt-3 mt-1 flex justify-between items-end">
            <span class="font-bold text-slate-900">Total</span>
            <span class="text-2xl font-bold text-slate-900 leading-none">RM ${totalAmount.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>

    ${terms ? `
    <section class="mb-4 pt-4 border-t border-slate-200">
      <p class="label-text mb-1">Terms & Conditions</p>
      <div class="terms-text">
        ${terms.replace(/\n/g, '<br>')}
      </div>
    </section>
    ` : ''}

    <!-- Sign Button Below TNC (Mobile optimized center alignment) -->
    ${(!options.forPdf && (!invoice.customer_signature || invoice.customer_signature.trim() === '')) ? `
    <div class="mt-8 flex justify-center no-print">
      <button onclick="openSignatureModal()"
         class="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-base font-bold px-8 py-4 rounded-xl shadow-xl transform transition-all active:scale-95">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
        </svg>
        <span>Sign this Quotation</span>
      </button>
    </div>
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
        <div class="flex flex-col sm:flex-row justify-between items-end gap-6">
          <div class="max-w-xs">
            <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Read, Agreed, Signed by</p>
            <div class="h-24 flex items-center mb-2 relative group">
                <img src="${sigUrl}" alt="Customer Signature" class="max-h-full object-contain">
                ${!options.forPdf ? `
                <button onclick="resetSignature()" class="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 bg-white shadow-sm border border-slate-200 text-slate-600 hover:text-red-600 p-1.5 rounded-lg transition-all no-print" title="Re-sign">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                  </svg>
                </button>
                ` : ''}
            </div>
            <div class="border-t border-slate-400 pt-2">
                <p class="text-xs font-bold text-slate-900 uppercase">${invoice.customer_name || 'Customer'}</p>
                <p class="text-[10px] text-slate-500">${invoice.customer_phone || ''} ${(invoice.customer_email) ? '• ' + (invoice.customer_email) : ''}</p>
                ${invoice.signature_date ? `<p class="text-[9px] text-slate-400 mt-1 uppercase">Signed on <span class="local-time" data-iso="${(() => { try { return new Date(invoice.signature_date).toISOString(); } catch (e) { return ''; } })()}" data-show-time="true">${invoice.signature_date}</span></p>` : ''}
            </div>
          </div>
          
          ${!options.forPdf ? `
          <div class="no-print">
            <button onclick="resetSignature()" class="text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest flex items-center gap-2 transition-colors">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
              </svg>
              Re-sign Quotation
            </button>
          </div>
          ` : ''}
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

/**
 * Generate proposal HTML using the portable-proposal template
 * @param {object} invoice - Invoice object with items
 * @param {object} options - Generation options
 * @returns {string} HTML content
 */
function generateProposalHtml(invoice, options = {}) {
  const proposalTemplatePath = path.join(__dirname, '../../../../portable-proposal/index.html');
  if (!fs.existsSync(proposalTemplatePath)) {
    console.error('[HTML Generator] Proposal template not found at:', proposalTemplatePath);
    return 'Proposal template not found';
  }

  let html = fs.readFileSync(proposalTemplatePath, 'utf8');
  const templateData = invoice.template || {};

  // Replaces placeholders in the HTML
  const replacements = {
    '{{PROPOSAL_URL}}': `/proposal/${invoice.share_token}`,
    '{{COMPANY_NAME}}': templateData.company_name || 'Atap Solar',
    '{{COMPANY_ADDRESS}}': templateData.company_address || '',
    '{{COMPANY_PHONE}}': templateData.company_phone || '',
    '{{COMPANY_EMAIL}}': templateData.company_email || '',
    '{{INVOICE_NUMBER}}': invoice.invoice_number || '',
    '{{INVOICE_STATUS}}': invoice.status || '',
    '{{INVOICE_DATE}}': invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' }) : '',
    '{{CUSTOMER_NAME}}': invoice.customer_name || 'Valued Customer',
    '{{CUSTOMER_ADDRESS}}': invoice.customer_address || '',
    '{{CUSTOMER_PHONE}}': invoice.customer_phone || '',
    '{{CUSTOMER_EMAIL}}': invoice.customer_email || '',
    '{{CUSTOMER_IMAGE}}': invoice.profile_picture || '',
    '{{SUBTOTAL}}': (parseFloat(invoice.subtotal) || 0).toFixed(2),
    '{{SST_RATE}}': '6',
    '{{SST_AMOUNT}}': (parseFloat(invoice.sst_amount) || 0).toFixed(2),
    '{{TOTAL_AMOUNT}}': (parseFloat(invoice.total_amount) || 0).toFixed(2),
    '{{BANK_NAME}}': templateData.bank_name || '',
    '{{BANK_ACCOUNT}}': templateData.bank_account_no || '',
    '{{BANK_ACCOUNT_NAME}}': templateData.bank_account_name || '',
    '{{CREATED_BY}}': invoice.created_by_user_name || 'System',
    '{{TERMS_AND_CONDITIONS}}': (templateData.terms_and_conditions || '').replace(/\n/g, '<br>')
  };

  // Generate Items HTML
  let itemsHtml = '';
  (invoice.items || []).forEach(item => {
    const val = parseFloat(item.total_price) || 0;
    const isNegative = val < 0;
    const priceClass = isNegative ? 'text-red-600' : 'text-slate-900';

    itemsHtml += `
      <div class="px-3 py-3 flex gap-3 items-start">
        <div class="flex-1">
          <p class="text-sm font-medium text-slate-900 leading-snug">${item.description ? item.description.replace(/\n/g, '<br>') : ''}</p>
          ${!isNegative && item.qty ? `<p class="text-[10px] text-slate-400 mt-0.5">Qty: ${parseFloat(item.qty)}</p>` : ''}
        </div>
        <div class="text-right w-24">
          <p class="text-sm font-semibold ${priceClass}">${isNegative ? '-' : ''}RM ${Math.abs(val).toFixed(2)}</p>
        </div>
      </div>
    `;
  });
  replacements['{{INVOICE_ITEMS}}'] = itemsHtml;

  // Perform basic placeholder replacements
  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(key).join(value);
  }

  // Perform JS variable replacements
  let customerImage = invoice.profile_picture || '';
  if (customerImage.startsWith('//')) customerImage = 'https:' + customerImage;

  html = html.replace(/var CUSTOMER_NAME\s*=\s*".*";/, `var CUSTOMER_NAME    = "${(invoice.customer_name || 'Valued Customer').replace(/"/g, '\\"')}";`);
  html = html.replace(/var CUSTOMER_ADDRESS\s*=\s*".*";/, `var CUSTOMER_ADDRESS = "${(invoice.customer_address || '').replace(/\n/g, ', ').replace(/"/g, '\\"')}";`);
  html = html.replace(/var CUSTOMER_IMAGE\s*=\s*".*";/, `var CUSTOMER_IMAGE   = "${customerImage.replace(/"/g, '\\"')}";`);

  const systemSizeStr = invoice.system_size_kwp ? `${invoice.system_size_kwp.toFixed(2)} kWp System` : 'Solar System';
  html = html.replace(/var SYSTEM_SIZE\s*=\s*".*";/, `var SYSTEM_SIZE      = "${systemSizeStr}";`);

  if (invoice.customer_signature) {
    let sigUrl = invoice.customer_signature;
    if (sigUrl.startsWith('//')) sigUrl = 'https:' + sigUrl;
    html = html.replace(/var CUSTOMER_SIGNATURE\s*=\s*".*";/, `var CUSTOMER_SIGNATURE   = "${sigUrl.replace(/"/g, '\\"')}";`);
  }
  if (invoice.signature_date) {
    html = html.replace(/var SIGNATURE_DATE\s*=\s*".*";/, `var SIGNATURE_DATE       = "${invoice.signature_date}";`);
  }

  // Also replace the {{CUSTOMER_IMAGE}} placeholder in the HTML
  html = html.split('{{CUSTOMER_IMAGE}}').join(customerImage);

  return html;
}

// Alias for backward compatibility
function generateInvoiceHtmlSync(invoice, template, options) {
  return generateInvoiceHtml(invoice, template, options);
}

module.exports = {
  generateInvoiceHtml,
  generateInvoiceHtmlSync,
  generateProposalHtml
};
