const fs = require('fs');
const path = require('path');

const billBreakdownMock = `
<div style="padding: 0 20px;">
    <div class="ledger-row"><span class="ledger-label">Energy</span><span class="ledger-value">RM 180.50</span></div>
    <div class="ledger-row"><span class="ledger-label">Network</span><span class="ledger-value">RM 50.00</span></div>
    <div class="ledger-row"><span class="ledger-label">Capacity</span><span class="ledger-value">RM 10.00</span></div>
    <div class="ledger-row"><span class="ledger-label">SST</span><span class="ledger-value">RM 20.00</span></div>
    <div class="ledger-row"><span class="ledger-label">KWTBB</span><span class="ledger-value">RM 8.00</span></div>
    <div class="ledger-total-row"><span class="ledger-total-label">Total Matched Bill</span><span class="ledger-total-value">RM 500.00</span></div>
    <div class="usage-badge" style="margin-bottom:20px;"><span>⚡</span><span>Derived Usage 950 kWh/mo</span></div>
</div>
`;

const roiResultMock = `
<div class="roi-hero">
    <div class="roi-hero-label">Your Monthly Savings</div>
    <div class="roi-hero-saving">RM 427.00</div>
    <div class="roi-hero-sub">(Full Month Bill Cycle)</div>
    <div class="roi-meta" style="margin-top:14px;">
        <div class="roi-meta-item"><div class="roi-meta-num">3.5<span style="font-size:14px; font-weight:500;">yr</span></div><div class="roi-meta-label">Payback</div></div>
        <div class="roi-meta-item"><div class="roi-meta-num">28.5%</div><div class="roi-meta-label">Annual ROI</div></div>
        <div class="roi-meta-item"><div class="roi-meta-num" style="font-size:16px;">RM 18,000</div><div class="roi-meta-label">Net Cost</div></div>
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
<div class="gmx-wrap">
    <div class="gmx-header">Billing Comparison Breakdown</div>
    <div class="gmx-table">
        <div class="gmx-cell"><div class="gmx-label">Export</div></div>
        <div class="gmx-cell"></div>
        <div class="gmx-cell"><div class="gmx-bar-slot"><div class="gmx-bar gain" style="height:60px"><span class="gmx-bar-val">RM 80</span></div></div></div>

        <div class="gmx-cell"><div class="gmx-label">EEI</div></div>
        <div class="gmx-cell"></div>
        <div class="gmx-cell"><div class="gmx-bar-slot"><div class="gmx-bar gain" style="height:9px"><span class="gmx-bar-val">RM 12</span></div></div></div>

        <div class="gmx-footer-row"><div class="gmx-footer-label">Total Gain</div><div class="gmx-footer-val">RM 92.00</div></div>

        <div class="gmx-cell"><div class="gmx-label">SST+ KWTBB Retail Fee</div></div>
        <div class="gmx-cell"><div class="gmx-bar-slot"><div class="gmx-bar before" style="height:22px"><span class="gmx-bar-val">RM 30</span></div></div></div>
        <div class="gmx-cell"><div class="gmx-bar-slot"><div class="gmx-bar save" style="height:7px"><span class="gmx-bar-val">RM 10</span></div></div></div>

        <div class="gmx-cell"><div class="gmx-label">Usage + Network + Capacity</div></div>
        <div class="gmx-cell"><div class="gmx-bar-slot"><div class="gmx-bar before" style="height:60px"><span class="gmx-bar-val">RM 450</span></div></div></div>
        <div class="gmx-cell"><div class="gmx-bar-slot"><div class="gmx-bar save" style="height:18px"><span class="gmx-bar-val">RM 135</span></div></div></div>

        <div class="gmx-footer-row"><div class="gmx-footer-label">Total Reduce</div><div class="gmx-footer-val">RM 335.00</div></div>
    </div>
    <div class="gmx-grand-total">
        <div class="gmx-grand-label">Total Saved</div>
        <div class="gmx-grand-val">RM 427.00</div>
    </div>
</div>
<div style="background:var(--ink); color:white; border-top:1px solid rgba(255,255,255,0.1); padding:16px 20px; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between; gap:12px;">
    <div>
        <div style="font-size:9px; font-weight:500; opacity:0.5; margin-bottom:3px;">Matched Package</div>
        <div style="font-size:14px; font-weight:700;">Premium Solar 6.5kW</div>
    </div>
    <div style="text-align:right; flex-shrink:0;">
        <div style="font-size:18px; font-weight:900;">RM 18,000.00</div>
    </div>
</div>
`;

let injected = fs.readFileSync('public/domestic-mobile.html', 'utf8');

// Unlock all cards
injected = injected.replace(/class="card locked collapsed"/g, 'class="card"')
                   .replace(/class="card locked"/g, 'class="card"');

// Inject mocked data into bodies
injected = injected.replace(/<div class="card-body no-pad" id="billBreakdownBody">[\s\S]*?<\/div>\s*<!-- \/card2 -->/, '<div class="card-body no-pad" id="billBreakdownBody">' + billBreakdownMock + '</div><!-- /card2 -->');

injected = injected.replace(/<div class="card-body no-pad" id="roiResultBody">[\s\S]*?<\/div>\s*<!-- \/card4 -->/, '<div class="card-body no-pad" id="roiResultBody">' + roiResultMock + '</div><!-- /card4 -->');

// Add style block at the end of head
injected = injected.replace('</head>', '<style>.loading-spinner { display: none !important; }</style></head>');

fs.writeFileSync('scratch/out_injected.html', injected);
console.log('Written to scratch/out_injected.html');
