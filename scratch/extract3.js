const fs = require('fs');

const fmt = (v) => Number(v||0).toFixed(2);
const fmtK = v => 'RM ' + Math.round(v);

const billBreakdownBody = `
<div style="padding: 0 20px;">
    <div class="ledger-row">
        <span class="ledger-label">Energy</span>
        <span class="ledger-value">180.50</span>
    </div>
    <div class="ledger-row">
        <span class="ledger-label">Network</span>
        <span class="ledger-value">50.00</span>
    </div>
    <div class="ledger-row">
        <span class="ledger-label">Capacity</span>
        <span class="ledger-value">10.00</span>
    </div>
    <div class="ledger-row">
        <span class="ledger-label">SST</span>
        <span class="ledger-value">20.00</span>
    </div>
    <div class="ledger-row">
        <span class="ledger-label">KWTBB</span>
        <span class="ledger-value">8.00</span>
    </div>
    <div class="ledger-total-row">
        <span class="ledger-total-label">Total Matched Bill</span>
        <span class="ledger-total-value">RM 500.00</span>
    </div>
    <div class="usage-badge" style="margin-bottom:20px;">
        <span>⚡</span>
        <span>Derived Usage 950 kWh/mo</span>
    </div>
</div>
`;

const row = (label, before, after, type) => {
    const peak = Math.max(before, after, 1);
    const h = v => Math.max(4, Math.round((v / peak) * 60)) + 'px';
    return \`
    <div class="gmx-cell"><div class="gmx-label">\${label}</div></div>
    <div class="gmx-cell">
        \${before > 0 ? \`<div class="gmx-bar-slot"><div class="gmx-bar before" style="height:\${h(before)}"><span class="gmx-bar-val">\${fmtK(before)}</span></div></div>\` : ''}
    </div>
    <div class="gmx-cell">
        \${after > 0 ? \`<div class="gmx-bar-slot"><div class="gmx-bar \${type}" style="height:\${h(after)}"><span class="gmx-bar-val">\${fmtK(after)}</span></div></div>\` : ''}
    </div>\`;
};

const gmxHtml = \`
<div class="gmx-wrap">
    <div class="gmx-header">Billing Comparison Breakdown</div>
    
    <div class="gmx-table">
        \${row('Export', 0, 80, 'gain')}
        \${row('EEI', 0, 12, 'gain')}
        
        <div class="gmx-footer-row">
            <div class="gmx-footer-label">Total Gain</div>
            <div class="gmx-footer-val">RM 92.00</div>
        </div>

        \${row('SST+ KWTBB Retail Fee', 30, 10, 'save')}
        \${row('Usage + Network + Capacity', 450, 135, 'save')}

        <div class="gmx-footer-row">
            <div class="gmx-footer-label">Total Reduce</div>
            <div class="gmx-footer-val">RM 335.00</div>
        </div>
    </div>

    <div class="gmx-grand-total">
        <div class="gmx-grand-label">Total Saved</div>
        <div class="gmx-grand-val">RM 427.00</div>
    </div>
</div>\`;

const roiResultBody = `
<!-- Hero Savings -->
<div class="roi-hero">
    <div class="roi-hero-label">Your Monthly Savings</div>
    <div class="roi-hero-saving">RM 427.00</div>
    <div class="roi-hero-sub">(Full Month Bill Cycle)</div>
    <div class="roi-meta" style="margin-top:14px;">
        <div class="roi-meta-item">
            <div class="roi-meta-num">3.5<span style="font-size:14px; font-weight:500;">yr</span></div>
            <div class="roi-meta-label">Payback</div>
        </div>
        <div class="roi-meta-item">
            <div class="roi-meta-num">28.5%</div>
            <div class="roi-meta-label">Annual ROI</div>
        </div>
        <div class="roi-meta-item">
            <div class="roi-meta-num" style="font-size:16px;">RM 18,000</div>
            <div class="roi-meta-label">Net Cost</div>
        </div>
    </div>
</div>

<div style="display:grid; grid-template-columns:1fr 1fr; gap:1px; background:var(--border); border-top:1px solid var(--border); border-bottom:1px solid var(--border); margin-bottom:8px;">
    <div style="background:var(--surface); padding:16px 20px;">
        <div style="font-size:10px; font-weight:500; color:var(--ink-3); margin-bottom:6px;">System Size</div>
        <div style="font-size:22px; font-weight:900; letter-spacing:-0.02em;">6.5 <span style="font-size:14px; font-weight:500;">kWp</span></div>
        <div style="font-size:11px; color:var(--ink-3); margin-top:4px;">10 × 650W panels</div>
    </div>
    <div style="background:var(--surface); padding:16px 20px;">
        <div style="font-size:10px; font-weight:500; color:var(--ink-3); margin-bottom:6px;">New Bill</div>
        <div style="font-size:22px; font-weight:900; letter-spacing:-0.02em;">RM 73.00</div>
        <div style="font-size:11px; color:var(--ink-3); margin-top:4px;">was RM 500.00</div>
    </div>
</div>

` + gmxHtml;

const MOCK = {
  billBreakdown: billBreakdownBody,
  roiResult: roiResultBody
};

fs.writeFileSync('scratch/out.json', JSON.stringify(MOCK, null, 2));
console.log('Done generating HTML');
