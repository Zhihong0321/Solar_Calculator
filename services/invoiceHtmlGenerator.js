/**
 * HTML Invoice Generator Module
 * Generates HTML for invoice display
 */

/**
 * Generate invoice HTML
 * @param {object} invoice - Invoice object with items
 * @param {object} template - Template data
 * @returns {string} HTML content
 */
function generateInvoiceHtml(invoice, template) {
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

  // Generate items HTML
  let itemsHtml = '';
  items.forEach((item, index) => {
    const qty = parseFloat(item.qty) || 0;
    const unitPrice = parseFloat(item.unit_price) || 0;
    const totalPrice = parseFloat(item.total_price) || 0;
    const isDiscount = item.item_type === 'discount';
    const isVoucher = item.item_type === 'voucher';
    const isEpp = item.item_type === 'epp_fee';

    const totalClass = (isDiscount || isVoucher) ? 'text-red-600' : '';

    itemsHtml += `
      <tr class="${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}">
        <td class="py-3 px-4 border-b border-gray-200 text-sm align-top">
          ${item.description}
        </td>
        <td class="py-3 px-4 border-b border-gray-200 text-sm text-right align-top">
          ${isDiscount || isVoucher ? '-' : qty.toFixed(2)}
        </td>
        <td class="py-3 px-4 border-b border-gray-200 text-sm text-right align-top">
          ${isDiscount || isVoucher ? '' : 'RM ' + unitPrice.toFixed(2)}
        </td>
        <td class="py-3 px-4 border-b border-gray-200 text-sm text-right align-top ${totalClass}">
          RM ${Math.abs(totalPrice).toFixed(2)}
        </td>
      </tr>
    `;
  });

  // Generate HTML
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${invoice.invoice_number}</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen py-8 px-4">
  <div class="max-w-4xl mx-auto bg-white shadow-lg rounded-lg">
    <!-- Header -->
    <div class="p-6 border-b-2 border-gray-800">
      <div class="flex justify-between items-start">
        <div>
          ${logoUrl ? `<img src="${logoUrl}" alt="${companyName}" class="h-16 mb-4">` : ''}
          <h1 class="text-3xl font-bold text-gray-900">${companyName}</h1>
          <p class="text-gray-600 mt-2 whitespace-pre-line">${companyAddress}</p>
          ${companyPhone ? `<p class="text-gray-600 mt-1">Tel: ${companyPhone}</p>` : ''}
          ${companyEmail ? `<p class="text-gray-600 mt-1">Email: ${companyEmail}</p>` : ''}
          ${sstRegNo ? `<p class="text-gray-600 mt-1">SST Reg No: ${sstRegNo}</p>` : ''}
        </div>
        <div class="text-right">
          <h2 class="text-2xl font-bold text-gray-900">INVOICE</h2>
          <p class="text-gray-600 mt-2">
            <strong>Invoice No:</strong> ${invoice.invoice_number}<br>
            <strong>Date:</strong> ${invoice.invoice_date}<br>
            ${invoice.due_date ? `<strong>Due Date:</strong> ${invoice.due_date}<br>` : ''}
            <strong>Status:</strong> <span class="inline-block px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded">${invoice.status.toUpperCase()}</span>
          </p>
        </div>
      </div>
    </div>

    <!-- Customer Info -->
    <div class="p-6 border-b border-gray-200">
      <h3 class="text-lg font-semibold text-gray-900 mb-3">Bill To</h3>
      <p class="text-gray-700 font-medium">${invoice.customer_name_snapshot || 'Customer'}</p>
      ${invoice.customer_address_snapshot ? `<p class="text-gray-600 mt-2 whitespace-pre-line">${invoice.customer_address_snapshot}</p>` : ''}
      ${invoice.customer_phone_snapshot ? `<p class="text-gray-600 mt-1">Tel: ${invoice.customer_phone_snapshot}</p>` : ''}
      ${invoice.customer_email_snapshot ? `<p class="text-gray-600 mt-1">Email: ${invoice.customer_email_snapshot}</p>` : ''}
    </div>

    <!-- Package Info (if applicable) -->
    ${invoice.package_name_snapshot ? `
    <div class="p-6 border-b border-gray-200 bg-gray-50">
      <h3 class="text-lg font-semibold text-gray-900 mb-3">Package Information</h3>
      <p class="text-gray-700"><strong>Package:</strong> ${invoice.package_name_snapshot}</p>
    </div>
    ` : ''}

    <!-- Items Table -->
    <div class="p-6">
      <table class="w-full">
        <thead>
          <tr class="bg-gray-800 text-white">
            <th class="py-3 px-4 text-left text-sm font-semibold">Description</th>
            <th class="py-3 px-4 text-right text-sm font-semibold">Qty</th>
            <th class="py-3 px-4 text-right text-sm font-semibold">Unit Price</th>
            <th class="py-3 px-4 text-right text-sm font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
    </div>

    <!-- Totals -->
    <div class="p-6 border-t-2 border-gray-800">
      <div class="flex justify-end">
        <div class="w-64">
          <div class="flex justify-between py-2">
            <span class="text-gray-600">Subtotal:</span>
            <span class="font-semibold">RM ${subtotal.toFixed(2)}</span>
          </div>
          ${discountAmount > 0 ? `
          <div class="flex justify-between py-2 text-red-600">
            <span>Discount:</span>
            <span class="font-semibold">-RM ${Math.abs(discountAmount).toFixed(2)}</span>
          </div>
          ` : ''}
          ${voucherAmount > 0 ? `
          <div class="flex justify-between py-2 text-red-600">
            <span>Voucher:</span>
            <span class="font-semibold">-RM ${Math.abs(voucherAmount).toFixed(2)}</span>
          </div>
          ` : ''}
          ${sstAmount > 0 ? `
          <div class="flex justify-between py-2">
            <span>SST (${invoice.sst_rate || 6}%):</span>
            <span class="font-semibold">RM ${sstAmount.toFixed(2)}</span>
          </div>
          ` : ''}
          <div class="flex justify-between py-3 border-t-2 border-gray-800 text-xl">
            <span class="font-bold text-gray-900">Total:</span>
            <span class="font-bold text-gray-900">RM ${totalAmount.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Bank Info -->
    ${bankName ? `
    <div class="p-6 border-t border-gray-200 bg-gray-50">
      <h3 class="text-lg font-semibold text-gray-900 mb-3">Bank Details</h3>
      <p class="text-gray-700"><strong>Bank:</strong> ${bankName}</p>
      ${bankAccountNo ? `<p class="text-gray-700"><strong>Account No:</strong> ${bankAccountNo}</p>` : ''}
      ${bankAccountName ? `<p class="text-gray-700"><strong>Account Name:</strong> ${bankAccountName}</p>` : ''}
    </div>
    ` : ''}

    <!-- Terms & Conditions -->
    ${terms ? `
    <div class="p-6 border-t border-gray-200">
      <h3 class="text-lg font-semibold text-gray-900 mb-3">Terms & Conditions</h3>
      <p class="text-gray-600 text-sm whitespace-pre-line">${terms}</p>
    </div>
    ` : ''}

    <!-- Disclaimer -->
    ${disclaimer ? `
    <div class="p-6 border-t border-gray-200 bg-yellow-50">
      <h3 class="text-lg font-semibold text-yellow-900 mb-3">Disclaimer</h3>
      <p class="text-yellow-800 text-sm">${disclaimer}</p>
    </div>
    ` : ''}
  </div>

  <div class="max-w-4xl mx-auto mt-8 text-center text-gray-500 text-sm">
    Generated by Atap Solar Invoice System
  </div>
</body>
</html>
  `;

  return html;
}

module.exports = {
  generateInvoiceHtml
};
