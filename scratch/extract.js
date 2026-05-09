const fs = require('fs');

const t = (k) => k;
const fmt = (v) => Number(v||0).toFixed(2);
const toN = (v, fb=0) => { const n = Number(v); return isFinite(n) ? n : fb; };

const descCard = (id) => `<div class="desc-card">Desc</div>`;
const fmtK = v => 'RM ' + Math.round(v);

// Mocks
const tariff = {
    usage_kwh: 950, usage_normal: 180.50, network: 50.00, capacity: 10.00, retail: 5.00,
    eei: -12.00, sst_normal: 20.00, kwtbb_normal: 8.00, bill_total_normal: 480.00, fuel_adjustment: 20.00
};
const afaRate = 0;
const afaCharge = 0;
const total = 480;

const rows = [
    { label: t('bill_energy'), value: tariff.usage_normal },
    { label: t('bill_network'), value: tariff.network },
    { label: t('bill_capacity'), value: tariff.capacity },
    { label: t('bill_retail'), value: tariff.retail },
    { label: t('bill_eei'), value: tariff.eei, note: tariff.eei < 0 ? t('bill_eei_sub') : '' },
    { label: t('bill_sst'), value: tariff.sst_normal },
    { label: t('bill_kwtbb'), value: tariff.kwtbb_normal },
    { label: t('bill_afa'), value: afaCharge, green: afaCharge < 0 },
];

const billBreakdownBody = `
<div style="padding: 0 20px;">
    ${rows.map(r => \`
        <div class="ledger-row">
            <span class="ledger-label">\${r.label}\${r.note ? \` <span style="font-size:10px; color:var(--green-text)">(\${r.note})</span>\` : ''}</span>
            <span class="ledger-value\${r.green ? ' ' : ''}" style="\${r.green ? 'color:var(--green-text)' : ''}">\${fmt(r.value)}</span>
        </div>
    \`).join('')}
    <div class="ledger-total-row">
        <span class="ledger-total-label">\${t('lbl_totalMatched')}</span>
        <span class="ledger-total-value">RM \${fmt(total)}</span>
    </div>
    <div class="usage-badge" style="margin-bottom:20px;">
        <span>⚡</span>
        <span>\${t('lbl_derivedUsage')} \${tariff.usage_kwh} \${t('lbl_kwhMo')}</span>
    </div>
</div>
`;

// ROI Data Mock
const data = {
    details: {
        billBefore: 500, billAfter: 150, actualEeiSaving: 12, exportSaving: 80, billReduction: 350,
        estimatedPayableAfterSolar: 70
    },
    monthlySavings: 430,
    confidenceLevel: 92,
    paybackPeriod: "3.5",
    finalSystemCost: 18000,
    requiresSedaFee: true,
    config: { systemPhase: 3, panelType: 650 },
    systemSizeKwp: 6.5,
    actualPanels: 10,
    billBreakdownComparison: {
        items: [
            { label: 'SST', before: 20, after: 5 },
            { label: 'Capacity Fee', before: 10, after: 10 },
            { label: 'Usage', before: 450, after: 135 },
            { label: 'Network', before: 50, after: 50 }
        ]
    },
    selectedPackage: { packageName: "Premium Solar 6.5kW" },
    totalDiscountAmount: 0
};

const SHORT_BILL_CYCLE_SST_RATE = 0.08;
function buildBillCycleMetrics(data) {
    if (data?.billCycleModes?.fullMonth && data?.billCycleModes?.under28Days) return data.billCycleModes;
    const ds = data?.details || {};
    const afterBD = data?.billBreakdownComparison?.after || ds?.billBreakdown?.after || null;
    const beforeBD = data?.billBreakdownComparison?.before || ds?.billBreakdown?.before || null;
    const billBefore = toN(ds.billBefore, toN(beforeBD?.total));
    const fullBillAfter = toN(ds.billAfter, toN(afterBD?.total));
    const actualEeiSaving = toN(ds.actualEeiSaving, toN(data?.savingsBreakdown?.eeiSaving));
    const exportSaving = toN(ds.exportSaving);
    const fullBillReduction = toN(ds.billReduction, toN(data?.savingsBreakdown?.billReduction));
    const fullTotalSavings = toN(data?.monthlySavings);
    const fullPayableAfterSolar = Number.isFinite(Number(ds.estimatedPayableAfterSolar)) ? toN(ds.estimatedPayableAfterSolar) : Math.max(0, fullBillAfter - exportSaving);
    const currentSst = toN(afterBD?.sst);
    const shortCycleSstBase = toN(afterBD?.usage) + toN(afterBD?.network) + toN(afterBD?.capacity);
    const recalculatedSst = shortCycleSstBase * SHORT_BILL_CYCLE_SST_RATE;
    const under28BillAfter = Math.max(0, fullBillAfter - currentSst + recalculatedSst);
    const under28GrossBillReduction = Math.max(0, billBefore - under28BillAfter);
    const under28BillReduction = Math.max(0, under28GrossBillReduction - actualEeiSaving);
    const under28TotalSavings = under28BillReduction + actualEeiSaving + exportSaving;
    const under28PayableAfterSolar = Math.max(0, under28BillAfter - exportSaving);
    return {
        fullMonth: { key: 'fullMonth', label: 'Full Month', billAfter: fullBillAfter, billReduction: fullBillReduction, totalSavings: fullTotalSavings, payableAfterSolar: fullPayableAfterSolar, currentSst, recalculatedSst: currentSst, shortCycleSstBase },
        under28Days: { key: 'under28Days', label: '<28 Days', billAfter: under28BillAfter, billReduction: under28BillReduction, totalSavings: under28TotalSavings, payableAfterSolar: under28PayableAfterSolar, currentSst, recalculatedSst, shortCycleSstBase }
    };
}

const cycles = buildBillCycleMetrics(data);
const active = cycles.fullMonth;
const conf = 92;
const ds = data.details;

const roiResultBody = `
<div class="roi-hero">
    <div class="roi-hero-label">\${t('lbl_monthlySavings')}</div>
    <div class="roi-hero-saving">RM \${fmt(active.totalSavings)}</div>
    <div class="roi-hero-sub">(\${active.label} Bill Cycle)</div>
    <div class="roi-meta" style="margin-top:14px;">
        <div class="roi-meta-item">
            <div class="roi-meta-num">\${data.paybackPeriod}<span style="font-size:14px; font-weight:500;">yr</span></div>
            <div class="roi-meta-label">\${t('lbl_payback')}</div>
        </div>
    </div>
</div>
`;

// Combine into server.js snippet
const out = `
const MOCK_BILL_HTML = \`${billBreakdownBody.replace(/\\/g, '\\\\').replace(/\$/g, '\\$').replace(/`/g, '\\`')}\`;
const MOCK_ROI_HTML = \`${roiResultBody.replace(/\\/g, '\\\\').replace(/\$/g, '\\$').replace(/`/g, '\\`')}\`;
`;

fs.writeFileSync('scratch/out.txt', out);
console.log('done');
