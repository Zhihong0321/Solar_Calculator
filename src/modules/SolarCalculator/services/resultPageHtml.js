/**
 * WHAT:    Server-rendered HTML page for one domestic solar calculation result.
 * WHY:     The live /domestic page is a client React app. External callers need
 *          one API response that is already a complete result page.
 * OWNS:    Display-model derivation from calculateSolarSavings output, and the
 *          self-contained HTML/CSS for that snapshot page.
 * NOT:     Does not run tariff/package math (→ solarCalculatorService.js)
 *          Does not serve the interactive planner (→ public/domestic-v4.html)
 * DANGER:  Display formulas here must stay aligned with domestic-v4.html Step 4.
 *          Do not invent a second savings formula — read billCycleModes + details.
 */

const ACCENT = {
  primary: '#16a34a',
  light: '#22c55e',
  bg: '#dcfce7',
  dark: '#14532d',
  border: '#86efac'
};

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function fmt(value, digits = 2) {
  return toNumber(value).toLocaleString('en-MY', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveCompactScaleMax(...values) {
  const peak = Math.max(...values.map((value) => Math.abs(toNumber(value))), 0);
  if (peak <= 30) return 30;
  if (peak <= 50) return 50;
  return 80;
}

function pctWidth(value, max) {
  if (!(max > 0)) return 0;
  return clamp((Math.max(0, toNumber(value)) / max) * 100, 0, 100);
}

function buildDisplayModel(result, billCycleModes, options = {}) {
  const cycleKey = options.cycle === 'under28Days' ? 'under28Days' : 'fullMonth';
  const activeCycle = (billCycleModes && billCycleModes[cycleKey]) || billCycleModes?.fullMonth || {};
  const details = result?.details || {};
  const battery = details.battery || {};
  const beforeBreakdown = result?.billBreakdownComparison?.before
    || details.billBreakdown?.before
    || null;
  const afterBreakdown = result?.billBreakdownComparison?.after
    || details.billBreakdown?.after
    || null;
  const breakdown = result?.savingsBreakdown || {};
  const afaRate = toNumber(options.afaRate, toNumber(result?.config?.afaRate));

  const usageKwh = toNumber(details.monthlyUsageKwh, toNumber(beforeBreakdown?.eeiUsageKwh));
  const storedAfa = toNumber(beforeBreakdown?.afa);
  const billWithAfaFromApi = toNumber(details.billBefore, toNumber(beforeBreakdown?.total));
  const tnbAtAfa0 = toNumber(beforeBreakdown?.totalBase, billWithAfaFromApi - storedAfa);
  const afaAdjustment = usageKwh * afaRate;
  const billWithSelectedAfa = tnbAtAfa0 + afaAdjustment;
  const afterBill = toNumber(activeCycle.payableAfterSolar, toNumber(details.estimatedPayableAfterSolar));
  const percentageSaved = billWithSelectedAfa > 0
    ? Math.round((1 - afterBill / billWithSelectedAfa) * 100)
    : 0;

  const generated = toNumber(details.monthlySolarGeneration);
  const usage = toNumber(details.monthlyUsageKwh);
  const exportKwh = toNumber(details.exportKwh);
  const gridImport = toNumber(details.actualUsageForEeiKwh);
  const batteryDischarge = toNumber(battery.monthlyStoredKwh);
  const backupGeneration = toNumber(details.backupGenerationKwh);
  const solarToHome = Math.max(0, usage - gridImport);
  const directSolar = Math.max(0, solarToHome - batteryDischarge);
  const offsetBySolarKwh = Math.max(0, directSolar + batteryDischarge);
  const selfPct = generated > 0 ? Math.round((offsetBySolarKwh / generated) * 100) : 0;
  const exportPct = generated > 0 ? Math.round((exportKwh / generated) * 100) : 0;
  const fromSolarPct = usage > 0 ? Math.round((solarToHome / usage) * 100) : 0;
  const backupPct = generated > 0 ? Math.min(100, Math.round((backupGeneration / generated) * 100)) : 0;
  const gridImportPct = Math.max(0, 100 - fromSolarPct);

  const exportRm = toNumber(breakdown.exportCredit);
  const energyBefore = toNumber(beforeBreakdown?.usage) + toNumber(beforeBreakdown?.network) + toNumber(beforeBreakdown?.capacity);
  const energyAfter = toNumber(afterBreakdown?.usage) + toNumber(afterBreakdown?.network) + toNumber(afterBreakdown?.capacity);
  const feesBefore = toNumber(beforeBreakdown?.sst) + toNumber(beforeBreakdown?.kwtbb) + toNumber(beforeBreakdown?.retail);
  const feesAfter = toNumber(afterBreakdown?.sst) + toNumber(afterBreakdown?.kwtbb) + toNumber(afterBreakdown?.retail);
  const eeiBefore = Math.abs(toNumber(beforeBreakdown?.eei));
  const eeiAfter = Math.abs(toNumber(details.actualEei, afterBreakdown?.eei));
  const eeiSaving = toNumber(breakdown.eeiSaving);
  const eeiRatePerKwh = toNumber(details.actualEeiRatePerKwh);
  const netImportKwh = Math.max(0, toNumber(details.actualUsageForEeiKwh));
  const totalReduce = toNumber(breakdown.billReduction) + eeiSaving;
  const totalSavings = toNumber(activeCycle.totalSavings, toNumber(result?.monthlySavings));

  const annualBase = totalSavings * 12;
  const escalation = 0.03;
  const projectionPoints = [];
  let cumulative = 0;
  for (let year = 0; year <= 25; year += 1) {
    projectionPoints.push({ year, cumulative });
    if (year < 25) {
      cumulative += annualBase * Math.pow(1 + escalation, year);
    }
  }
  const final25YearValue = Math.round(projectionPoints[25].cumulative / 1000);

  return {
    cycleKey,
    cycleLabel: cycleKey === 'under28Days' ? '<28 Days Bill Cycle' : 'Full Month Bill Cycle',
    confidence: toNumber(result?.confidenceLevel),
    totalSavings,
    afterBill,
    tnbAtAfa0,
    afaAdjustment,
    billWithSelectedAfa,
    percentageSaved,
    selectedAfaSen: afaRate * 100,
    usageKwh,
    generated,
    usage,
    exportKwh,
    gridImport,
    batteryDischarge,
    backupGeneration,
    solarToHome,
    offsetBySolarKwh,
    selfPct,
    exportPct,
    fromSolarPct,
    backupPct,
    gridImportPct,
    exportRm,
    exportRate: toNumber(details.effectiveExportRate),
    energyBefore,
    energyAfter,
    feesBefore,
    feesAfter,
    eeiBefore,
    eeiAfter,
    eeiSaving,
    eeiRatePerKwh,
    netImportKwh,
    totalImportAfterSolarKwh: Math.max(0, toNumber(details.netUsageKwh, details.afterUsageKwh)),
    totalExportKwh: Math.max(0, exportKwh),
    billReduction: toNumber(breakdown.billReduction),
    totalReduce,
    projectionPoints,
    final25YearValue,
    paybackPeriod: result?.paybackPeriod == null ? '—' : String(result.paybackPeriod),
    finalSystemCost: toNumber(result?.finalSystemCost),
    systemCostBeforeDiscount: toNumber(result?.systemCostBeforeDiscount),
    totalDiscountAmount: toNumber(result?.totalDiscountAmount),
    systemSizeKwp: toNumber(result?.systemSizeKwp),
    actualPanels: toNumber(result?.actualPanels),
    recommendedPanels: toNumber(result?.recommendedPanels),
    panelWattage: toNumber(result?.config?.panelType),
    solarConfig: result?.solarConfig || '',
    packageName: result?.selectedPackage?.packageName || 'No matching package',
    packagePrice: toNumber(result?.selectedPackage?.price),
    requiresSedaFee: Boolean(result?.requiresSedaFee),
    billItems: Array.isArray(result?.billBreakdownComparison?.items)
      ? result.billBreakdownComparison.items
      : [],
    billDelta: toNumber(result?.billBreakdownComparison?.totals?.delta),
    sunPeakHour: toNumber(result?.config?.sunPeakHour),
    morningUsage: toNumber(result?.config?.morningUsage),
    systemPhase: toNumber(result?.config?.systemPhase, 3),
    inverterType: result?.config?.inverterType || 'string',
    batterySize: toNumber(result?.config?.batterySize),
    requestedBill: toNumber(options.requestedBill)
  };
}

function renderFlowBar(label, pct, kwh, color, bg) {
  return `
    <div class="flow-bar">
      <div class="flow-bar-row">
        <span>${escapeHtml(label)}</span>
        <strong style="color:${color}">${escapeHtml(fmt(kwh))} kWh</strong>
      </div>
      <div class="track" style="background:${bg}">
        <div class="fill" style="width:${pct}%;background:${color}"></div>
      </div>
    </div>`;
}

function renderCompareBar(label, beforeValue, afterValue, colorAfter, scaleMax) {
  const beforeWidth = pctWidth(beforeValue, scaleMax);
  const afterWidth = pctWidth(afterValue, scaleMax);
  return `
    <div class="compare-block">
      <div class="compare-label">${escapeHtml(label)}</div>
      <div class="compare-pair">
        <div class="compare-side">
          <div class="tiny muted">Before</div>
          <div class="tiny muted">After</div>
        </div>
        <div class="compare-bars">
          <div class="money-row">
            <div class="track gray"><div class="fill" style="width:${beforeWidth}%;background:#d1d5db;min-width:${toNumber(beforeValue) > 0 ? 8 : 0}px"></div></div>
            <strong class="muted">RM ${escapeHtml(fmt(beforeValue))}</strong>
          </div>
          <div class="money-row">
            <div class="track green"><div class="fill" style="width:${afterWidth}%;background:${colorAfter || ACCENT.primary};min-width:${toNumber(afterValue) > 0 ? 8 : 0}px"></div></div>
            <strong class="green">RM ${escapeHtml(fmt(afterValue))}</strong>
          </div>
        </div>
      </div>
    </div>`;
}

function renderProjectionSvg(model) {
  const width = 320;
  const height = 150;
  const paddingLeft = 36;
  const paddingRight = 12;
  const paddingTop = 10;
  const paddingBottom = 26;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const maxY = 160000;
  const xScale = (year) => paddingLeft + (year / 25) * chartWidth;
  const yScale = (amount) => paddingTop + chartHeight - (Math.min(amount, maxY) / maxY) * chartHeight;
  const points = model.projectionPoints;
  const savingsPath = `M ${points.map((point) => `${xScale(point.year)},${yScale(point.cumulative)}`).join(' L ')}`;
  const areaPath = `${savingsPath} L ${xScale(25)},${yScale(0)} L ${xScale(0)},${yScale(0)} Z`;
  const costLineY = yScale(model.finalSystemCost);
  const breakEvenX = xScale(toNumber(model.paybackPeriod, 0));
  const gridLines = [0, 50000, 100000, 150000].map((value) => `
    <line x1="${paddingLeft}" y1="${yScale(value)}" x2="${width - paddingRight}" y2="${yScale(value)}" stroke="#f3f4f6" stroke-width="1"></line>
    <text x="${paddingLeft - 4}" y="${yScale(value) + 4}" text-anchor="end" font-size="9" fill="#9ca3af">${value === 0 ? '0' : `${value / 1000}k`}</text>
  `).join('');
  const yearLabels = [0, 5, 10, 15, 20, 25].map((year) => `
    <text x="${xScale(year)}" y="${height - paddingBottom + 13}" text-anchor="middle" font-size="9" fill="#9ca3af">${year === 0 ? 'Now' : `${year}y`}</text>
  `).join('');

  return `
    <svg width="100%" viewBox="0 0 ${width} ${height}" style="overflow:visible">
      ${gridLines}
      <path d="${areaPath}" fill="${ACCENT.bg}" opacity="0.5"></path>
      <path d="${savingsPath}" fill="none" stroke="${ACCENT.primary}" stroke-width="2.5" stroke-linecap="round"></path>
      <line x1="${paddingLeft}" y1="${costLineY}" x2="${width - paddingRight}" y2="${costLineY}" stroke="#9ca3af" stroke-width="1.5" stroke-dasharray="4 3"></line>
      <line x1="${breakEvenX}" y1="${paddingTop}" x2="${breakEvenX}" y2="${height - paddingBottom}" stroke="${ACCENT.light}" stroke-width="1" stroke-dasharray="2 2" opacity="0.7"></line>
      <circle cx="${breakEvenX}" cy="${costLineY}" r="5" fill="${ACCENT.light}" stroke="${ACCENT.primary}" stroke-width="1.5"></circle>
      <text x="${breakEvenX + 7}" y="${costLineY - 7}" font-size="9" fill="${ACCENT.primary}" font-weight="700">${escapeHtml(model.paybackPeriod)}yr payback</text>
      <line x1="${paddingLeft}" y1="${height - paddingBottom}" x2="${width - paddingRight}" y2="${height - paddingBottom}" stroke="#e5e7eb" stroke-width="1"></line>
      ${yearLabels}
      <text x="${xScale(25) - 4}" y="${yScale(points[25].cumulative) - 8}" text-anchor="end" font-size="9" fill="${ACCENT.primary}" font-weight="700">RM ${escapeHtml(String(model.final25YearValue))}k</text>
    </svg>`;
}

function renderBillRows(model) {
  return model.billItems.map((item, index) => {
    const delta = toNumber(item.delta);
    return `
      <div class="grid-row ${index % 2 ? 'alt' : ''}">
        <span>${escapeHtml(item.label || item.key || '')}</span>
        <span class="right muted">RM ${escapeHtml(fmt(item.before))}</span>
        <span class="right muted">RM ${escapeHtml(fmt(item.after))}</span>
        <span class="right ${delta > 0 ? 'green' : 'muted'}">${delta > 0 ? '−' : ''}RM ${escapeHtml(fmt(Math.abs(delta)))}</span>
      </div>`;
  }).join('');
}

function renderErrorPage(message) {
  const safe = escapeHtml(message || 'Failed to calculate solar savings');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Solar result error</title>
  <style>
    body { margin:0; font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,sans-serif; background:#bbf7d0; color:#111827; }
    .wrap { max-width:430px; margin:0 auto; min-height:100vh; background:#f1f5f1; padding:28px 18px; }
    .card { background:#fff; border-radius:16px; padding:20px; }
    h1 { font-size:20px; margin:0 0 8px; }
    p { color:#6b7280; margin:0; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>Could not build result page</h1>
      <p>${safe}</p>
    </div>
  </div>
</body>
</html>`;
}

function renderSolarResultPage(result, billCycleModes, options = {}) {
  const model = buildDisplayModel(result, billCycleModes, options);
  const afaRmSign = model.afaAdjustment >= 0 ? '+' : '−';
  const afaSenSign = model.selectedAfaSen >= 0 ? '+' : '';
  const barMax = Math.max(model.tnbAtAfa0, model.billWithSelectedAfa, model.afterBill, 1);
  const maxBar = Math.max(model.energyBefore, model.exportRm, 1) * 1.1;
  const eeiNote = model.netImportKwh <= 0
    ? 'Net import <= 0 kWh, EEI becomes zero'
    : `${fmt(model.netImportKwh)} kWh × RM ${fmt(Math.abs(model.eeiRatePerKwh), 6)}/kWh = RM ${fmt(model.eeiAfter)}`;
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const filled = (model.confidence / 100) * circumference;
  const requestedBillLabel = model.requestedBill > 0 ? `RM ${fmt(model.requestedBill, 0)} bill` : 'Solar result';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Solar Result · ${escapeHtml(requestedBillLabel)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing:border-box; margin:0; padding:0; }
    html, body { background:#bbf7d0; }
    body {
      font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,sans-serif;
      color:#111827;
      display:flex;
      justify-content:center;
      min-height:100vh;
    }
    #root {
      width:100%;
      max-width:430px;
      min-height:100vh;
      background:#f1f5f1;
      padding-bottom:28px;
    }
    @media (min-width:500px) {
      body { padding:28px 16px; align-items:flex-start; }
      #root { border-radius:36px; overflow:hidden; box-shadow:0 32px 80px rgba(0,0,0,.22); }
    }
    .pad { padding:10px 14px 0; }
    .card { background:#fff; border-radius:16px; padding:18px 16px; }
    .eyebrow { font-size:11px; color:#9ca3af; font-weight:600; text-transform:uppercase; letter-spacing:.05em; }
    .muted { color:#6b7280; }
    .green { color:${ACCENT.primary}; }
    .hero { background:#0d1f0f; border-radius:20px; overflow:hidden; padding:20px 20px 18px; }
    .hero-top { display:flex; justify-content:space-between; align-items:flex-start; }
    .hero-kicker { font-size:10px; color:${ACCENT.light}; font-weight:700; text-transform:uppercase; letter-spacing:.08em; }
    .hero-value { font-size:58px; font-weight:800; color:${ACCENT.light}; letter-spacing:-2px; line-height:1; margin-top:6px; }
    .split { display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; margin-bottom:8px; }
    .pill { border-radius:12px; padding:12px 6px; text-align:center; min-width:0; }
    .pill h4 { font-size:9px; margin-bottom:4px; line-height:1.3; }
    .pill .n { font-size:16px; font-weight:800; }
    .tag { display:inline-block; background:${ACCENT.bg}; color:${ACCENT.primary}; font-size:11px; font-weight:700; padding:3px 8px; border-radius:20px; }
    .hbar { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
    .hbar .lbl { width:72px; font-size:10px; color:#6b7280; text-align:right; flex-shrink:0; }
    .track { flex:1; height:22px; background:#f3f4f6; border-radius:6px; overflow:hidden; }
    .flow-bar .track, .money-row .track { height:8px; border-radius:4px; }
    .money-row .track { height:26px; border-radius:5px; }
    .fill { height:100%; border-radius:inherit; }
    .flow-cols { display:flex; gap:10px; }
    .flow-col { flex:1; background:#f8faf8; border-radius:12px; padding:12px; }
    .flow-bar { margin-bottom:6px; }
    .flow-bar-row { display:flex; justify-content:space-between; margin-bottom:3px; font-size:11px; color:#6b7280; }
    .fit-box { margin-top:8px; background:#fffbeb; border-radius:8px; padding:8px 10px; display:flex; justify-content:space-between; align-items:center; }
    .amber { background:#fffbeb; border:1px solid #fde68a; border-radius:12px; padding:12px; margin-bottom:10px; }
    .green-box { background:${ACCENT.bg}; border:1px solid ${ACCENT.border}; border-radius:12px; padding:12px; margin-bottom:10px; }
    .compare-block { margin-bottom:10px; }
    .compare-label { font-size:12px; color:#374151; font-weight:500; margin-bottom:3px; }
    .compare-pair { display:flex; gap:10px; }
    .compare-side { width:24px; flex-shrink:0; }
    .compare-bars { flex:1; }
    .tiny { font-size:10px; height:26px; line-height:26px; text-align:right; }
    .money-row { display:flex; align-items:center; gap:8px; margin-bottom:3px; }
    .money-row strong { width:72px; flex-shrink:0; text-align:right; font-size:11px; }
    .total-dark { background:#0d1f0f; border-radius:12px; padding:14px 16px; display:flex; justify-content:space-between; align-items:center; }
    .grid-head, .grid-row { display:grid; grid-template-columns:1fr 64px 64px 68px; padding:8px 10px; font-size:11px; }
    .grid-head { background:#f8faf8; font-size:10px; font-weight:700; color:#9ca3af; text-transform:uppercase; }
    .grid-row { border-top:1px solid #f3f4f6; }
    .grid-row.alt { background:#fafafa; }
    .right { text-align:right; }
    .meta { font-size:11px; color:#6b7280; margin-top:5px; }
    .sys-row { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; padding:9px 0; border-top:1px solid #f3f4f6; font-size:13px; }
    .sys-row span { flex:0 1 auto; }
    .sys-row strong { text-align:right; margin-left:auto; }
    .note { font-size:10px; color:#6b7280; margin-bottom:5px; }
  </style>
</head>
<body>
  <div id="root">
    <div class="pad">
      <div class="hero">
        <div class="hero-top">
          <div>
            <div class="hero-kicker">Step 4 · ROI</div>
            <div class="meta">Monthly Savings</div>
          </div>
          <div style="text-align:center">
            <svg width="64" height="64" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="${radius}" fill="none" stroke="#1a3a1a" stroke-width="5"></circle>
              <circle cx="32" cy="32" r="${radius}" fill="none" stroke="${ACCENT.light}" stroke-width="5" stroke-dasharray="${filled} ${circumference}" stroke-linecap="round" transform="rotate(-90 32 32)"></circle>
              <text x="32" y="35" text-anchor="middle" font-size="13" font-weight="800" fill="#fff">${escapeHtml(String(Math.round(model.confidence)))}%</text>
            </svg>
            <div style="font-size:9px;color:#6b7280;margin-top:-2px">Confidence</div>
          </div>
        </div>
        <div class="hero-value">RM ${escapeHtml(fmt(model.totalSavings))}</div>
        <div class="meta">Monthly · ${escapeHtml(model.cycleLabel)}</div>
      </div>
    </div>

    <div class="pad">
      <div class="card">
        <div class="eyebrow" style="margin-bottom:14px">Before vs After · Bill Comparison</div>
        <div class="split">
          <div class="pill" style="background:#f3f4f6">
            <h4 class="muted">TNB Bill (AFA 0)</h4>
            <div class="n muted">RM ${escapeHtml(fmt(model.tnbAtAfa0))}</div>
            <div class="meta">Monthly Bill</div>
          </div>
          <div class="pill" style="background:#fffbeb;border:1px solid #fde68a">
            <h4 style="color:#d97706;font-weight:700">AFA Adjustment</h4>
            <div class="n" style="color:#b45309">${afaRmSign}RM ${escapeHtml(fmt(Math.abs(model.afaAdjustment)))}</div>
            <div class="meta" style="color:#d97706">${afaSenSign}${escapeHtml(model.selectedAfaSen.toFixed(2))} sen/kWh</div>
          </div>
          <div class="pill" style="background:${ACCENT.bg};border:2px solid ${ACCENT.border}">
            <h4 class="green" style="font-weight:700">After Solar</h4>
            <div class="n green">RM ${escapeHtml(fmt(model.afterBill))}</div>
            <div class="meta"><span class="tag">−${escapeHtml(String(model.percentageSaved))}%</span></div>
          </div>
        </div>
        <div style="font-size:11px;color:#6b7280;margin-bottom:12px;text-align:center;line-height:1.45">
          RM ${escapeHtml(fmt(model.tnbAtAfa0))} ${afaRmSign} RM ${escapeHtml(fmt(Math.abs(model.afaAdjustment)))} = RM ${escapeHtml(fmt(model.billWithSelectedAfa))} → RM ${escapeHtml(fmt(model.afterBill))}
          <div style="color:#9ca3af;margin-top:2px">Selected AFA ${afaSenSign}${escapeHtml(model.selectedAfaSen.toFixed(2))} sen/kWh${model.usageKwh > 0 ? ` × ${escapeHtml(fmt(model.usageKwh))} kWh` : ''}</div>
        </div>
        ${[
          { label: 'AFA 0', value: model.tnbAtAfa0, color: '#d1d5db', text: '#6b7280' },
          { label: 'With selected AFA', value: model.billWithSelectedAfa, color: '#fbbf24', text: '#92400e' },
          { label: 'After Solar', value: model.afterBill, color: ACCENT.primary, text: '#fff' }
        ].map((row) => `
          <div class="hbar">
            <div class="lbl">${escapeHtml(row.label)}</div>
            <div class="track">
              <div class="fill" style="width:${pctWidth(row.value, barMax)}%;background:${row.color};display:flex;align-items:center;padding-left:8px">
                <span style="font-size:10px;font-weight:700;color:${row.text};white-space:nowrap">RM ${escapeHtml(fmt(row.value))}</span>
              </div>
            </div>
          </div>`).join('')}
      </div>
    </div>

    <div class="pad">
      <div class="card">
        <div class="eyebrow" style="margin-bottom:14px">⚡ Energy Flow</div>
        <div class="flow-cols">
          <div class="flow-col">
            <div style="font-size:11px;font-weight:700;margin-bottom:2px">☀️ Total Solar Generation</div>
            <div style="font-size:18px;font-weight:800;color:#d97706;margin-bottom:10px">${escapeHtml(fmt(model.generated))} kWh</div>
            <div style="font-size:11px;color:#9ca3af;font-weight:700;margin-bottom:8px">Where Solar Generation Goes</div>
            ${renderFlowBar('Offset by Solar', model.selfPct, model.offsetBySolarKwh, ACCENT.primary, ACCENT.bg)}
            ${renderFlowBar('Export to FiT', model.exportPct, model.exportKwh, '#d97706', '#fef3c7')}
            ${renderFlowBar('Credit Next Month (Backup)', model.backupPct, model.backupGeneration, '#3b82f6', '#eff6ff')}
            <div class="fit-box">
              <div style="font-size:11px;color:#9ca3af">FiT Income</div>
              <div style="font-size:16px;font-weight:800;color:#d97706">+RM ${escapeHtml(fmt(model.exportRm))}</div>
            </div>
          </div>
          <div class="flow-col">
            <div style="font-size:11px;font-weight:700;margin-bottom:2px">🏠 Home Consumption</div>
            <div style="font-size:18px;font-weight:800;margin-bottom:10px">${escapeHtml(fmt(model.usage))} kWh</div>
            ${renderFlowBar('Grid Import', model.gridImportPct, model.gridImport, '#60a5fa', '#eff6ff')}
            ${renderFlowBar('Offset by Solar', model.fromSolarPct, model.solarToHome, ACCENT.primary, ACCENT.bg)}
          </div>
        </div>
      </div>
    </div>

    <div class="pad">
      <div class="card">
        <div class="eyebrow">Savings Breakdown</div>
        <div class="meta" style="margin-bottom:14px">Monthly savings = export income + bill reduction (including EEI)</div>
        <div class="amber">
          <div style="font-size:11px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">💰 Export Income (FiT)</div>
          <div style="display:flex;gap:10px;align-items:center">
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600">FiT Export</div>
              <div class="meta">${escapeHtml(fmt(model.exportKwh))} kWh × RM ${escapeHtml(fmt(model.exportRate, 4))}</div>
            </div>
            <strong style="color:#d97706">+RM ${escapeHtml(fmt(model.exportRm))}</strong>
          </div>
        </div>
        <div class="green-box">
          <div style="font-size:11px;font-weight:700;color:${ACCENT.primary};text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">📉 Bill Reduction</div>
          ${renderCompareBar('Energy + Network + Capacity', model.energyBefore, model.energyAfter, ACCENT.primary, maxBar)}
          ${renderCompareBar('SST + KWTBB + Retail', model.feesBefore, model.feesAfter, ACCENT.primary, resolveCompactScaleMax(model.feesBefore, model.feesAfter))}
          <div class="note">${escapeHtml(eeiNote)}</div>
          ${renderCompareBar('EEI Incentive (TNB)', model.eeiBefore, model.eeiAfter, '#16a34a', resolveCompactScaleMax(model.eeiBefore, model.eeiAfter))}
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
            <span style="font-size:12px;font-weight:600" class="green">Total Reduction</span>
            <span style="font-size:18px;font-weight:800" class="green">RM ${escapeHtml(fmt(model.totalReduce))}</span>
          </div>
        </div>
        <div class="total-dark">
          <div>
            <div class="meta">Income + Reduction</div>
            <div style="font-size:14px;font-weight:700;color:#fff">Total Monthly Savings</div>
          </div>
          <div style="font-size:32px;font-weight:800;color:${ACCENT.light}">RM ${escapeHtml(fmt(model.totalSavings))}</div>
        </div>
      </div>
    </div>

    <div class="pad">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
          <div>
            <div class="eyebrow">25-Year Savings Forecast</div>
            <div style="font-size:26px;font-weight:800;color:${ACCENT.primary};margin-top:2px">RM ${escapeHtml(String(model.final25YearValue))}k+</div>
            <div class="meta">Estimated 25-year return (with 3% annual tariff increase)</div>
          </div>
        </div>
        ${renderProjectionSvg(model)}
      </div>
    </div>

    <div class="pad">
      <div class="card">
        <div class="eyebrow">Recommended Package</div>
        <div style="font-size:16px;font-weight:700;margin:6px 0 2px">${escapeHtml(model.packageName)}</div>
        <div class="meta">${escapeHtml(model.solarConfig)}</div>
        <div class="sys-row"><span class="muted">System size</span><strong>${escapeHtml(fmt(model.systemSizeKwp, 1))} kWp · ${escapeHtml(String(model.actualPanels))} × ${escapeHtml(String(model.panelWattage))}W</strong></div>
        <div class="sys-row"><span class="muted">Phase / inverter</span><strong>${escapeHtml(String(model.systemPhase))}-phase · ${escapeHtml(model.inverterType)}</strong></div>
        <div class="sys-row"><span class="muted">Sun peak / daytime use</span><strong>${escapeHtml(fmt(model.sunPeakHour, 1))} h · ${escapeHtml(fmt(model.morningUsage, 0))}%</strong></div>
        <div class="sys-row"><span class="muted">Battery</span><strong>${model.batterySize > 0 ? `${escapeHtml(fmt(model.batterySize, 0))} kWh` : 'None'}</strong></div>
        <div class="sys-row"><span class="muted">System cost</span><strong>RM ${escapeHtml(fmt(model.finalSystemCost))}</strong></div>
        <div class="sys-row"><span class="muted">Payback</span><strong class="green">${escapeHtml(model.paybackPeriod)} yr</strong></div>
        ${model.requiresSedaFee ? '<div class="note" style="margin-top:10px">This system exceeds the current phase limit. Please note the SEDA oversize registration fee.</div>' : ''}
      </div>
    </div>

    <div class="pad">
      <div class="card">
        <div class="eyebrow" style="margin-bottom:10px">📊 Bill Component Details</div>
        <div style="border:1px solid #f3f4f6;border-radius:10px;overflow:hidden">
          <div class="grid-head">
            <div>Item</div>
            <div class="right">Before</div>
            <div class="right">After</div>
            <div class="right">Savings</div>
          </div>
          ${renderBillRows(model)}
        </div>
        <div class="sys-row"><span class="muted">Bill reduction</span><strong class="green">−RM ${escapeHtml(fmt(model.billDelta))}</strong></div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

module.exports = {
  buildDisplayModel,
  renderSolarResultPage,
  renderErrorPage
};
