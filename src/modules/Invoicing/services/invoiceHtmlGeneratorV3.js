const { normalizeSolarEstimateFields } = require('./solarEstimateValues');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoney(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `RM ${numeric.toFixed(2)}` : 'RM 0.00';
}

function formatSignedMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'RM 0.00';
  return `${numeric < 0 ? '-' : ''}RM ${Math.abs(numeric).toFixed(2)}`;
}

function formatNumber(value, digits = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : '-';
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' });
}

function normalizeInvoicePackageType(...rawValues) {
  const values = rawValues.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
  if (values.length === 0) return '';

  if (values.some((value) => (
    value === 'commercial'
    || value.includes('commercial')
    || value.includes('non-domestic')
    || value.includes('non domestic')
    || value.includes('tariff b&d')
    || value.includes('low voltage')
  ))) {
    return 'commercial';
  }

  if (values.some((value) => value === 'residential' || value.includes('residential'))) {
    return 'residential';
  }

  return values[0];
}

function buildTigerNeoPresentationUrl(invoice) {
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
  return query ? `/t3_html_presentation/solar-proposal-2026-tiger-neo-3/?${query}` : '/t3_html_presentation/solar-proposal-2026-tiger-neo-3/';
}

function findItemText(items, keyword) {
  const needle = String(keyword || '').toLowerCase();
  const match = items.find((item) => `${item.product_name || ''} ${item.description || ''}`.toLowerCase().includes(needle));
  return match ? String(match.product_name || match.description || '').trim() : '';
}

function renderSpecCard(label, value, hint = '') {
  return `
    <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p class="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">${escapeHtml(label)}</p>
      <p class="mt-2 text-lg font-bold tracking-tight text-slate-900">${escapeHtml(value || '-')}</p>
      ${hint ? `<p class="mt-2 text-xs leading-6 text-slate-500">${escapeHtml(hint)}</p>` : ''}
    </div>
  `;
}

function renderWarrantyItem(warranty, index) {
  return `
    <div class="flex gap-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-xs font-black text-emerald-700">${String(index + 1).padStart(2, '0')}</div>
      <div class="min-w-0">
        <p class="text-sm font-bold text-slate-900">${escapeHtml(warranty.name || `Warranty ${index + 1}`)}</p>
        <p class="mt-1 whitespace-pre-line text-sm leading-7 text-slate-600">${escapeHtml(warranty.terms || 'Standard warranty applies.')}</p>
      </div>
    </div>
  `;
}

function renderItemRow(item, index) {
  const qty = parseFloat(item.qty) || 0;
  const totalPrice = parseFloat(item.total_price) || 0;
  const unitPrice = qty > 0 ? totalPrice / qty : 0;
  return `
    <tr class="${index % 2 ? 'bg-slate-50/60' : 'bg-white'}">
      <td class="px-3 py-3 text-xs font-black text-emerald-700">${String(index + 1).padStart(2, '0')}</td>
      <td class="px-3 py-3 text-sm leading-6 text-slate-900">${escapeHtml(String(item.description || item.product_name || '').replace(/\n/g, ' '))}</td>
      <td class="px-3 py-3 text-right text-sm font-semibold text-slate-700">${formatNumber(qty, 2)}</td>
      <td class="px-3 py-3 text-right text-sm font-semibold text-slate-700">${formatSignedMoney(unitPrice)}</td>
      <td class="px-3 py-3 text-right text-sm font-bold ${totalPrice < 0 ? 'text-red-600' : 'text-slate-900'}">${formatSignedMoney(totalPrice)}</td>
    </tr>
  `;
}

function renderMobileItemCard(item, index) {
  const qty = parseFloat(item.qty) || 0;
  const totalPrice = parseFloat(item.total_price) || 0;
  const unitPrice = qty > 0 ? totalPrice / qty : 0;
  const description = String(item.description || item.product_name || '').replace(/\n/g, ' ').trim();

  return `
    <article class="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700">${String(index + 1).padStart(2, '0')}</p>
          <h4 class="mt-1 text-base font-bold leading-6 text-slate-900">${escapeHtml(description || 'Item')}</h4>
        </div>
        <div class="rounded-full ${totalPrice < 0 ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-900'} px-3 py-1.5 text-sm font-black">
          ${escapeHtml(formatSignedMoney(totalPrice))}
        </div>
      </div>

      <dl class="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div class="rounded-2xl bg-slate-50 px-3 py-2.5">
          <dt class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Qty</dt>
          <dd class="mt-1 font-bold text-slate-900">${formatNumber(qty, 2)}</dd>
        </div>
        <div class="rounded-2xl bg-slate-50 px-3 py-2.5">
          <dt class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Unit</dt>
          <dd class="mt-1 font-bold text-slate-900">${escapeHtml(formatSignedMoney(unitPrice))}</dd>
        </div>
        <div class="rounded-2xl bg-slate-50 px-3 py-2.5">
          <dt class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Total</dt>
          <dd class="mt-1 font-bold text-slate-900">${escapeHtml(formatSignedMoney(totalPrice))}</dd>
        </div>
      </dl>
    </article>
  `;
}

function generateInvoiceHtmlV3(invoice, template, options = {}) {
  const items = invoice.items || [];
  const templateData = template || {};
  const layoutMode = String(options.layout || options.viewMode || '').toLowerCase();
  const isPrintLayout = layoutMode === 'a4' || layoutMode === 'a4-preview' || layoutMode === 'print';

  const invoiceStatus = String(invoice.status || '').toLowerCase();
  const titleLabel = invoiceStatus === 'confirmed' || invoiceStatus === 'paid' ? 'INVOICE' : 'QUOTATION';
  const normalizedPackageType = normalizeInvoicePackageType(invoice.package_type, invoice.type, invoice.package_name);
  const hasTigerNeo3 = items.some((item) => (item.description || '').toLowerCase().includes('tiger neo 3'))
    || String(invoice.package_name || '').toLowerCase().includes('tiger neo 3');
  const presentationLabel = hasTigerNeo3 ? 'TigerNeo 3 Presentation' : 'Tiger Neo Presentation';
  const presentationUrl = buildTigerNeoPresentationUrl(invoice);
  const token = invoice.share_token || invoice.bubble_id || '';
  const encodedToken = encodeURIComponent(token);

  const panelQty = parseFloat(invoice.panel_qty) || 0;
  const panelRating = parseFloat(invoice.panel_rating) || 0;
  const systemSizeKwp = parseFloat(invoice.system_size_kwp) || (panelQty && panelRating ? (panelQty * panelRating) / 1000 : 0);
  const warrantyCount = Array.isArray(invoice.warranties) ? invoice.warranties.length : 0;
  const packageName = invoice.package_name || 'Solar Package';
  const panelName = invoice.panel_name || findItemText(items, 'panel') || 'Panel Type Not Set';
  const inverterName = invoice.inverter_name || findItemText(items, 'inverter') || 'Inverter Type Not Set';
  const customerName = invoice.customer_name || 'Valued Customer';
  const customerAddress = invoice.customer_address || '';
  const customerPhone = invoice.customer_phone || '';
  const customerEmail = invoice.customer_email || '';
  const invoiceDate = formatDate(invoice.invoice_date || invoice.created_at);
  const createdBy = invoice.created_by_user_name || 'System';

  const estimate = normalizeSolarEstimateFields({
    customerAverageTnb: invoice.customer_average_tnb,
    estimatedSaving: invoice.estimated_saving,
    estimatedNewBillAmount: invoice.estimated_new_bill_amount
  });
  const beforeSolarBill = estimate.beforeSolarBill;
  const estimatedSaving = estimate.estimatedSaving;
  const afterSolarBill = estimate.estimatedNewBillAmount;

  const totalAmount = parseFloat(invoice.total_amount) || 0;
  const sstAmount = parseFloat(invoice.sst_amount) || 0;
  const discountAmount = parseFloat(invoice.discount_amount) || 0;
  const voucherAmount = parseFloat(invoice.voucher_amount) || 0;
  const cnyPromoAmount = parseFloat(invoice.cny_promo_amount) || 0;
  const holidayBoostAmount = parseFloat(invoice.holiday_boost_amount) || 0;
  const earnNowRebateAmount = parseFloat(invoice.earn_now_rebate_amount) || 0;
  const earthMonthGoGreenBonusAmount = parseFloat(invoice.earth_month_go_green_bonus_amount) || 0;
  const subtotal = totalAmount - sstAmount + discountAmount + voucherAmount + cnyPromoAmount + holidayBoostAmount + earnNowRebateAmount + earthMonthGoGreenBonusAmount;

  const quickFacts = [
    { label: 'Status', value: titleLabel },
    { label: 'Customer', value: customerName },
    { label: 'Invoice', value: invoice.invoice_number || invoice.bubble_id || '-' },
    { label: 'Date', value: invoiceDate }
  ];

  const systemSpecCards = [
    renderSpecCard('Package', packageName, normalizedPackageType ? normalizedPackageType.toUpperCase() : 'PACKAGE'),
    renderSpecCard('System Size', systemSizeKwp > 0 ? `${systemSizeKwp.toFixed(2)} kWp` : '-', 'Calculated from the package panel count and rating'),
    renderSpecCard('Panel Qty', panelQty > 0 ? `${panelQty.toFixed(0)} pcs` : '-', panelRating > 0 ? `${panelRating.toFixed(0)}W each` : 'Panel rating not set'),
    renderSpecCard('Panel Type', panelName, 'Pulled from the linked package'),
    renderSpecCard('Inverter Type', inverterName, 'Pulled from the linked package'),
    renderSpecCard('Panel Rating', panelRating > 0 ? `${panelRating.toFixed(0)}W` : '-', 'Used for solar savings estimate')
  ].join('');

  const warrantyCards = (invoice.warranties || []).length
    ? invoice.warranties.map((warranty, index) => renderWarrantyItem(warranty, index)).join('')
    : `<div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-7 text-slate-600">Warranty details are not attached yet.</div>`;

  const itemRows = items.length
    ? items.map((item, index) => renderItemRow(item, index)).join('')
    : `<tr><td colspan="5" class="px-4 py-10 text-center text-sm italic text-slate-500">No quotation items found.</td></tr>`;
  const mobileItemCards = items.length
    ? items.map((item, index) => renderMobileItemCard(item, index)).join('')
    : `<div class="rounded-[22px] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm italic text-slate-500">No quotation items found.</div>`;

  const terms = templateData.terms_and_conditions || '';
  const currentViewUrl = `/view/${encodedToken}`;
  const pdfUrl = `/view-v3/${encodedToken}/pdf`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <title>${escapeHtml(titleLabel)} ${escapeHtml(invoice.invoice_number || invoice.bubble_id || '')} V3</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
  <style>
    html { scroll-behavior: smooth; }
    body { background:
      radial-gradient(circle at top left, rgba(15, 118, 110, 0.10), transparent 26%),
      radial-gradient(circle at top right, rgba(217, 119, 6, 0.10), transparent 24%),
      linear-gradient(180deg, #08111f 0%, #eef2f7 14%, #f6f8fb 100%);
    }
    body.print-layout { background: #f8fafc; }
    .section-title { font-family: 'Space Grotesk', sans-serif; letter-spacing: -0.03em; }
    body.print-layout .no-print { display: none !important; }
    .desktop-items { display: block; }
    .mobile-items { display: none; }

    @media (max-width: 760px) {
      .desktop-items { display: none; }
      .mobile-items { display: grid; gap: 12px; }
    }
  </style>
</head>
<body class="${isPrintLayout ? 'print-layout' : ''} font-sans text-slate-900">
  <div class="mx-auto w-[min(1160px,calc(100vw-24px))] py-5 sm:py-6">
    <section class="relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-800 px-6 py-7 text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)] sm:px-8">
      <div class="relative z-10 flex flex-col gap-6">
        <div class="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
          <div class="max-w-4xl">
            <p class="mb-2 text-[11px] font-black uppercase tracking-[0.34em] text-white/70">Invoice View V3</p>
            <h1 class="section-title text-4xl font-bold tracking-tight sm:text-5xl">${escapeHtml(titleLabel)} ${escapeHtml(invoice.invoice_number || invoice.bubble_id || '')}</h1>
            <p class="mt-4 max-w-3xl text-sm leading-7 text-white/78 sm:text-base">
              Long-form quotation and invoice review, arranged from system spec to terms so the customer can read the full story in one continuous scroll.
            </p>
          </div>
          <div class="flex flex-wrap gap-2 ${isPrintLayout ? 'hidden' : ''}">
            <a href="${currentViewUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-4 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-white transition hover:bg-white/15">Open Current View</a>
            <button type="button" onclick="downloadPdf()" class="inline-flex items-center rounded-full bg-white px-4 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-900 transition hover:bg-slate-100">Download PDF</button>
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          ${quickFacts.map((fact) => `
            <div class="rounded-2xl border border-white/10 bg-white/8 px-4 py-4 backdrop-blur">
              <p class="text-[10px] font-black uppercase tracking-[0.24em] text-white/60">${escapeHtml(fact.label)}</p>
              <p class="mt-2 text-base font-bold">${escapeHtml(fact.value)}</p>
            </div>
          `).join('')}
        </div>

        <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
          ${[
            ['system-spec', 'System Spec Summarize'],
            ['warranty-spec', 'Warranty Spec'],
            ['saving-estimation', 'Saving Estimation'],
            ['quotation', 'Quotation / the invoice'],
            ['presentation', presentationLabel],
            ['tnc', 'TnC']
          ].map(([id, label], index) => `
            <a href="#${id}" class="flex items-center gap-3 rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-sm font-semibold text-white/90 transition hover:bg-white/14">
              <span class="grid h-8 w-8 place-items-center rounded-full bg-white text-[11px] font-black text-slate-900">${String(index + 1).padStart(2, '0')}</span>
              <span class="leading-snug">${escapeHtml(label)}</span>
            </a>
          `).join('')}
        </div>
      </div>
    </section>

    <main class="mt-5 space-y-5">
      <section id="system-spec" class="rounded-[26px] border border-slate-200 bg-white/95 p-6 shadow-lg shadow-slate-200/60 backdrop-blur">
        <div class="mb-5">
          <p class="mb-2 text-[11px] font-black uppercase tracking-[0.28em] text-emerald-700">01. System Spec Summarize</p>
          <h2 class="section-title text-2xl font-bold text-slate-950 sm:text-3xl">What this package is built from</h2>
          <p class="mt-2 max-w-4xl text-sm leading-7 text-slate-600">This summary pulls the package, panel, inverter, and system size into one quick read for the customer.</p>
        </div>
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">${systemSpecCards}</div>
      </section>

      <section id="warranty-spec" class="rounded-[26px] border border-slate-200 bg-white/95 p-6 shadow-lg shadow-slate-200/60 backdrop-blur">
        <div class="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p class="mb-2 text-[11px] font-black uppercase tracking-[0.28em] text-emerald-700">02. Warranty Spec</p>
            <h2 class="section-title text-2xl font-bold text-slate-950 sm:text-3xl">Coverage lines attached to this quotation</h2>
          </div>
          <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center">
            <p class="text-2xl font-black text-slate-950">${warrantyCount}</p>
            <p class="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Warranty line${warrantyCount === 1 ? '' : 's'}</p>
          </div>
        </div>
        <div class="space-y-3">${warrantyCards}</div>
      </section>

      <section id="saving-estimation" class="rounded-[26px] border border-slate-200 bg-white/95 p-6 shadow-lg shadow-slate-200/60 backdrop-blur">
        <div class="mb-5">
          <p class="mb-2 text-[11px] font-black uppercase tracking-[0.28em] text-emerald-700">03. Saving Estimation</p>
          <h2 class="section-title text-2xl font-bold text-slate-950 sm:text-3xl">Monthly bill estimate based on saved calculator data</h2>
          <p class="mt-2 max-w-4xl text-sm leading-7 text-slate-600">This section shows the latest stored solar estimate so the customer can see the savings before the quotation lines begin.</p>
        </div>
        <div class="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div class="rounded-[24px] bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-800 p-6 text-white shadow-xl">
            <p class="text-[11px] font-black uppercase tracking-[0.28em] text-white/60">Estimated monthly saving</p>
            <div class="mt-3 text-4xl font-bold tracking-tight">${estimatedSaving !== null ? formatMoney(estimatedSaving) : 'RM --'}</div>
            <p class="mt-4 max-w-xl text-sm leading-7 text-white/75">
              ${beforeSolarBill !== null && afterSolarBill !== null
                ? `From ${formatMoney(beforeSolarBill)} to ${formatMoney(afterSolarBill)} after solar offset.`
                : 'No saved scenario yet. The quotation can still be reviewed, but the estimate should be refreshed before sending.'}
            </p>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">${[
            ['Average TNB Bill', beforeSolarBill !== null ? formatMoney(beforeSolarBill) : '-', 'Stored from calculator'],
            ['Estimated New Bill', afterSolarBill !== null ? formatMoney(afterSolarBill) : '-', 'Bill after solar'],
            ['Sun Peak Hour', formatNumber(invoice.solar_sun_peak_hour ?? 3.4, 2), 'Assumption used'],
            ['Morning Usage', `${formatNumber(invoice.solar_morning_usage_percent ?? 30, 0)}%`, 'Day usage share'],
            ['Saving Status', estimatedSaving !== null ? 'Saved Scenario' : 'No Estimate Yet', 'Latest stored data'],
            ['Package Type', normalizedPackageType ? normalizedPackageType.toUpperCase() : '-', 'Commercial / Residential']
          ].map(([label, value, hint]) => renderSpecCard(label, value, hint)).join('')}</div>
        </div>
      </section>

      <section id="quotation" class="rounded-[26px] border border-slate-200 bg-white/95 p-6 shadow-lg shadow-slate-200/60 backdrop-blur">
        <div class="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p class="mb-2 text-[11px] font-black uppercase tracking-[0.28em] text-emerald-700">04. Quotation / the invoice</p>
            <h2 class="section-title text-2xl font-bold text-slate-950 sm:text-3xl">Line-by-line pricing and payment summary</h2>
            <p class="mt-2 max-w-4xl text-sm leading-7 text-slate-600">The live item lines, summary totals, and bank details live together so the customer can review the commercial block in one place.</p>
          </div>
          <div class="flex gap-2 ${isPrintLayout ? 'hidden' : ''}">
            <a href="${presentationUrl}" target="_blank" rel="noopener noreferrer" class="rounded-full border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-700 transition hover:bg-slate-100">Open Presentation</a>
            ${!invoice.customer_signature ? `<a href="${currentViewUrl}" target="_blank" rel="noopener noreferrer" class="rounded-full bg-slate-950 px-4 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-white transition hover:bg-slate-800">Sign</a>` : ''}
          </div>
        </div>

        <div class="grid gap-4 xl:grid-cols-[1.35fr_0.75fr]">
          <div class="desktop-items overflow-hidden rounded-[22px] border border-slate-200 bg-white">
            <div class="overflow-x-auto">
              <table class="min-w-[720px] w-full">
                <thead class="bg-slate-50 text-left">
                  <tr>
                    <th class="px-3 py-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">#</th>
                    <th class="px-3 py-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Description</th>
                    <th class="px-3 py-3 text-right text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Qty</th>
                    <th class="px-3 py-3 text-right text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Unit</th>
                    <th class="px-3 py-3 text-right text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Amount</th>
                  </tr>
                </thead>
                <tbody>${itemRows}</tbody>
              </table>
            </div>
          </div>

          <div class="mobile-items">
            ${mobileItemCards}
          </div>

          <div class="space-y-4">
            <div class="rounded-[22px] border border-slate-200 bg-slate-50 p-5">
              <p class="mb-3 text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">Totals</p>
              <div class="space-y-2">
                ${[
                  ['Sub Total', formatMoney(subtotal)],
                  ...(discountAmount > 0 ? [['Discount', formatSignedMoney(-Math.abs(discountAmount))]] : []),
                  ...(voucherAmount > 0 ? [['Voucher', formatSignedMoney(-Math.abs(voucherAmount))]] : []),
                  ...(cnyPromoAmount > 0 ? [['CNY 2026 Promo', formatSignedMoney(-Math.abs(cnyPromoAmount))]] : []),
                  ...(holidayBoostAmount > 0 ? [['Holiday Boost Reward', formatSignedMoney(-Math.abs(holidayBoostAmount))]] : []),
                  ...(earnNowRebateAmount > 0 ? [['Earn Now Rebate', formatSignedMoney(-Math.abs(earnNowRebateAmount))]] : []),
                  ...(earthMonthGoGreenBonusAmount > 0 ? [['Earth Month Bonus', formatSignedMoney(-Math.abs(earthMonthGoGreenBonusAmount))]] : []),
                  ...(sstAmount > 0 ? [['Tax (6%)', formatMoney(sstAmount)]] : []),
                  ['Total', formatMoney(totalAmount)]
                ].map(([label, value], index) => `
                  <div class="flex items-center justify-between gap-4 border-b border-slate-200/70 py-2 ${index === 0 ? 'pt-0' : ''} ${label === 'Total' ? 'rounded-2xl border-0 bg-white px-3 py-3' : ''}">
                    <span class="text-sm font-medium ${label === 'Total' ? 'text-slate-900' : 'text-slate-600'}">${escapeHtml(label)}</span>
                    <span class="text-sm font-extrabold ${label === 'Total' ? 'text-slate-950' : 'text-slate-900'}">${escapeHtml(value)}</span>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="rounded-[22px] border border-slate-200 bg-white p-5">
              <p class="mb-3 text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">Payment method</p>
              <div class="space-y-3 text-sm leading-7 text-slate-700">
                <div class="grid grid-cols-[92px_minmax(0,1fr)] gap-3"><span class="font-black uppercase tracking-[0.18em] text-slate-400">Bank</span><span>${escapeHtml(templateData.bank_name || '-')}</span></div>
                <div class="grid grid-cols-[92px_minmax(0,1fr)] gap-3"><span class="font-black uppercase tracking-[0.18em] text-slate-400">Account</span><span>${escapeHtml(templateData.bank_account_no || '-')}</span></div>
                <div class="grid grid-cols-[92px_minmax(0,1fr)] gap-3"><span class="font-black uppercase tracking-[0.18em] text-slate-400">Name</span><span>${escapeHtml(templateData.bank_account_name || '-')}</span></div>
                <div class="grid grid-cols-[92px_minmax(0,1fr)] gap-3"><span class="font-black uppercase tracking-[0.18em] text-slate-400">Ref</span><span>${escapeHtml(invoice.invoice_number || invoice.bubble_id || '-')}</span></div>
              </div>
            </div>

            <div class="rounded-[22px] border border-slate-200 bg-white p-5">
              <p class="mb-3 text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">Signature</p>
              ${invoice.customer_signature ? `
                <img src="${escapeHtml(invoice.customer_signature.startsWith('//') ? `https:${invoice.customer_signature}` : invoice.customer_signature)}" alt="Customer signature" class="max-h-40 w-full rounded-2xl border border-slate-200 bg-slate-50 object-contain p-3">
                <p class="mt-3 text-sm font-bold text-slate-900">${escapeHtml(customerName)}</p>
                ${invoice.signature_date ? `<p class="text-sm text-slate-500">Signed on ${escapeHtml(formatDate(invoice.signature_date))}</p>` : ''}
              ` : `
                <p class="text-sm leading-7 text-slate-600">No signature has been recorded for this quotation yet.</p>
                ${isPrintLayout ? '' : `<a href="${currentViewUrl}" target="_blank" rel="noopener noreferrer" class="mt-3 inline-flex rounded-full bg-slate-950 px-4 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-white transition hover:bg-slate-800">Open signature</a>`}
              `}
            </div>
          </div>
        </div>
      </section>

      <section id="presentation" class="rounded-[26px] border border-slate-200 bg-white/95 p-6 shadow-lg shadow-slate-200/60 backdrop-blur">
        <div class="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p class="mb-2 text-[11px] font-black uppercase tracking-[0.28em] text-emerald-700">05. Tiger Neo Presentation</p>
            <h2 class="section-title text-2xl font-bold text-slate-950 sm:text-3xl">${escapeHtml(presentationLabel)}</h2>
            <p class="mt-2 max-w-4xl text-sm leading-7 text-slate-600">The linked package flows into the presentation deck so the customer can see the supporting story behind the quotation.</p>
          </div>
          <a href="${presentationUrl}" target="_blank" rel="noopener noreferrer" class="rounded-full bg-slate-950 px-4 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-white transition hover:bg-slate-800">Open Deck</a>
        </div>
        <a href="${presentationUrl}" target="_blank" rel="noopener noreferrer" class="block overflow-hidden rounded-[24px] border border-slate-200 bg-slate-900 shadow-xl">
          <img src="/slide-001.webp" alt="${escapeHtml(presentationLabel)}" class="block w-full object-cover">
        </a>
      </section>

      <section id="tnc" class="rounded-[26px] border border-slate-200 bg-white/95 p-6 shadow-lg shadow-slate-200/60 backdrop-blur">
        <div class="mb-5">
          <p class="mb-2 text-[11px] font-black uppercase tracking-[0.28em] text-emerald-700">06. TnC</p>
          <h2 class="section-title text-2xl font-bold text-slate-950 sm:text-3xl">Terms and conditions for the quotation</h2>
        </div>
        <div class="rounded-[22px] border border-slate-200 bg-slate-50 p-5">
          <div class="whitespace-pre-line text-sm leading-8 text-slate-700">${escapeHtml(terms).replace(/\n/g, '<br>')}</div>
          <div class="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
            <span>Quotation created by <strong class="text-slate-900">${escapeHtml(createdBy)}</strong></span>
            <span>${escapeHtml(templateData.company_name || 'Atap Solar')}</span>
          </div>
          <div class="mt-2 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
            <span>${escapeHtml(customerName)}</span>
            <span>${escapeHtml(customerPhone || customerEmail || customerAddress || '')}</span>
          </div>
        </div>
      </section>
    </main>
  </div>

  <script>
    async function downloadPdf() {
      try {
        const response = await fetch(${JSON.stringify(pdfUrl)});
        const data = await response.json();
        if (data && data.success && data.downloadUrl) {
          let downloadUrl = data.downloadUrl;
          if (!/^https?:\\/\\//i.test(downloadUrl)) downloadUrl = 'https://' + downloadUrl;
          window.open(downloadUrl, '_blank', 'noopener');
          return;
        }
        alert('Failed to prepare PDF: ' + ((data && data.error) ? data.error : 'Unknown error'));
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }
  </script>
</body>
</html>
  `;
}

module.exports = {
  generateInvoiceHtmlV3
};
