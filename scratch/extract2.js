const fs = require('fs');

const t = (k) => k;
const fmt = (v) => Number(v||0).toFixed(2);
const toN = (v, fb=0) => { const n = Number(v); return isFinite(n) ? n : fb; };

const descCard = (id) => '<div class="desc-card">Desc</div>';
const fmtK = v => 'RM ' + Math.round(v);

const tariff = {
    usage_kwh: 950, usage_normal: 180.50, network: 50.00, capacity: 10.00, retail: 5.00,
    eei: -12.00, sst_normal: 20.00, kwtbb_normal: 8.00, bill_total_normal: 480.00, fuel_adjustment: 20.00
};
const afaCharge = 0;
const total = 480;

const rows = [
    { label: 'Energy', value: tariff.usage_normal },
    { label: 'Network', value: tariff.network },
    { label: 'Capacity', value: tariff.capacity },
    { label: 'Retail', value: tariff.retail },
    { label: 'EEI', value: tariff.eei, note: '(Discount)' },
    { label: 'SST', value: tariff.sst_normal },
    { label: 'KWTBB', value: tariff.kwtbb_normal },
    { label: 'AFA', value: afaCharge, green: true },
];

let rowsHtml = '';
for (const r of rows) {
    rowsHtml += `
        <div class="ledger-row">
            <span class="ledger-label">${r.label}${r.note ? ` <span style="font-size:10px; color:var(--green-text)">(${r.note})</span>` : ''}</span>
            <span class="ledger-value${r.green ? ' green' : ''}" style="${r.green ? 'color:var(--green-text)' : ''}">RM ${fmt(r.value)}</span>
        </div>
    `;
}

const billBreakdownBody = `
<div style="padding: 0 20px;">
    ${rowsHtml}
    <div class="ledger-total-row">
        <span class="ledger-total-label">Total Matched Bill</span>
        <span class="ledger-total-value">RM ${fmt(total)}</span>
    </div>
    <div class="usage-badge" style="margin-bottom:20px;">
        <span>⚡</span>
        <span>Derived Usage ${tariff.usage_kwh} kWh</span>
    </div>
</div>
`;

// Combine into an object and save
const MOCK = {
  billBreakdown: billBreakdownBody
};

fs.writeFileSync('scratch/out.json', JSON.stringify(MOCK, null, 2));
console.log('JSON written');
