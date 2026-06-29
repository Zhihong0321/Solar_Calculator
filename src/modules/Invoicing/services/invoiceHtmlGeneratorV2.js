// invoiceHtmlGeneratorV2.js

const { parseOptionalCurrency, normalizeSolarEstimateFields } = require('./solarEstimateValues');
const { buildInvoiceInteractiveSupport } = require('./invoiceHtmlGeneratorV2InteractiveSupport');
const { getPaymentTermsSchedule } = require('./invoicePaymentTermsPolicy');

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

function fmtMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `RM ${n.toFixed(2)}`;
}

function formatPublicDocumentNumber(value) {
    const text = String(value || '').trim();
    return text.replace(/^INV[-\s]*/i, '') || '—';
}

function formatInvoiceDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function buildEnergyFlowDisplay(energyFlow) {
    if (!energyFlow) {
        return null;
    }

    const monthlyUsageKwh = Number(energyFlow.monthlyUsageKwh) || 0;
    const monthlySolarGeneration = Number(energyFlow.monthlySolarGeneration) || 0;
    const exportKwh = Number(energyFlow.exportKwh) || 0;
    const netUsageKwh = Number(energyFlow.netUsageKwh) || 0;
    const actualUsageForEeiKwh = Number(energyFlow.actualUsageForEeiKwh) || 0;
    const batteryDischargeKwh = Number(energyFlow.batteryDischargeKwh) || 0;
    const backupGenerationKwh = Number(energyFlow.backupGenerationKwh) || 0;
    const gridImportKwh = Number(energyFlow.gridImportKwh) || 0;
    const exportSaving = Number(energyFlow.exportSaving) || 0;
    const solarToHomeKwh = Number.isFinite(Number(energyFlow.solarToHomeKwh))
        ? Number(energyFlow.solarToHomeKwh)
        : Math.max(0, monthlyUsageKwh - netUsageKwh);
    const directSolarKwh = Number.isFinite(Number(energyFlow.directSolarKwh))
        ? Number(energyFlow.directSolarKwh)
        : Math.max(0, solarToHomeKwh - batteryDischargeKwh);
    const selfUseKwh = Number.isFinite(Number(energyFlow.selfUseKwh))
        ? Number(energyFlow.selfUseKwh)
        : Math.max(0, solarToHomeKwh);
    const selfUsePct = Number.isFinite(Number(energyFlow.selfUsePct))
        ? Number(energyFlow.selfUsePct)
        : (monthlySolarGeneration > 0 ? Math.round((selfUseKwh / monthlySolarGeneration) * 100) : 0);
    const fitPct = Number.isFinite(Number(energyFlow.fitPct))
        ? Number(energyFlow.fitPct)
        : (monthlySolarGeneration > 0 ? Math.round((exportKwh / monthlySolarGeneration) * 100) : 0);
    const fromSolarPct = Number.isFinite(Number(energyFlow.fromSolarPct))
        ? Number(energyFlow.fromSolarPct)
        : (monthlyUsageKwh > 0 ? Math.round((solarToHomeKwh / monthlyUsageKwh) * 100) : 0);
    const gridImportPct = Number.isFinite(Number(energyFlow.gridImportPct))
        ? Number(energyFlow.gridImportPct)
        : (monthlyUsageKwh > 0 ? Math.round((((gridImportKwh || netUsageKwh) / monthlyUsageKwh) * 100)) : 0);

    return {
        monthlyUsageKwh,
        monthlySolarGeneration,
        exportKwh,
        netUsageKwh,
        actualUsageForEeiKwh,
        batteryDischargeKwh,
        backupGenerationKwh,
        gridImportKwh: gridImportKwh || netUsageKwh,
        exportSaving,
        solarToHomeKwh,
        directSolarKwh,
        selfUseKwh,
        selfUsePct,
        fitPct,
        fromSolarPct,
        gridImportPct
    };
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

    // Surface ALL action buttons in preview mode so reviewers can see them.
    const previewForceAllActions = options.previewForceAllActions === true;
    const effectiveViewerAuthenticated = previewForceAllActions ? true : viewerHasAuthenticatedUser;
    const effectiveLinkedSeda = previewForceAllActions
        ? (invoice.linked_seda_registration || 'preview-seda-321')
        : invoice.linked_seda_registration;

    // Calculate totals
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
    const initialSolarEstimateData = options.initialSolarEstimateData || null;
    const energyFlowDisplay = buildEnergyFlowDisplay(initialSolarEstimateData?.energyFlow || null);
    const beforeSolarBill = normalizedEstimate.beforeSolarBill;
    const afterSolarBill = normalizedEstimate.estimatedNewBillAmount;
    const estimatedMonthlySaving = normalizedEstimate.estimatedSaving;
    const storedSunPeakHour = parseOptionalCurrency(invoice.solar_sun_peak_hour) ?? 3.4;
    const storedMorningUsagePercent = parseOptionalCurrency(invoice.solar_morning_usage_percent) ?? 30;
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
    const BATTERY_PRODUCT_REF = '1776182988047x800815659516747800';
    const hasBatteryItem = items.some((item) => {
        const text = `${item.description || ''} ${item.product_name || ''}`.toLowerCase();
        return item.linked_product === BATTERY_PRODUCT_REF || text.includes('battery');
    });
    const showSolarSavingsSection = !isCommercialPackage
        && !isEvCharger
        && !hasBatteryItem
        && (hasSolarSavingsSection || (showInteractiveControls && canEstimateSolarSavings));

    const isConfirmed = (invoice.status || '').toLowerCase() === 'confirmed' || (invoice.status || '').toLowerCase() === 'paid';
    const titleLabel = isConfirmed ? 'INVOICE' : 'QUOTATION';
    const publicDocumentNumber = formatPublicDocumentNumber(invoice.invoice_number);
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

    // Company info
    const companyName = templateData.company_name || 'Eternalgy Solar Sdn. Bhd.';
    const companyAddress = templateData.company_address || '';
    const companyPhone = templateData.company_phone || '';
    const companyEmail = templateData.company_email || '';
    const bankName = templateData.bank_name || '';
    const bankAccountNo = templateData.bank_account_no || '';
    const bankAccountName = templateData.bank_account_name || '';
    const logoUrl = templateData.logo_url || '/logo-08.png';
    const terms = templateData.terms_and_conditions || '';
    const paymentTermsSchedule = getPaymentTermsSchedule(invoice);
    const paymentTermsRowsHtml = paymentTermsSchedule.rows.map((row) => `
      <div class="payterm-row">
        <div class="payterm-pct">${row.percent}</div>
        <div class="payterm-copy">
          <div class="payterm-title">${row.title}</div>
          <div class="payterm-desc">${row.description}</div>
        </div>
      </div>
    `).join('');
    const paymentTermsPreviewButtonHtml = paymentTermsSchedule.canPreviewCurrentTerms
        ? `<button type="button" class="payterm-preview-btn no-print" onclick="const u=new URL(window.location.href);u.searchParams.set('payment_terms_preview','after-2026-07-01');window.location.href=u.toString();">After 1 Jul 2026 Preview</button>`
        : (paymentTermsSchedule.isAfterEffectivePreview
            ? `<button type="button" class="payterm-preview-btn muted no-print" onclick="const u=new URL(window.location.href);u.searchParams.delete('payment_terms_preview');window.location.href=u.toString();">Back to Invoice Date Terms</button>`
            : '');

    // Hero number for the dark card
    const heroNumber = `${titleLabel === 'INVOICE' ? 'Total Due' : 'Quoted'}`;

    // Confidence value
    const confidenceValue = (() => {
        const c = Number(invoice.confidence || invoice.confidence_score);
        if (Number.isFinite(c) && c > 0) return Math.round(c);
        return 80;
    })();

    // Date for hero eyebrow
    const heroDate = (() => {
        if (!invoice.invoice_date) return '';
        try {
            return new Date(invoice.invoice_date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
        } catch (e) { return ''; }
    })();

    // Package banner
    const pkgName = invoice.package_name || (items[0] ? (items[0].product_name || items[0].description || 'Solar PV Package') : 'Solar PV Package');
    const pkgPrice = totalAmount > 0 ? fmtMoney(totalAmount) : '';

    // Generate items HTML
    let itemsHtml = '';
    items.forEach((item, index) => {
        const qty = parseFloat(item.qty) || 0;
        const totalPrice = parseFloat(item.total_price) || 0;
        const unitPrice = qty > 0 ? totalPrice / qty : 0;
        const isNegative = totalPrice < 0;

        const descText = (item.description || '').replace(/\\n/g, '\n');
        const [mainLine, ...subLines] = descText.split('\n');
        const subLine = subLines.join(' · ').trim();
        const descHtml = (mainLine || '').replace(/\n/g, '<br>');
        const subHtml = subLine.replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));

        itemsHtml += `
        <div class="tbl-r ${index % 2 !== 0 ? 'od' : 'ev'}" style="grid-template-columns:1fr 60px 70px 80px">
          <div>
            <div class="item-name">${descHtml}</div>
            ${subHtml ? `<div class="item-sub">${subHtml}</div>` : ''}
          </div>
          <span class="num">${qty}</span>
          <span class="num">${isNegative ? '−' : ''}RM ${Math.abs(unitPrice).toFixed(2)}</span>
          <span class="num tot">${isNegative ? '−' : ''}RM ${Math.abs(totalPrice).toFixed(2)}</span>
        </div>`;
    });

    const solarOutputKwh = energyFlowDisplay ? Number(energyFlowDisplay.monthlySolarGeneration.toFixed(1)) : null;
    const selfUsePct = energyFlowDisplay ? energyFlowDisplay.selfUsePct : null;
    const selfUseKwh = energyFlowDisplay ? Number(energyFlowDisplay.selfUseKwh.toFixed(1)) : null;
    const fitKwh = energyFlowDisplay ? Number(energyFlowDisplay.exportKwh.toFixed(1)) : null;
    const fitIncome = energyFlowDisplay ? Number(energyFlowDisplay.exportSaving.toFixed(2)) : null;
    const homeConsumptionKwh = energyFlowDisplay ? Number(energyFlowDisplay.monthlyUsageKwh.toFixed(1)) : null;
    const solarSharePct = energyFlowDisplay ? energyFlowDisplay.fromSolarPct : null;
    const solarShareKwh = energyFlowDisplay ? Number(energyFlowDisplay.solarToHomeKwh.toFixed(1)) : null;
    const gridImportKwh = energyFlowDisplay ? Number(energyFlowDisplay.gridImportKwh.toFixed(1)) : null;
    const gridImportPct = energyFlowDisplay ? energyFlowDisplay.gridImportPct : null;
    const backupGenerationKwh = energyFlowDisplay ? Number(energyFlowDisplay.backupGenerationKwh.toFixed(1)) : null;
    const backupGenerationPct = energyFlowDisplay && energyFlowDisplay.monthlySolarGeneration > 0
        ? Math.min(100, Math.round((energyFlowDisplay.backupGenerationKwh / energyFlowDisplay.monthlySolarGeneration) * 100))
        : 0;
    const systemSizeLabel = estimatePanelQty > 0 && estimatePanelRating > 0
        ? `${estimatePanelQty} × ${estimatePanelRating}W`
        : '—';

    // Action buttons block (for the section below the hero)
    const shareBtn = (invoice.share_token || invoice.bubble_id) && effectiveViewerAuthenticated
        ? `<button onclick='quickShareInvoice(${JSON.stringify(invoice.share_token || invoice.bubble_id)}, ${JSON.stringify(publicDocumentNumber)}, ${JSON.stringify(titleLabel)})' class="action-btn btn-share"><span>Share</span></button>` : '';
    const referBtn = invoice.share_token
        ? `<button onclick="window.open('https://referral.atap.solar', '_blank')" class="action-btn btn-referral"><span>Refer Program</span></button>` : '';
    const sedaBtn = !isEvCharger && effectiveLinkedSeda
        ? `<button onclick="window.open('/seda-register?id=${effectiveLinkedSeda}', '_blank')" class="action-btn btn-seda"><span>SEDA Form</span></button>` : '';
    const tigerNeoBtn = hasTigerNeo3 && tigerNeoProposalUrl
        ? `<button data-track-button="Generate Tiger Neo 3 Proposal" onclick='window.open(${JSON.stringify(tigerNeoProposalUrl)}, "_blank", "noopener")' class="action-btn btn-proposal"><span>GENERATE TIGER NEO 3 PROPOSAL</span></button>` : '';
    const viewProposalBtn = !isEvCharger && !hasTigerNeo3 && (invoice.share_token || invoice.bubble_id) && invoice.customer_name && invoice.customer_name !== 'Sample Quotation'
        ? `<button onclick="viewProposal('${invoice.share_token || invoice.bubble_id}')" class="action-btn btn-proposal"><span>View Proposal</span></button>` : '';
    const a4Btn = (invoice.share_token || invoice.bubble_id)
        ? `<button onclick="openA4Preview('${invoice.share_token || invoice.bubble_id}')" class="action-btn btn-preview"><span>PRINTABLE</span></button>` : '';
    const pdfBtn = !isEvCharger && (invoice.share_token || invoice.bubble_id)
        ? `<button onclick="downloadInvoicePdf('${invoice.share_token || invoice.bubble_id}')" class="action-btn btn-pdf"><span id="pdfButtonText">Download PDF</span></button>` : '';

    const allActionBtns = shareBtn + referBtn + sedaBtn + tigerNeoBtn + viewProposalBtn + a4Btn + pdfBtn;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
${isA4Preview
    ? '<meta name="viewport" content="width=820">'
    : '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">'
}
<title>${titleLabel} ${publicDocumentNumber}${isA4Preview ? ' - A4 Preview' : ''}</title>
${isA4Preview ? '<script src="https://unpkg.com/pagedjs/dist/paged.polyfill.js"></script>' : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/signature_pad@4.1.7/dist/signature_pad.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --gp:#16a34a;--gl:#22c55e;--gb:#dcfce7;--gbd:#86efac;--gd:#14532d;
  --nb:#0d1f0f;--dk:#1a2e1c;--dkx:#091407;
  --g50:#fafafa;--g100:#f3f4f6;--g200:#e5e7eb;--g300:#d1d5db;
  --g400:#9ca3af;--g500:#6b7280;--g700:#374151;--g900:#111827;
  --wb:#fffbeb;--wbd:#fde68a;--wt:#d97706;--wdk:#92400e;
  --eb:#fef2f2;--ebd:#fecaca;--et:#991b1b;
  --ib:#eff6ff;--it:#3b82f6;
  --sun:#c68a2a;
  --f:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,sans-serif;
  --mono:'JetBrains Mono','SFMono-Regular',Consolas,monospace;
  --r-app:12px;--r-card:6px;--r-btn:4px;--r-input:4px;--r-tag:4px;
  --shadow-app:0 24px 60px rgba(0,0,0,0.16);
}
html{background:#bbf7d0}
body{font-family:var(--f);color:var(--g900);background:#bbf7d0;min-height:100vh;-webkit-tap-highlight-color:transparent;font-variant-numeric:tabular-nums}

.app{max-width:430px;min-height:100vh;margin:0 auto;background:#f1f5f1;position:relative}
@media(min-width:500px){.app{min-height:100vh;border-radius:var(--r-app);box-shadow:var(--shadow-app);margin-top:20px;margin-bottom:20px}}

.nav{background:var(--nb);padding:8px 12px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:200;border-radius:var(--r-app) var(--r-app) 0 0}
.nav-l{display:flex;align-items:center;gap:8px}
.nav-logo{width:26px;height:26px;background:var(--gp);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff;font-weight:800;flex-shrink:0}
.nav-brand{color:#fff;font-size:12px;font-weight:700;letter-spacing:.04em;line-height:1.2}
.nav-sub{color:#9ca3af;font-size:10px;line-height:1.2}
.nav-r{display:flex;align-items:center;gap:6px}
.nav-lang{background:transparent;border:1px solid rgba(255,255,255,.22);border-radius:4px;padding:3px 7px;color:rgba(255,255,255,.78);font-size:10px;font-weight:700;cursor:pointer;font-family:var(--f)}
.nav-live{background:#1e3a20;border-radius:4px;padding:3px 7px;color:var(--gl);font-size:10px;font-weight:700;letter-spacing:.05em}
.nav-pdf{background:transparent;border:none;cursor:pointer;padding:3px;color:rgba(255,255,255,.6);display:flex;align-items:center}

.body{padding:0 12px 32px}
.sw{padding:6px 0 0}

.card{background:#fff;border-radius:var(--r-card);padding:12px;overflow:hidden}
.card+*{margin-top:6px}

.hero-card{background:var(--nb);border-radius:var(--r-card);overflow:hidden;margin-bottom:6px;position:relative}
.hero-card::before{content:'';position:absolute;top:0;left:0;width:90px;height:2px;background:var(--sun);z-index:1}
.hero-card-h{padding:12px 14px 0}
.hero-eyebrow{font-size:9px;color:var(--gl);font-weight:700;text-transform:uppercase;letter-spacing:.1em}
.hero-eyebrow-row{display:flex;justify-content:space-between;align-items:flex-start}
.hero-status-row{display:flex;align-items:center;gap:6px;margin-top:3px}
.hero-inv-no{font-size:10.5px;color:#9ca3af;font-weight:600}
.hero-title{font-size:30px;font-weight:800;color:var(--gl);letter-spacing:-1px;line-height:1;margin-top:4px}
.hero-sub{font-size:10px;color:#9ca3af;margin-top:4px;padding-bottom:10px;font-weight:500}
.hero-strip{display:flex;background:var(--dkx);border-top:1px solid #1a2e1a}
.hero-m{flex:1;padding:8px 4px;text-align:center;border-right:1px solid #1a2e1a}
.hero-m:last-child{border-right:none}
.hero-mv{font-size:14px;font-weight:800;color:#fff}
.hero-ml{font-size:8.5px;color:var(--gl);margin-top:2px;font-weight:600;text-transform:uppercase;letter-spacing:.05em}

.confidence{text-align:center}
.confidence-ring{position:relative;width:44px;height:44px;margin:0 auto}
.confidence-lbl{font-size:11px;font-weight:800;fill:#fff}
.confidence-cap{font-size:8px;color:#9ca3af;margin-top:1px;font-weight:600}

.meta-l{font-size:9px;color:var(--g400);font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:1px}
.meta-v{font-size:13px;font-weight:700;color:var(--g900)}
.meta-v.sm{font-size:11px;font-weight:600;color:var(--g700);line-height:1.4}
.meta-v.mono{font-family:var(--mono);font-size:11.5px;font-weight:600}

.billto-grid{display:grid;grid-template-columns:1.15fr 1fr}
.billto-left{padding:2px 12px 2px 0;border-right:1px solid var(--g100)}
.billto-right{padding:2px 0 2px 12px}
.billto-meta{display:grid;grid-template-columns:auto 1fr;gap:3px 8px;align-items:baseline}
.billto-meta .ml{font-size:9px;color:var(--g400);font-weight:700;text-transform:uppercase;letter-spacing:.07em}
.billto-meta .mv{font-size:11px;font-weight:600;color:var(--g700);line-height:1.4}

.status{display:inline-block;background:var(--gb);color:var(--gp);font-size:9px;font-weight:700;padding:2px 7px;border-radius:var(--r-tag);text-transform:uppercase;letter-spacing:.06em}
.status.warn{background:var(--wb);color:var(--wt)}
.status.err{background:var(--eb);color:var(--et)}
.status.blue{background:var(--ib);color:var(--it)}

.sec-label{font-size:9.5px;color:var(--g400);font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px;display:flex;align-items:center;gap:8px}
.sec-label::after{content:'';flex:1;height:1px;background:var(--g100)}

.mc-row{display:flex;gap:5px}
.mc{flex:1;background:#f8faf8;border-radius:4px;padding:7px 4px;text-align:center;border:1px solid var(--g100)}
.mc-v{font-size:17px;font-weight:800;line-height:1}
.mc-v .u{font-size:10px;font-weight:600;opacity:.8}
.mc-l{font-size:8.5px;color:var(--g500);margin-top:2px;font-weight:600;text-transform:uppercase;letter-spacing:.05em}

.div{height:1px;background:var(--g200);margin:6px 0}

.tbl{border-radius:4px;overflow:hidden;border:1px solid var(--g100)}
.tbl-h{display:grid;background:#f8faf8;padding:6px 12px;font-size:8.5px;font-weight:700;color:var(--g500);text-transform:uppercase;letter-spacing:.07em}
.tbl-r{display:grid;padding:6px 12px;font-size:11.5px;border-top:1px solid var(--g100);align-items:center}
.tbl-r.ev{background:#fff}.tbl-r.od{background:var(--g50)}
.tbl-r .item-name{font-size:11.5px;font-weight:600;color:var(--g700);line-height:1.3}
.tbl-r .item-sub{font-size:9.5px;color:var(--g500);margin-top:1px;font-weight:500}
.tbl-r .num{text-align:right;font-size:11px;color:var(--g700);font-weight:600;align-self:start;padding-top:2px}
.tbl-r .num.tot{font-size:12px;color:var(--g900);font-weight:800}

.totals{background:#fff;border-radius:var(--r-card);overflow:hidden}
.totals-h{background:var(--nb);padding:8px 14px;display:flex;justify-content:space-between;align-items:center;position:relative}
.totals-h::before{content:'';position:absolute;top:0;left:0;width:60px;height:2px;background:var(--sun)}
.totals-ht{font-size:9.5px;font-weight:700;color:var(--gl);text-transform:uppercase;letter-spacing:.1em}
.totals-hv{font-size:22px;font-weight:800;color:#fff;letter-spacing:-.5px}
.totals-b{padding:9px 14px}
.totals-row{display:flex;justify-content:space-between;align-items:baseline;padding:2.5px 0;font-size:11px}
.totals-row.lbl{color:var(--g500);font-weight:500}
.totals-row.val{color:var(--g700);font-weight:600}
.totals-row.disc .val{color:var(--et)}
.totals-row.grand{border-top:1px solid var(--g200);margin-top:4px;padding-top:7px}
.totals-row.grand .lbl{font-size:9.5px;font-weight:700;text-transform:uppercase;color:var(--g400);letter-spacing:.08em}
.totals-row.grand .val{font-size:17px;font-weight:800;color:var(--gp);letter-spacing:-.3px}

.ba{display:flex;gap:6px;align-items:stretch}
.ba-p{flex:1;border-radius:4px;padding:8px 8px;text-align:center}
.ba-p.bef{background:var(--g100)}
.ba-p.aft{background:var(--gb);border:1px solid var(--gbd)}
.ba-p .lbl{font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--g400);margin-bottom:3px}
.ba-p .amt{font-size:22px;font-weight:800;line-height:1}
.ba-p.bef .amt{color:var(--g400);text-decoration:line-through}
.ba-p.aft .amt{color:var(--gp)}
.ba-p .sub{font-size:9.5px;color:inherit;font-weight:600;margin-top:2px;opacity:.75}

.ban{border-radius:var(--r-input);padding:8px 12px;font-size:10.5px;font-weight:600;display:flex;align-items:flex-start;gap:7px;line-height:1.45}
.ban-ok{background:var(--gb);border:1px solid var(--gbd);color:var(--gp)}
.ban-warn{background:var(--wb);border:1px solid var(--wbd);color:var(--wdk)}
.ban-err{background:var(--eb);border:1px solid var(--ebd);color:var(--et)}
.ban-ic{font-size:12px;flex-shrink:0;margin-top:1px}

.btn{display:block;width:100%;padding:11px;border:none;border-radius:var(--r-btn);font-size:13px;font-weight:700;cursor:pointer;font-family:var(--f);text-align:center}
.btn-grn{background:var(--gp);color:#fff}
.btn-dark{background:var(--g900);color:#fff}
.btn-out{background:transparent;color:var(--gp);border:1.5px solid var(--gp)}

.sig-block{background:#fff;border-radius:var(--r-card);overflow:hidden}
.sig-header{background:#f8faf8;padding:6px 14px;border-bottom:1px solid var(--g100)}
.sig-hl{font-size:9.5px;color:var(--g400);font-weight:700;text-transform:uppercase;letter-spacing:.07em}
.sig-body{padding:12px 14px;text-align:center}
.sig-img{max-width:200px;height:50px;object-contain;margin:0 auto 5px}
.sig-name{font-size:12.5px;font-weight:800;color:var(--g900);text-transform:uppercase;margin-top:3px;letter-spacing:.02em}
.sig-date{font-size:9.5px;color:var(--g400);margin-top:2px;font-weight:500}
.sig-empty{padding:14px;text-align:center;color:var(--g400);font-size:11px}
.sig-resign{margin-top:8px;border:1px solid var(--g200);background:#fff;color:var(--g600);border-radius:6px;padding:6px 10px;font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;cursor:pointer}
.sig-resign:hover{border-color:var(--gp);color:var(--gp);background:var(--gb)}

.pay-row{display:flex;justify-content:space-between;align-items:baseline;padding:5px 0;border-bottom:1px solid var(--g100)}
.pay-row:last-child{border-bottom:none}
.pay-l{font-size:9.5px;color:var(--g500);font-weight:700;text-transform:uppercase;letter-spacing:.07em}
.pay-v{font-size:12px;font-weight:700;color:var(--g900)}
.pay-v.mono{font-family:var(--mono);font-size:11.5px}
.payterm-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--g100)}
.payterm-row:last-child{border-bottom:none}
.payterm-pct{width:48px;min-width:48px;color:var(--gp);font-size:21px;font-weight:800;line-height:1;font-family:var(--mono);text-align:center}
.payterm-copy{min-width:0;flex:1}
.payterm-title{font-size:12px;font-weight:800;color:var(--g900);text-transform:uppercase;letter-spacing:.04em}
.payterm-desc{font-size:10px;font-weight:600;color:var(--g500);margin-top:2px}
.payterm-preview-wrap{padding:8px 12px;border-top:1px solid var(--g100)}
.payterm-preview-btn{width:100%;border:1.5px solid var(--gp);background:#fff;color:var(--gp);border-radius:4px;padding:9px 10px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;cursor:pointer;font-family:var(--f)}
.payterm-preview-btn.muted{border-color:var(--g300);color:var(--g600)}

.pkg{background:var(--nb);border-radius:4px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;gap:10px;position:relative;overflow:hidden}
.pkg::before{content:'';position:absolute;top:0;left:0;width:50px;height:2px;background:var(--sun)}
.pkg-l{font-size:9px;color:var(--gl);font-weight:700;margin-bottom:1px;text-transform:uppercase;letter-spacing:.1em}
.pkg-n{font-size:10.5px;color:#9ca3af;margin-top:0;font-weight:500}
.pkg-v{font-size:16px;font-weight:800;color:#fff;white-space:nowrap}

.tag{display:inline-block;background:var(--gb);color:var(--gp);font-size:9.5px;font-weight:700;padding:2px 7px;border-radius:4px;text-transform:uppercase;letter-spacing:.06em}

.spark-r{display:flex;align-items:center;gap:7px;margin-bottom:4px}
.spark-l{font-size:9.5px;color:var(--g500);width:46px;flex-shrink:0;font-weight:600}
.spark-bar{flex:1;height:8px;background:var(--g100);border-radius:3px;overflow:hidden}
.spark-fill{height:100%;border-radius:3px}

.chart-block{background:#f8faf8;border-radius:4px;padding:9px 10px;border:1px solid var(--g100)}
.chart-title{font-size:11.5px;font-weight:700;color:var(--g900);margin-bottom:7px;display:flex;justify-content:space-between;align-items:baseline}
.chart-title .v{font-size:13px;font-weight:800;color:var(--g900)}
.chart-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:3px}
.chart-l{font-size:10px;color:var(--g500);font-weight:600}
.chart-r{font-size:11px;font-weight:800}
.chart-bar{height:6px;background:var(--gb);border-radius:3px;overflow:hidden;margin-top:3px;margin-bottom:6px}
.chart-fill{height:100%;border-radius:3px}
.chart-foot{margin-top:6px;background:#fffbeb;border-radius:4px;padding:5px 9px;display:flex;justify-content:space-between;align-items:center;font-size:10px}
.chart-foot.b{background:var(--ib);color:var(--it)}
.chart-foot .l{font-size:9.5px;color:var(--g500);font-weight:600;text-transform:uppercase;letter-spacing:.05em}
.chart-foot .v{font-size:12px;font-weight:800}

.disclaimer{margin-top:8px;padding:6px 9px;background:#f8faf8;border-radius:4px;border:1px solid var(--g200);font-size:9px;color:var(--g500);line-height:1.45}
.disclaimer strong{color:var(--g700)}

/* === Action buttons (the 6 shortcuts) === */
.action-row{display:flex;flex-wrap:wrap;gap:5px;padding:8px 0 2px}
.action-btn{display:inline-flex;align-items:center;gap:4px;padding:6px 10px;border-radius:4px;font-size:10px;font-weight:700;cursor:pointer;font-family:var(--f);text-transform:uppercase;letter-spacing:.05em;border:1.5px solid var(--g200);background:#fff;color:var(--g700);transition:all .15s}
.action-btn:hover{background:var(--g100)}
.btn-share{background:var(--g900);color:#fff;border-color:var(--g900)}
.btn-share:hover{background:#000}
.btn-referral{color:var(--gp);border-color:var(--gp)}
.btn-referral:hover{background:var(--gb)}
.btn-seda{color:var(--wt);border-color:var(--wt)}
.btn-seda:hover{background:var(--wb)}
.btn-proposal{color:#1d4ed8;border-color:#1d4ed8;width:100%;justify-content:center;padding:9px}
.btn-proposal:hover{background:#1d4ed8;color:#fff}
.btn-preview{color:var(--ink,#374151);border-color:var(--g300)}
.btn-pdf{color:var(--g500);border-color:var(--g300)}

/* === Pre-site-visit alert (commercial) === */
.pre-site-alert{padding:10px 12px;border:1px solid var(--ebd);border-left:3px solid var(--et);background:var(--eb);border-radius:4px;margin-bottom:6px}
.pre-site-alert-lbl{font-size:9px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--et);margin-bottom:4px}
.pre-site-alert h4{font-family:var(--f);font-size:14px;font-weight:700;color:#7f1d1d;margin-bottom:3px;line-height:1.25}
.pre-site-alert p{font-size:11px;color:#7f1d1d;line-height:1.5;margin:0}

/* === Certifications · minimal mono === */
.certifications{background:#fff;border:1px solid var(--g200);border-radius:6px;padding:10px 12px 10px;margin-top:6px;break-inside:avoid;page-break-inside:avoid}
.cert-head{margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--g100);display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:wrap}
.cert-headline{font-family:var(--mono);font-size:10.5px;font-weight:600;color:var(--g900);line-height:1.3;letter-spacing:-.005em}
.cert-subline{font-family:var(--mono);font-size:8px;font-weight:400;color:var(--g400);line-height:1.3;text-transform:uppercase;letter-spacing:.1em}
.cert-grid{display:grid;grid-template-columns:1fr 1fr}
.cert-card{padding:6px 8px;display:grid;grid-template-columns:18px 1fr;gap:7px;align-items:start;border-bottom:1px solid var(--g100);break-inside:avoid;page-break-inside:avoid}
.cert-card:nth-child(odd){border-right:1px solid var(--g100)}
.cert-card:nth-child(1),.cert-card:nth-child(2){padding-top:2px}
.cert-card:nth-child(3),.cert-card:nth-child(4){padding-bottom:2px;border-bottom:none}
.cert-logo{width:18px;height:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}
.cert-logo img{max-width:100%;max-height:100%;object-fit:contain;display:block}
.cert-name{font-family:var(--mono);font-size:9px;font-weight:600;color:var(--g900);line-height:1.3;margin-bottom:2px}
.cert-meta{font-family:var(--mono);font-size:8.5px;font-weight:400;color:var(--g500);line-height:1.45;word-break:break-word}

/* === Floating A4 preview button === */
.floating-a4-preview{position:fixed;right:20px;bottom:20px;z-index:90;box-shadow:0 12px 28px rgba(15,23,42,.22)}
.floating-a4-preview button{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:9999px;background:linear-gradient(135deg,var(--g900),#334155);color:#fff;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;border:1px solid rgba(255,255,255,.12);cursor:pointer;font-family:var(--f);transition:transform .15s ease,box-shadow .15s ease,opacity .15s ease}
.floating-a4-preview button:hover{transform:translateY(-1px);box-shadow:0 14px 32px rgba(15,23,42,.28)}

/* === Signature modal === */
.sig-modal{position:fixed;inset:0;z-index:100;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(15,26,18,0.62);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}
.sig-modal.is-open{display:flex}
.sig-modal-card{background:#fff;border-radius:8px;width:100%;max-width:480px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.24);transform:scale(.96);opacity:0;transition:transform .18s ease,opacity .18s ease}
.sig-modal-card.is-visible{transform:scale(1);opacity:1}
.sig-modal-head{padding:12px 16px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--g100);background:#f8faf8}
.sig-modal-title{font-size:11px;font-weight:800;color:var(--g900);text-transform:uppercase;letter-spacing:.07em;line-height:1.3}
.sig-modal-sub{font-size:9.5px;color:var(--g500);font-weight:500;margin-top:2px}
.sig-modal-close{background:transparent;border:0;color:var(--g400);cursor:pointer;width:24px;height:24px;border-radius:4px;font-size:11px;line-height:1;display:flex;align-items:center;justify-content:center;transition:all .15s}
.sig-modal-close:hover{color:var(--g700);background:#fff}
.sig-modal-body{padding:14px 16px}
.sig-pad-wrap{position:relative;background:#f8faf8;border:1.5px dashed var(--g300);border-radius:4px;height:220px;overflow:hidden;touch-action:none}
.sig-canvas{position:absolute;inset:0;width:100% !important;height:100% !important;cursor:crosshair;display:block}
.sig-modal-actions{margin-top:12px;display:flex;justify-content:space-between;align-items:center;gap:10px}
.sig-action-link{background:transparent;border:0;color:var(--g500);font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;padding:6px 4px;font-family:var(--f);transition:color .15s}
.sig-action-link:hover{color:var(--g700)}
.sig-action-group{display:flex;gap:6px;flex:1}
.sig-action-cancel{flex:1;padding:9px 12px;background:#fff;border:1.5px solid var(--g300);color:var(--g700);border-radius:4px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;font-family:var(--f);transition:all .15s}
.sig-action-cancel:hover{background:var(--g100)}
.sig-action-confirm{flex:2;padding:9px 12px;background:var(--g900);color:#fff;border:0;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;font-family:var(--f);display:inline-flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 4px 12px rgba(0,0,0,.12);transition:all .15s}
.sig-action-confirm:hover{background:#000}
.sig-action-confirm:disabled{opacity:.6;cursor:not-allowed}

/* === Animations === */
@keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.anim{animation:slideUp .25s ease forwards}
.anim:nth-child(2){animation-delay:.04s}
.anim:nth-child(3){animation-delay:.08s}
.anim:nth-child(4){animation-delay:.12s}
.anim:nth-child(5){animation-delay:.16s}
.anim:nth-child(6){animation-delay:.20s}
.anim:nth-child(7){animation-delay:.24s}

@media print{
  .nav{border-radius:0}
  .app{margin:0;box-shadow:none;min-height:unset;border-radius:0}
  html{background:#fff}
  .body{padding-bottom:20px}
  .action-row{display:none !important}
  .nav-pdf{display:none}
}
@media (max-width:380px){
  .cert-grid{grid-template-columns:1fr}
  .cert-card:nth-child(odd){border-right:none}
  .cert-card{border-bottom:1px solid var(--g100)}
  .cert-card:last-child{border-bottom:none}
}
</style>
</head>
<body${isA4Preview ? ' class="a4-preview"' : ''}>
  <script>
    function formatLocalTime() {
      document.querySelectorAll('.local-time').forEach(function(el){
        var iso = el.getAttribute('data-iso');
        if (iso) {
          try {
            var d = new Date(iso);
            var opts = { year:'numeric', month:'short', day:'numeric' };
            if (el.getAttribute('data-show-time') === 'true') { opts.hour='2-digit'; opts.minute='2-digit'; }
            el.textContent = d.toLocaleString(undefined, opts);
          } catch(e) {}
        }
      });
    }
    document.addEventListener('DOMContentLoaded', formatLocalTime);
  </script>

  ${showInteractiveControls ? buildInvoiceInteractiveSupport({
      identifier: estimateIdentifier,
      hasSolarSavingsSection,
      canEstimateSolarSavings,
      beforeSolarBill,
      afterSolarBill,
      estimatedMonthlySaving,
      initialSolarEstimateData,
      storedSunPeakHour,
      storedMorningUsagePercent
  }) : ''}

  <div class="app">

    <!-- NAV -->
    <nav class="nav">
      <div class="nav-l">
        <div class="nav-logo">E</div>
        <div>
          <div class="nav-brand">ETERNALGY</div>
          <div class="nav-sub">Solar PV Planner</div>
        </div>
      </div>
      <div class="nav-r">
        <button class="nav-lang">EN | 中</button>
        <div class="nav-live">LIVE</div>
        <button class="nav-pdf" title="Download PDF" onclick="downloadPdf()">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="12" y2="18"/><line x1="15" y1="15" x2="12" y2="18"/></svg>
        </button>
      </div>
    </nav>

    <!-- BODY -->
    <div class="body">

      <!-- HERO -->
      <div class="sw anim">
        <div class="hero-card">
          <div class="hero-card-h">
            <div class="hero-eyebrow">${titleLabel}${heroDate ? ' · ' + heroDate : ''}</div>
            <div class="hero-title">${fmtMoney(totalAmount)}</div>
            <div class="hero-sub">${heroNumber}${invoice.due_date ? ' · Due ' + formatInvoiceDate(invoice.due_date) : ''}</div>
          </div>
          <div class="hero-strip">
            <div class="hero-m">
              <div class="hero-mv">${invoice.panel_qty || estimatePanelQty || '—'}</div>
              <div class="hero-ml">Panels</div>
            </div>
            <div class="hero-m">
              <div class="hero-mv">${invoice.system_size_kwp ? invoice.system_size_kwp + ' kWp' : (estimatePanelQty && estimatePanelRating ? ((estimatePanelQty*estimatePanelRating)/1000).toFixed(1) + ' kWp' : '—')}</div>
              <div class="hero-ml">System</div>
            </div>
            <div class="hero-m">
              <div class="hero-mv">${pkgPrice.replace('RM ','')}</div>
              <div class="hero-ml">Quoted</div>
            </div>
          </div>
        </div>
      </div>

      ${showInteractiveControls && allActionBtns ? `
      <div class="sw anim">
        <div class="action-row no-print">${allActionBtns}</div>
      </div>
      ` : ''}

      ${showPreSiteVisitReminder ? `
      <div class="sw anim">
        <div class="pre-site-alert">
          <div class="pre-site-alert-lbl">Important Commercial Notice</div>
          <h4>Pre-Site-Visit Quotation</h4>
          <p>This quotation is preliminary and the quoted price is not final. Final pricing is subject to site visit findings, technical assessment, and scope confirmation.</p>
        </div>
      </div>
      ` : ''}

      <!-- BILL TO + INVOICE META -->
      <div class="sw anim">
        <div class="card">
          <div class="billto-grid">
            <div class="billto-left">
              <div class="meta-l">Bill To</div>
              <div class="meta-v">${invoice.customer_name || 'Valued Customer'}</div>
              ${invoice.customer_address ? `<div class="meta-v sm" style="margin-top:3px">${invoice.customer_address}</div>` : ''}
            </div>
            <div class="billto-right">
              <div class="meta-l">${titleLabel}</div>
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
                <span class="meta-v mono">${publicDocumentNumber}</span>
              </div>
              <div class="billto-meta">
                <div class="ml">Issued</div><div class="mv">${formatInvoiceDate(invoice.invoice_date)}</div>
                ${invoice.due_date ? `<div class="ml">Due</div><div class="mv">${formatInvoiceDate(invoice.due_date)}</div>` : ''}
                ${invoice.package_type ? `<div class="ml">Package</div><div class="mv">${invoice.package_type}</div>` : ''}
                ${invoice.created_by_user_name ? `<div class="ml">By</div><div class="mv" style="font-size:10.5px">${invoice.created_by_user_name}</div>` : `<div class="ml">By</div><div class="mv" style="font-size:10.5px">Eternalgy Solar</div>`}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- PACKAGE BANNER -->
      <div class="sw anim">
        <div class="pkg">
          <div>
            <div class="pkg-l">Recommended Package</div>
            <div class="pkg-n">${pkgName}</div>
          </div>
          <div>
            <div class="pkg-v">${pkgPrice}</div>
          </div>
        </div>
      </div>

      <!-- SYSTEM CAPACITY -->
      <div class="sw anim">
        <div class="mc-row">
          <div class="mc">
            <div class="mc-v">${invoice.system_size_kwp ? invoice.system_size_kwp : (estimatePanelQty && estimatePanelRating ? ((estimatePanelQty*estimatePanelRating)/1000).toFixed(1) : '—')}<span class="u"> kWp</span></div>
            <div class="mc-l">System Size</div>
          </div>
          <div class="mc">
            <div class="mc-v">${invoice.panel_qty || estimatePanelQty || '—'}<span class="u"> × ${estimatePanelRating || 650}W</span></div>
            <div class="mc-l">Panels</div>
          </div>
          <div class="mc">
            <div class="mc-v" style="font-size:13px">${hasTigerNeo3 ? 'Tiger Neo 3' : (items[0] && items[0].product_name ? items[0].product_name.split(' ').slice(0,3).join(' ') : 'Solar')}</div>
            <div class="mc-l">Panel Type</div>
          </div>
          <div class="mc">
            <div class="mc-v" id="solarEstimateSunPeakValue" style="color:var(--gp)">${storedSunPeakHour}<span class="u">h</span></div>
            <div class="mc-l">Sun Peak</div>
          </div>
        </div>
      </div>

      ${showSolarSavingsSection ? `
      <!-- MONTHLY BILL PROJECTION -->
      <div class="sw anim">
        <div class="sec-label">Monthly Bill Projection</div>
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--g100)">
            <div>
              <div style="font-size:9px;color:var(--g500);font-weight:700;text-transform:uppercase;letter-spacing:.07em">Total Solar Generation</div>
              <div id="solarEstimateTotalGeneration" style="font-size:22px;font-weight:800;color:var(--gp);letter-spacing:-.5px;line-height:1;margin-top:2px">${solarOutputKwh !== null ? solarOutputKwh + ' kWh/mo' : '—'}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:9px;color:var(--g500);font-weight:700;text-transform:uppercase;letter-spacing:.07em">System Size</div>
              <div id="solarEstimateSystemSize" style="font-size:14px;font-weight:700;color:var(--g700);line-height:1;margin-top:2px">${systemSizeLabel}</div>
            </div>
          </div>
          <div class="ba" style="margin-bottom:8px">
            <div class="ba-p bef">
              <div class="lbl">Before Solar</div>
              <div class="amt" id="solarEstimateBeforeValue">${beforeSolarBill !== null ? 'RM ' + beforeSolarBill.toFixed(2) : '—'}</div>
              <div class="sub">Monthly Bill</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px">
              <span class="tag" id="solarEstimateSavingPercentValue">${estimatedMonthlySaving && beforeSolarBill ? `−${Math.round(estimatedMonthlySaving/beforeSolarBill*100)}%` : '—'}</span>
              <span style="font-size:14px;color:var(--gp);font-weight:700">→</span>
            </div>
            <div class="ba-p aft">
              <div class="lbl">After Solar</div>
              <div class="amt" id="solarEstimateAfterValue">${afterSolarBill !== null ? 'RM ' + afterSolarBill.toFixed(2) : '—'}</div>
              <div class="sub">Monthly Bill</div>
            </div>
          </div>
          <div>
            <div class="spark-r">
              <div class="spark-l">Before</div>
              <div class="spark-bar">
                <div class="spark-fill" style="width:100%;background:var(--g300);display:flex;align-items:center;padding-left:7px">
                  <span id="solarEstimateBeforeBarLabel" style="font-size:9px;font-weight:700;color:var(--g500)">RM ${beforeSolarBill !== null ? beforeSolarBill.toFixed(2) : '—'}</span>
                </div>
              </div>
            </div>
            <div class="spark-r" style="margin-bottom:0">
              <div class="spark-l">After</div>
              <div class="spark-bar">
                <div class="spark-fill" id="solarEstimateAfterBarFill" style="width:${afterSolarBill && beforeSolarBill ? Math.round(afterSolarBill/beforeSolarBill*100) : 30}%;background:var(--gp);display:flex;align-items:center;padding-left:7px">
                  <span id="solarEstimateAfterBarLabel" style="font-size:9px;font-weight:700;color:#fff">RM ${afterSolarBill !== null ? afterSolarBill.toFixed(2) : '—'}</span>
                </div>
              </div>
            </div>
          </div>
          <div class="div"></div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-size:9px;color:var(--g500);font-weight:700;text-transform:uppercase;letter-spacing:.07em">Monthly Savings</div>
              <div id="solarEstimateSavingValue" style="font-size:24px;font-weight:800;color:var(--gp);letter-spacing:-.6px;line-height:1;margin-top:2px">${estimatedMonthlySaving !== null ? 'RM ' + estimatedMonthlySaving.toFixed(2) : '—'}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:9px;color:var(--g500);font-weight:700;text-transform:uppercase;letter-spacing:.07em">Year 1 Return</div>
              <div id="solarEstimateYearOneValue" style="font-size:18px;font-weight:800;color:#d97706;line-height:1;margin-top:2px">${estimatedMonthlySaving !== null ? 'RM ' + (estimatedMonthlySaving*12).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</div>
            </div>
          </div>
          ${showInteractiveControls ? `
          <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:space-between">
            <div id="solarEstimateStatus" style="flex:1;min-width:180px;background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;border-radius:4px;padding:6px 9px;font-size:9.5px;font-weight:700;line-height:1.35">Use Recalculate to update this estimate.</div>
            <button type="button" onclick="openSolarEstimatePrompt()" class="btn btn-out no-print" style="width:auto;padding:8px 11px;font-size:10px;text-transform:uppercase;letter-spacing:.06em">Recalculate</button>
          </div>
          <div id="solarEstimateAssumptionHint" style="display:block;margin-top:6px;font-size:9px;color:var(--g500);font-weight:600;line-height:1.4">AFA 0.0000 RM/kWh · Sun peak ${Number(storedSunPeakHour).toFixed(2)}h · Day usage ${Number(storedMorningUsagePercent).toFixed(0)}%.</div>
          <div id="solarMatchedBillHint" style="display:none;margin-top:6px;font-size:9px;color:var(--wtx);font-weight:700;line-height:1.4"></div>
          <div id="solarBillCycleHint" style="display:none;margin-top:6px;font-size:9px;color:var(--g500);font-weight:600;line-height:1.4"></div>
          <div id="solarEstimateSaveHint" style="display:none;margin-top:6px;font-size:9px;color:var(--gp);font-weight:700;line-height:1.4"></div>
          <div style="margin-top:6px;display:flex;gap:6px" class="no-print">
            <button type="button" id="solarBillCycleBtn_fullMonth" onclick="setSolarBillCycleMode('fullMonth')" class="sig-resign" style="margin-top:0;flex:1">Full Month</button>
            <button type="button" id="solarBillCycleBtn_under28Days" onclick="setSolarBillCycleMode('under28Days')" class="sig-resign" style="margin-top:0;flex:1">&lt;28 Days</button>
          </div>
          ` : ''}
          <div class="disclaimer">
            <strong>Simulation Disclaimer</strong> · Eternalgy Solar Simulator V3 – ATAP Edition. Results are estimates only and not guaranteed. Actual performance may vary due to weather, shading, roof orientation, and consumption patterns.
          </div>
        </div>
      </div>
      ` : ''}

      <!-- ENERGY FLOW -->
      ${!isCommercialPackage && !isEvCharger && !hasBatteryItem ? `
      <div class="sw anim">
        <div class="sec-label">Energy Flow · Monthly</div>
        <div class="card">
          <div class="chart-block" style="margin-bottom:6px">
            <div class="chart-title">Total Solar Generation <span class="v" id="solarEstimateOutputKwh">${solarOutputKwh !== null ? `${solarOutputKwh} kWh` : '—'}</span></div>
            <div class="chart-foot" style="margin-top:2px;margin-bottom:8px">
              <span class="l">Where Solar Generation Goes</span>
              <span class="v"></span>
            </div>
            <div class="chart-row">
              <span class="chart-l" id="solarEstimateSelfUsePct">Offset by Solar</span>
              <span class="chart-r" style="color:var(--gp)" id="solarEstimateSelfUseKwh">${selfUseKwh !== null ? `${selfUseKwh} kWh` : '—'}</span>
            </div>
            <div class="chart-bar"><div class="chart-fill" id="solarEstimateSelfUseBarFill" style="width:${selfUsePct !== null ? selfUsePct : 0}%;background:var(--gp)"></div></div>
            <div class="chart-row" style="margin-top:6px">
              <span class="chart-l" id="solarEstimateFitPct">Export to FiT</span>
              <span class="chart-r" style="color:#d97706" id="solarEstimateFitKwh">${fitKwh !== null ? `${fitKwh} kWh` : '—'}</span>
            </div>
            <div class="chart-bar" style="background:#fef3c7"><div class="chart-fill" id="solarEstimateFitBarFill" style="width:${energyFlowDisplay ? energyFlowDisplay.fitPct : 0}%;background:#d97706"></div></div>
            <div class="chart-row" style="margin-top:6px">
              <span class="chart-l" id="solarEstimateBackupLabel">Credit Next Month (Backup)</span>
              <span class="chart-r" style="color:#3b82f6" id="solarEstimateGridBackupKwh">${backupGenerationKwh !== null ? `${backupGenerationKwh} kWh` : '—'}</span>
            </div>
            <div class="chart-bar" style="background:var(--ib)"><div class="chart-fill" id="solarEstimateGridBackupBarFill" style="width:${backupGenerationPct}%;background:#60a5fa"></div></div>
            <div class="chart-foot">
              <span class="l">FiT Income</span>
              <span class="v" style="color:#d97706" id="solarEstimateFitIncome">${fitIncome !== null ? `+RM ${fitIncome.toFixed(2)}` : '—'}</span>
            </div>
          </div>
          <div class="chart-block">
            <div class="chart-title">Home Consumption <span class="v" id="solarEstimateHomeConsumptionKwh">${homeConsumptionKwh !== null ? `${homeConsumptionKwh} kWh` : '—'}</span></div>
            <div class="chart-row">
              <span class="chart-l" id="solarEstimateGridImportPct">Grid Import</span>
              <span class="chart-r" style="color:#3b82f6" id="solarEstimateGridImportKwh">${gridImportKwh !== null ? `${gridImportKwh} kWh` : '—'}</span>
            </div>
            <div class="chart-bar" style="background:var(--ib)"><div class="chart-fill" id="solarEstimateGridImportBarFill" style="width:${gridImportPct !== null ? gridImportPct : 0}%;background:#60a5fa"></div></div>
            <div class="chart-row" style="margin-top:6px">
              <span class="chart-l" id="solarEstimateSolarSharePct">Offset by Solar</span>
              <span class="chart-r" style="color:var(--gp)" id="solarEstimateSolarShareKwh">${solarShareKwh !== null ? `${solarShareKwh} kWh` : '—'}</span>
            </div>
            <div class="chart-bar"><div class="chart-fill" id="solarEstimateSolarShareBarFill" style="width:${solarSharePct !== null ? solarSharePct : 0}%;background:var(--gp)"></div></div>
          </div>
        </div>
      </div>
      ` : ''}

      <!-- LINE ITEMS -->
      <div class="sw anim">
        <div class="sec-label">Quotation Summary</div>
        <div class="card" style="padding:0;overflow:hidden">
          <div class="tbl" style="border:none;border-radius:0">
            <div class="tbl-h" style="grid-template-columns:1fr 60px 70px 80px">
              <span>Item</span>
              <span style="text-align:right">Qty</span>
              <span style="text-align:right">Unit</span>
              <span style="text-align:right">Total</span>
            </div>
            ${itemsHtml}
          </div>
        </div>
      </div>

      <!-- TOTALS -->
      <div class="sw anim">
        <div class="totals">
          <div class="totals-h">
            <div>
              <div class="totals-ht">${isConfirmed ? 'Total Payable' : 'Quoted Total'}</div>
              <div style="font-size:9px;color:#9ca3af;margin-top:1px">${sstAmount > 0 ? 'Includes SST' : 'All prices as listed'}</div>
            </div>
            <div class="totals-hv">${fmtMoney(totalAmount)}</div>
          </div>
          <div class="totals-b">
            <div class="totals-row">
              <span class="lbl">Subtotal (Goods)</span>
              <span class="val">${fmtMoney(subtotal)}</span>
            </div>
            ${discountAmount > 0 ? `
            <div class="totals-row disc">
              <span class="lbl">Less: Promo Discount</span>
              <span class="val">−${fmtMoney(discountAmount)}</span>
            </div>` : ''}
            ${voucherAmount > 0 ? `
            <div class="totals-row">
              <span class="lbl">Voucher Credit</span>
              <span class="val" style="color:var(--gp)">−${fmtMoney(voucherAmount)}</span>
            </div>` : ''}
            ${cnyPromoAmount > 0 ? `
            <div class="totals-row">
              <span class="lbl">CNY 2026 Reward</span>
              <span class="val" style="color:var(--gp)">−${fmtMoney(cnyPromoAmount)}</span>
            </div>` : ''}
            ${holidayBoostAmount > 0 ? `
            <div class="totals-row">
              <span class="lbl">Holiday Boost Reward</span>
              <span class="val" style="color:var(--gp)">−${fmtMoney(holidayBoostAmount)}</span>
            </div>` : ''}
            ${earnNowRebateAmount > 0 ? `
            <div class="totals-row">
              <span class="lbl">Earn Now Rebate</span>
              <span class="val" style="color:var(--gp)">−${fmtMoney(earnNowRebateAmount)}</span>
            </div>` : ''}
            ${earthMonthGoGreenBonusAmount > 0 ? `
            <div class="totals-row">
              <span class="lbl">Earth Month Go Green Bonus</span>
              <span class="val" style="color:var(--gp)">−${fmtMoney(earthMonthGoGreenBonusAmount)}</span>
            </div>` : ''}
            ${sstAmount > 0 ? `
            <div class="totals-row">
              <span class="lbl">SST (8%)</span>
              <span class="val">${fmtMoney(sstAmount)}</span>
            </div>` : ''}
            <div class="totals-row grand">
              <span class="lbl">Total ${isConfirmed ? 'Due' : 'Quoted'}</span>
              <span class="val">${fmtMoney(totalAmount)}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- PAYMENT TERMS -->
      <div class="sw anim">
        <div class="sec-label">Payment Terms</div>
        <div class="card" style="padding:0;overflow:hidden">
          <div style="background:#f8faf8;padding:6px 12px;border-bottom:1px solid var(--g100);display:flex;justify-content:space-between;gap:8px;align-items:center">
            <span style="font-size:9.5px;font-weight:700;color:var(--g400);text-transform:uppercase;letter-spacing:.07em">Payment Schedule</span>
            <span style="font-size:9px;font-weight:700;color:var(--gp);text-transform:uppercase;letter-spacing:.05em">${paymentTermsSchedule.effectiveLabel}</span>
          </div>
          ${paymentTermsRowsHtml}
          ${paymentTermsPreviewButtonHtml ? `<div class="payterm-preview-wrap">${paymentTermsPreviewButtonHtml}</div>` : ''}
        </div>
      </div>

      ${hasTigerNeo3 && tigerNeoProposalUrl && !isA4Preview ? `
      <div class="sw anim">
        <a class="btn btn-out no-print" data-track-button="Tiger Neo 3 Promotional Banner" href="${tigerNeoProposalUrl}" target="_blank" rel="noopener noreferrer" style="text-align:center;text-decoration:none;display:block">
          Generate Tiger Neo 3 Proposal →
        </a>
      </div>
      ` : ''}

      ${invoice.warranties && invoice.warranties.length > 0 ? `
      <!-- WARRANTY -->
      <div class="sw anim">
        <div class="sec-label">Warranty &amp; Guarantees</div>
        <div class="card" style="padding:0;overflow:hidden">
          <div style="background:#f8faf8;padding:6px 12px;border-bottom:1px solid var(--g100)">
            <span style="font-size:9.5px;font-weight:700;color:var(--g400);text-transform:uppercase;letter-spacing:.07em">Included Warranties</span>
          </div>
          <div style="padding:8px 12px">
            ${invoice.warranties.map((w, idx) => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;${idx < invoice.warranties.length - 1 ? 'border-bottom:1px solid var(--g100);' : ''}">
                <div>
                  <div style="font-size:11.5px;font-weight:700;color:var(--g900)">${w.name || 'Product'}</div>
                  <div style="font-size:9.5px;color:var(--g500);font-weight:500;margin-top:1px">${w.terms || ''}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      ` : ''}

      ${bankName ? `
      <!-- PAYMENT DETAILS -->
      <div class="sw anim">
        <div class="sec-label">Payment Details</div>
        <div class="card" style="padding:0;overflow:hidden">
          <div style="background:#f8faf8;padding:6px 12px;border-bottom:1px solid var(--g100)">
            <span style="font-size:9.5px;font-weight:700;color:var(--g400);text-transform:uppercase;letter-spacing:.07em">Bank Transfer</span>
          </div>
          <div style="padding:8px 12px">
            <div class="pay-row"><span class="pay-l">Bank</span><span class="pay-v">${bankName}</span></div>
            ${bankAccountName ? `<div class="pay-row"><span class="pay-l">Account Name</span><span class="pay-v">${bankAccountName}</span></div>` : ''}
            ${bankAccountNo ? `<div class="pay-row"><span class="pay-l">Account No</span><span class="pay-v mono">${bankAccountNo}</span></div>` : ''}
            <div class="pay-row"><span class="pay-l">Reference</span><span class="pay-v mono" style="color:var(--gp)">${publicDocumentNumber !== '—' ? publicDocumentNumber : (invoice.bubble_id || '—')}</span></div>
          </div>
        </div>
      </div>
      ` : ''}

      <!-- SIGNATURE -->
      <div class="sw anim">
        <div class="sec-label">Customer Acknowledgement</div>
        <div class="sig-block">
          <div class="sig-header"><div class="sig-hl">Digital Signature</div></div>
          <div class="sig-body">
            ${invoice.customer_signature ? `
              <img src="${invoice.customer_signature.startsWith('//') ? 'https:' + invoice.customer_signature : invoice.customer_signature}" alt="Signature" class="sig-img"/>
            ` : (showInteractiveControls ? `
              <button onclick="openSignatureModal()" class="btn btn-grn" style="margin-bottom:6px">Sign this ${titleLabel}</button>
            ` : `
              <div class="sig-empty">No signature on file</div>
            `)}
            <div class="sig-name">${invoice.customer_name || 'Customer'}</div>
            ${invoice.signature_date ? `<div class="sig-date">Signed ${formatInvoiceDate(invoice.signature_date)}</div>` : ''}
            ${invoice.customer_signature && showInteractiveControls ? `
              <button onclick="resetSignature()" class="sig-resign no-print">Re-sign</button>
            ` : ''}
          </div>
        </div>
      </div>

      <!-- TERMS -->
      ${terms ? `
      <div class="sw anim">
        <div class="sec-label">Terms &amp; Conditions</div>
        <div class="card">
          <p style="font-size:9.5px;color:var(--g500);line-height:1.55">${terms.replace(/<br\s*\/?>/gi, ' ').replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim()}</p>
        </div>
      </div>
      ` : ''}

      <!-- CERTIFICATIONS -->
      <div class="sw anim">
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
      </div>

      <!-- FOOTER -->
      <div class="sw anim">
        <div style="text-align:center;padding:10px 0 16px;border-top:1px solid var(--g200);margin-top:6px">
          <div style="font-size:9px;color:var(--g500);font-weight:700;margin-bottom:2px;letter-spacing:.06em">${(companyName || 'ETERNALGY SOLAR SDN. BHD.').toUpperCase()}</div>
          ${companyAddress ? `<div style="font-size:8.5px;color:var(--g400);font-weight:500">${companyAddress.replace(/\\n/g,' · ')}</div>` : ''}
          <div style="font-size:8.5px;color:var(--g400);font-weight:500;margin-top:1px">${[companyPhone, companyEmail].filter(Boolean).join(' · ')}</div>
        </div>
      </div>

    </div><!-- /body -->
  </div><!-- /app -->

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
