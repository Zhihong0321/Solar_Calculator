// Visual-first overlay for domestic-preview
// Overrides displayBillBreakdown() and displaySolarCalculation() from app.js
// Preserves every number, every function — just changes the presentation layer.

(function () {
    'use strict';

    // ─── Helpers ─────────────────────────────────────────
    const $ = (id) => document.getElementById(id);
    const money = (v) => window.formatCurrency(v);
    const pct = (v, d = 1) => window.formatPercentage(v, d);
    const pctOfBill = (part, whole) => whole > 0 ? Math.min(100, Math.max(0, (part / whole) * 100)) : 0;

    // ─── Human-friendly labels ──────────────────────────
    const HUMAN_LABELS = {
        'usage_normal': 'Energy used',
        'network': 'Grid network',
        'capacity': 'Capacity',
        'retail': 'Retail service',
        'eei': 'Efficiency incentive',
        'sst_normal': 'SST 8%',
        'kwtbb_normal': 'KWTBB levy',
        'Usage': 'Energy used',
        'Network': 'Grid network',
        'Capacity Fee': 'Capacity',
        'SST': 'SST 8%',
        'EEI': 'Efficiency incentive',
        'AFA Charge': 'Fuel adjustment'
    };
    const label = (k) => HUMAN_LABELS[k] || k;

    // ─── Scene 2: Your bill today ───────────────────────
    window.displayBillBreakdown = function (data) {
        const resultsDiv = $('calculatorResults');
        const tariff = data.tariff;
        const afaRate = data.afaRate || 0;
        const afaCharge = tariff.usage_kwh * afaRate;
        const adjustedTotal = tariff.bill_total_normal + afaCharge;

        const rows = [
            { key: 'usage_normal', value: tariff.usage_normal },
            { key: 'network', value: tariff.network },
            { key: 'capacity', value: tariff.capacity },
            { key: 'retail', value: tariff.retail },
            { key: 'eei', value: tariff.eei },
            { key: 'sst_normal', value: tariff.sst_normal },
            { key: 'kwtbb_normal', value: tariff.kwtbb_normal }
        ];
        const maxRow = Math.max(...rows.map(r => Math.abs(parseFloat(r.value) || 0)), Math.abs(afaCharge));

        resultsDiv.innerHTML = `
            <section class="scene-card fade-up" data-scene-id="2">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="scene-label">Scene 2</p>
                        <h2 class="scene-title">Your bill today</h2>
                    </div>
                    <span class="chip gray">${tariff.usage_kwh} kWh/mo</span>
                </div>
                <div class="mt-5 space-y-2">
                    ${rows.map(r => {
                        const v = parseFloat(r.value) || 0;
                        const w = maxRow > 0 ? Math.max(2, (Math.abs(v) / maxRow) * 100) : 0;
                        return `
                            <div class="py-1.5">
                                <div class="flex justify-between items-baseline mb-1">
                                    <span class="text-sm tier-2">${label(r.key)}</span>
                                    <span class="text-sm font-semibold tier-1">RM ${money(v)}</span>
                                </div>
                                <div class="bill-bar"><span style="width:${w}%"></span></div>
                            </div>
                        `;
                    }).join('')}
                    ${afaCharge !== 0 ? `
                    <div class="py-1.5">
                        <div class="flex justify-between items-baseline mb-1">
                            <span class="text-sm tier-2">Fuel adjustment (AFA)</span>
                            <span class="text-sm font-semibold ${afaCharge < 0 ? 'text-emerald-600' : 'tier-1'}">${afaCharge < 0 ? '−' : '+'}RM ${money(Math.abs(afaCharge))}</span>
                        </div>
                        <div class="bill-bar"><span style="width:${maxRow > 0 ? Math.max(2, (Math.abs(afaCharge) / maxRow) * 100) : 0}%; background: ${afaCharge < 0 ? 'linear-gradient(90deg,#10b981,#059669)' : 'linear-gradient(90deg,#0b0b0b,#3b3b3b)'};"></span></div>
                    </div>` : ''}
                </div>
                <div class="mt-5 pt-4 border-t-2 border-black flex justify-between items-baseline">
                    <span class="text-[11px] uppercase tracking-widest font-semibold tier-2">Total matched</span>
                    <span class="text-3xl font-bold tracking-tight">RM ${money(adjustedTotal)}</span>
                </div>
            </section>

            <section class="scene-card fade-up" data-scene-id="3">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="scene-label">Scene 3</p>
                        <h2 class="scene-title">Design your solar</h2>
                    </div>
                    <button onclick="openSunPeakDetector()" class="chip gold">☀️ Detect sun</button>
                </div>

                <div class="mt-5 space-y-6">
                    <!-- Sun Peak as slider -->
                    <div>
                        <div class="flex justify-between items-baseline mb-2">
                            <label class="text-[11px] uppercase tracking-wide tier-3 font-semibold">Sunshine at your location</label>
                            <span id="sunPeakHourLabel" class="text-sm font-bold">3.4 h</span>
                        </div>
                        <input type="range" min="2.5" max="6" step="0.1" value="3.4" id="sunPeakHour" class="human-slider" oninput="document.getElementById('sunPeakHourLabel').innerText = this.value + ' h'; triggerSpontaneousUpdate('sunPeakHour')">
                        <div class="flex justify-between text-[10px] tier-3 mt-1"><span>Shady</span><span>Average</span><span>Blazing</span></div>
                    </div>

                    <!-- Day usage as slider -->
                    <div>
                        <div class="flex justify-between items-baseline mb-2">
                            <label class="text-[11px] uppercase tracking-wide tier-3 font-semibold">How much do you use during the day?</label>
                            <span id="morningUsageLabel" class="text-sm font-bold">30%</span>
                        </div>
                        <input type="range" min="5" max="90" step="1" value="30" id="morningUsage" class="human-slider" oninput="document.getElementById('morningUsageLabel').innerText = this.value + '%'; triggerSpontaneousUpdate('morningUsage')">
                        <div class="flex justify-between text-[10px] tier-3 mt-1"><span>Empty all day</span><span>Normal</span><span>WFH family</span></div>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="text-[11px] uppercase tracking-wide tier-3 font-semibold block mb-1">Panel rating</label>
                            <div class="border-b-2 border-divider focus-within:border-fact pb-1">
                                <input type="number" id="panelRating" value="650" step="1" min="450" max="850" oninput="triggerSpontaneousUpdate('panelRating')" class="w-full text-lg font-bold bg-transparent border-none outline-none">
                                <span class="text-[10px] tier-3">watts each</span>
                            </div>
                        </div>
                        <div>
                            <label class="text-[11px] uppercase tracking-wide tier-3 font-semibold block mb-1">Export rate</label>
                            <div class="border-b-2 border-divider focus-within:border-fact pb-1">
                                <input type="number" id="smpPrice" value="0.2703" step="0.0001" oninput="triggerSpontaneousUpdate('smpPrice')" class="w-full text-lg font-bold bg-transparent border-none outline-none">
                                <span class="text-[10px] tier-3">RM/kWh</span>
                            </div>
                        </div>
                    </div>

                    <details class="pref-hide-human">
                        <summary class="text-[11px] uppercase tracking-widest tier-3 font-semibold"><span class="chev">▸</span> Advanced (AFA, discounts)</summary>
                        <div class="mt-3 grid grid-cols-1 gap-3">
                            <div>
                                <label class="text-[11px] uppercase tracking-wide tier-3 font-semibold block mb-1">AFA projection (RM)</label>
                                <div class="border-b-2 border-divider focus-within:border-fact pb-1"><input type="number" id="afaRate" value="0.0000" step="0.0001" oninput="triggerSpontaneousUpdate('afaRate')" class="w-full text-lg font-bold bg-transparent border-none outline-none"></div>
                            </div>
                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label class="text-[11px] uppercase tracking-wide tier-3 font-semibold block mb-1">Discount %</label>
                                    <div class="border-b-2 border-divider focus-within:border-fact pb-1"><input type="number" id="percentDiscount" value="0" step="0.01" min="0" max="100" oninput="triggerSpontaneousUpdate('percentDiscount')" class="w-full text-lg font-bold bg-transparent border-none outline-none"></div>
                                </div>
                                <div>
                                    <label class="text-[11px] uppercase tracking-wide tier-3 font-semibold block mb-1">Discount RM</label>
                                    <div class="border-b-2 border-divider focus-within:border-fact pb-1"><input type="number" id="fixedDiscount" value="0" step="0.01" min="0" oninput="triggerSpontaneousUpdate('fixedDiscount')" class="w-full text-lg font-bold bg-transparent border-none outline-none"></div>
                                </div>
                            </div>
                        </div>
                    </details>

                    <!-- Expert-mode: show advanced inline -->
                    <div class="pref-hide-human grid grid-cols-2 gap-3 pref-hide-expert-invisible" style="display:none">
                    </div>

                    <button onclick="calculateSolarSavings()" class="w-full bg-black text-white font-bold uppercase tracking-wide text-sm px-6 py-4 rounded-xl hover:opacity-90 transition-all shadow-lg">
                        Show my savings →
                    </button>
                </div>
            </section>
        `;
    };

    // ─── Scene 4-5: Your savings (hero) + detail ────────
    window.displaySolarCalculation = function (data) {
        const resultsDiv = $('calculatorResults');
        let solarDiv = $('solarResultsCard');
        if (!solarDiv) {
            solarDiv = document.createElement('div');
            solarDiv.id = 'solarResultsCard';
            solarDiv.className = 'space-y-6';
            resultsDiv.appendChild(solarDiv);
        }
        window.latestSolarData = data;

        const ds = data.details;
        const b = ds.battery.baseline;
        const billBefore = parseFloat(ds.billBefore);
        const billAfter = parseFloat(ds.billAfter);
        const exportSaving = parseFloat(ds.exportSaving);
        const monthlySavings = parseFloat(data.monthlySavings);
        const netPayable = Math.max(0, billAfter - exportSaving);
        const savingsPct = billBefore > 0 ? Math.min(100, (monthlySavings / billBefore) * 100) : 0;

        const panelCount = data.actualPanels;
        const panelRating = data.config.panelType;
        const systemSizeKwp = (panelCount * panelRating) / 1000;

        // Donut: stroke-dasharray trick
        const C = 2 * Math.PI * 72; // radius 72
        const saveArc = (savingsPct / 100) * C;

        // Panel grid columns based on count
        const cols = Math.min(10, Math.max(4, Math.ceil(Math.sqrt(panelCount * 1.6))));
        const rows = Math.ceil(panelCount / cols);
        const cellsTotal = cols * rows;
        let panelsHtml = '';
        for (let i = 0; i < cellsTotal; i++) {
            panelsHtml += `<div class="panel ${i >= panelCount ? 'empty' : ''}"></div>`;
        }

        // Waterfall data
        const items = data.billBreakdownComparison.items;
        const maxDelta = Math.max(...items.map(i => Math.abs(i.delta)), 0.01);

        // Day timeline SVG
        const timeline = renderDayTimeline(data.charts);

        solarDiv.innerHTML = `
            <!-- Scene 4: Hero savings -->
            <section class="scene-card fade-up" data-scene-id="4" style="background: linear-gradient(160deg,#0b0b0b 0%,#1a1a1a 100%); color: #fff; border-color: #0b0b0b;">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="scene-label" style="color: rgba(255,255,255,0.6)">Scene 4</p>
                        <h2 class="scene-title" style="color: #fff">Your new life with solar</h2>
                    </div>
                    <span class="chip green">${pct(savingsPct, 0)}% off</span>
                </div>

                <!-- Donut -->
                <div class="mt-6 donut-wrap">
                    <svg viewBox="0 0 160 160" class="w-full h-full">
                        <circle cx="80" cy="80" r="72" stroke="rgba(255,255,255,0.12)" stroke-width="14" fill="none"/>
                        <circle cx="80" cy="80" r="72" stroke="#10b981" stroke-width="14" fill="none"
                            stroke-linecap="round"
                            stroke-dasharray="${saveArc} ${C - saveArc}"
                            stroke-dashoffset="${C / 4}"
                            transform="rotate(-90 80 80)"/>
                    </svg>
                    <div class="donut-center">
                        <p class="text-[10px] uppercase tracking-widest opacity-70">You save</p>
                        <p class="text-4xl font-bold tracking-tight text-emerald-400">RM ${money(monthlySavings)}</p>
                        <p class="text-xs opacity-70 mt-1">per month</p>
                    </div>
                </div>

                <!-- Bill shrink -->
                <div class="mt-6 hero-shrink">
                    <div class="hero-receipt before">
                        <p class="text-[9px] uppercase tracking-widest tier-3">Before solar</p>
                        <p class="text-2xl font-bold text-black">RM ${money(billBefore)}</p>
                        <p class="text-[10px] tier-3 mt-1">Monthly TNB bill</p>
                    </div>
                    <div class="hero-arrow">→ Solar →</div>
                    <div class="hero-receipt after" style="height: ${Math.max(40, 100 - savingsPct * 0.8)}%;">
                        <p class="text-[9px] uppercase tracking-widest opacity-60">After solar</p>
                        <p class="text-2xl font-bold">RM ${money(netPayable)}</p>
                        <p class="text-[10px] opacity-60 mt-1">You actually pay</p>
                    </div>
                </div>

                <div class="mt-5 grid grid-cols-3 gap-3 text-center">
                    <div>
                        <p class="text-[9px] uppercase tracking-widest opacity-60">New bill</p>
                        <p class="text-sm font-bold mt-0.5">RM ${money(billAfter)}</p>
                    </div>
                    <div>
                        <p class="text-[9px] uppercase tracking-widest opacity-60">Export income</p>
                        <p class="text-sm font-bold mt-0.5 text-[#FFD700]">RM ${money(exportSaving)}</p>
                    </div>
                    <div>
                        <p class="text-[9px] uppercase tracking-widest opacity-60">Confidence</p>
                        <p class="text-sm font-bold mt-0.5">${data.confidenceLevel}%</p>
                    </div>
                </div>

                ${parseFloat(ds.backupGenerationKwh) > 0 ? `
                <div class="mt-4 px-3 py-2 rounded-lg" style="background: rgba(255,215,0,0.12); border: 1px solid rgba(255,215,0,0.35)">
                    <p class="text-[10px] text-[#FFD700] font-semibold">☼ Weather buffer: +${parseFloat(ds.backupGenerationKwh).toFixed(1)} kWh backup generation (RM ${money(ds.backupGenerationSaving)})</p>
                    <p class="text-[9px] opacity-70 mt-0.5">Extra protection on low-sun days</p>
                </div>` : ''}

                ${parseFloat(ds.donatedKwh) > 0 ? `
                <div class="mt-3 px-3 py-2 rounded-lg" style="background: rgba(244,63,94,0.12); border: 1px solid rgba(244,63,94,0.35)">
                    <p class="text-[10px] text-rose-300 font-semibold">⚠ ${parseFloat(ds.donatedKwh).toFixed(1)} kWh donated to grid (export capped)</p>
                </div>` : ''}

                ${data.requiresSedaFee ? `
                <div class="mt-3 px-3 py-2 rounded-lg" style="background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.4)">
                    <p class="text-[10px] text-yellow-300 font-bold">⚠ SEDA: +RM 1,000 oversize fee (≥${data.config.systemPhase == 1 ? '5.01' : '15.01'}kW, ${data.config.systemPhase}-phase)</p>
                </div>` : ''}

                <div class="mt-6 flex justify-center">
                    <button onclick="generateInvoiceLink()" class="bg-white text-black font-bold uppercase tracking-wide text-xs px-6 py-3 rounded-xl shadow-[4px_4px_0_0_rgba(255,255,255,0.2)] hover:opacity-90 transition-all flex items-center gap-2">
                        <span class="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                        Create quotation →
                    </button>
                </div>
            </section>

            <!-- Roof pictogram -->
            <section class="scene-card fade-up">
                <div class="flex items-center justify-between mb-3">
                    <div>
                        <p class="scene-label">Your system</p>
                        <h3 class="text-base font-bold">${panelCount} panels · ${systemSizeKwp.toFixed(1)} kWp</h3>
                    </div>
                    <span class="chip gray">${panelRating}W each</span>
                </div>
                <div class="roof">
                    <div class="sun-orb"></div>
                    <div class="house">
                        <div class="panel-grid" style="--cols: ${cols}">${panelsHtml}</div>
                        <div class="body">
                            <div class="window" style="left: 12%"></div>
                            <div class="window" style="right: 12%"></div>
                            <div class="door"></div>
                        </div>
                    </div>
                </div>
                <p class="mt-3 text-xs tier-3 text-center">${data.selectedPackage ? `Matched package: <span class="tier-1 font-semibold">${data.selectedPackage.packageName}</span>` : 'Custom sizing'}</p>
            </section>

            <!-- Day timeline -->
            <section class="scene-card fade-up">
                <p class="scene-label">When the sun works for you</p>
                <h3 class="text-base font-bold">Your solar day</h3>
                <div class="mt-4">${timeline}</div>
                <div class="mt-3 flex justify-center gap-4 text-[10px] tier-3">
                    <span class="flex items-center gap-1.5"><span class="w-3 h-2 rounded bg-amber-500"></span>Your usage</span>
                    <span class="flex items-center gap-1.5"><span class="w-3 h-2 rounded bg-emerald-500"></span>Solar generation</span>
                </div>
            </section>

            <!-- ROI bar -->
            <section class="scene-card fade-up">
                <div class="grid grid-cols-3 gap-3 text-center">
                    <div>
                        <p class="text-[10px] uppercase tracking-widest tier-3 font-semibold">Return</p>
                        <p class="text-2xl font-bold text-emerald-600 mt-1">${pct((monthlySavings * 12 / data.finalSystemCost) * 100, 1)}%</p>
                        <p class="text-[9px] tier-3 mt-0.5">per year</p>
                    </div>
                    <div>
                        <p class="text-[10px] uppercase tracking-widest tier-3 font-semibold">Payback</p>
                        <p class="text-2xl font-bold mt-1">${data.paybackPeriod}<span class="text-sm"> yr</span></p>
                        <p class="text-[9px] tier-3 mt-0.5">break even</p>
                    </div>
                    <div>
                        <p class="text-[10px] uppercase tracking-widest tier-3 font-semibold">System cost</p>
                        <p class="text-2xl font-bold mt-1">${data.finalSystemCost ? 'RM ' + shortMoney(data.finalSystemCost) : '—'}</p>
                        <p class="text-[9px] tier-3 mt-0.5">after discount</p>
                    </div>
                </div>
                ${renderPaybackHorizon(parseFloat(data.paybackPeriod))}
            </section>

            <!-- Where savings come from -->
            <section class="scene-card fade-up">
                <p class="scene-label">Where the savings come from</p>
                <h3 class="text-base font-bold mb-4">Bill components, before → after</h3>
                <div>
                    ${items.map(i => {
                        const w = maxDelta > 0 ? Math.max(4, (Math.abs(i.delta) / maxDelta) * 100) : 0;
                        const isPos = i.delta >= 0;
                        return `
                            <div class="waterfall-row">
                                <span class="text-xs tier-2">${label(i.label)}</span>
                                <div class="wf-track">
                                    <div class="wf-fill" style="width: ${w}%; ${isPos ? '' : 'background: linear-gradient(90deg,#f43f5e,#be123c);'}"></div>
                                </div>
                                <span class="text-xs font-bold ${isPos ? 'text-emerald-600' : 'text-rose-600'} tabular-nums">${isPos ? '−' : '+'}${money(Math.abs(i.delta))}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </section>

            <!-- EPP collapsed -->
            <section class="scene-card fade-up">
                <details>
                    <summary class="flex items-center justify-between">
                        <div>
                            <p class="scene-label">Financing option</p>
                            <h3 class="text-base font-bold">Monthly installment (0% downpayment pathway)</h3>
                        </div>
                        <span class="chev text-xl">▸</span>
                    </summary>
                    <div class="mt-4 grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-[10px] uppercase tracking-wide tier-3 mb-1">Bank</label>
                            <select id="eppBank" onchange="updateEPPCalculation(event)" class="w-full text-sm font-semibold bg-white border border-gray-300 rounded-lg px-2 py-2 focus:border-black outline-none"></select>
                        </div>
                        <div>
                            <label class="block text-[10px] uppercase tracking-wide tier-3 mb-1">Tenure</label>
                            <select id="eppTenure" onchange="updateEPPCalculation(event)" class="w-full text-sm font-semibold bg-white border border-gray-300 rounded-lg px-2 py-2 focus:border-black outline-none"></select>
                        </div>
                    </div>
                    <div class="mt-3 bg-white border border-gray-200 rounded-lg p-3">
                        <div class="flex justify-between items-baseline mb-2 pb-2 border-b border-gray-100">
                            <span class="text-[10px] uppercase tracking-widest tier-3">Monthly payment</span>
                            <span id="eppResult" class="text-xl font-bold">RM 0.00</span>
                        </div>
                        <div id="eppFee" class="text-[10px] space-y-1 mb-2"></div>
                        <div id="eppNet" class="text-[10px] pt-2 border-t border-gray-100 flex justify-between"></div>
                    </div>
                    <div id="eppNote" class="mt-2 text-[10px] bg-yellow-50 border border-yellow-200 p-2 rounded text-yellow-800"></div>
                </details>
            </section>

            <!-- Battery -->
            <section class="scene-card fade-up">
                ${data.config.batterySize > 0 ? `
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="scene-label">Battery storage</p>
                            <h3 class="text-base font-bold">${data.config.batterySize} kWh battery</h3>
                        </div>
                        <div class="text-right">
                            <p class="text-[10px] uppercase tracking-widest tier-3">Value add</p>
                            <p class="text-lg font-bold text-emerald-600">+RM ${money(parseFloat(data.monthlySavings) - parseFloat(b.totalSavings))}/mo</p>
                        </div>
                    </div>
                    <div class="mt-3 flex items-center justify-center gap-2">
                        <button onclick="adjustBatterySize(-5)" class="w-11 h-11 border-2 border-black rounded-lg font-bold">−</button>
                        <span class="w-24 text-center text-lg font-bold">${data.config.batterySize} kWh</span>
                        <button onclick="adjustBatterySize(5)" class="w-11 h-11 border-2 border-black rounded-lg font-bold">+</button>
                    </div>
                ` : `
                    <div class="text-center">
                        <p class="scene-label mb-1">Want more resilience?</p>
                        <button onclick="adjustBatterySize(5)" class="mt-2 text-xs font-bold uppercase tracking-widest border-2 border-black px-4 py-3 rounded-xl hover:bg-black hover:text-white transition-all">
                            + Add battery simulation
                        </button>
                    </div>
                `}
            </section>

            <!-- Engineering detail (collapsed by default) -->
            <section class="scene-card fade-up">
                <details>
                    <summary class="flex items-center justify-between">
                        <div>
                            <p class="scene-label">For the engineer in you</p>
                            <h3 class="text-base font-bold">Full numbers & assumptions</h3>
                        </div>
                        <span class="chev text-xl">▸</span>
                    </summary>
                    <div class="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                        <div><p class="tier-3 text-[10px] uppercase tracking-wide">Monthly usage</p><p class="font-bold">${ds.monthlyUsageKwh} kWh</p></div>
                        <div><p class="tier-3 text-[10px] uppercase tracking-wide">Monthly gen</p><p class="font-bold">${ds.monthlySolarGeneration} kWh</p></div>
                        <div><p class="tier-3 text-[10px] uppercase tracking-wide">Net import</p><p class="font-bold">${ds.netUsageKwh} kWh</p></div>
                        <div><p class="tier-3 text-[10px] uppercase tracking-wide">Exported</p><p class="font-bold">${ds.exportKwh} kWh</p></div>
                        <div><p class="tier-3 text-[10px] uppercase tracking-wide">Export rate</p><p class="font-bold">RM ${ds.effectiveExportRate}</p></div>
                        <div><p class="tier-3 text-[10px] uppercase tracking-wide">Confidence</p><p class="font-bold">${data.confidenceLevel}%</p></div>
                        <div><p class="tier-3 text-[10px] uppercase tracking-wide">System size</p><p class="font-bold">${systemSizeKwp.toFixed(2)} kWp</p></div>
                        <div><p class="tier-3 text-[10px] uppercase tracking-wide">Recommended</p><p class="font-bold">${data.recommendedPanels} panels</p></div>
                        <div><p class="tier-3 text-[10px] uppercase tracking-wide">System price</p><p class="font-bold">${data.systemCostBeforeDiscount ? 'RM ' + money(data.systemCostBeforeDiscount) : '—'}</p></div>
                        <div><p class="tier-3 text-[10px] uppercase tracking-wide">Discount</p><p class="font-bold">RM ${money(data.totalDiscountAmount || 0)}</p></div>
                    </div>
                    <p class="mt-4 text-[10px] tier-3 italic">Bill breakdown (before → after): usage ${money(data.billBreakdownComparison.items[0].before)} → ${money(data.billBreakdownComparison.items[0].after)}, network ${money(data.billBreakdownComparison.items[1].before)} → ${money(data.billBreakdownComparison.items[1].after)}, capacity ${money(data.billBreakdownComparison.items[2].before)} → ${money(data.billBreakdownComparison.items[2].after)}, SST ${money(data.billBreakdownComparison.items[3].before)} → ${money(data.billBreakdownComparison.items[3].after)}, EEI ${money(data.billBreakdownComparison.items[4].before)} → ${money(data.billBreakdownComparison.items[4].after)}, AFA ${money(data.billBreakdownComparison.items[5].before)} → ${money(data.billBreakdownComparison.items[5].after)}.</p>
                </details>
            </section>
        `;

        // Rebuild EPP select + trigger calc
        const bankSelect = $('eppBank');
        if (bankSelect && !bankSelect.options.length) {
            const BANKS = Object.keys(window.EPP_RATES || {});
            bankSelect.innerHTML = BANKS.map(b => `<option value="${b}">${b}</option>`).join('');
        }
        setTimeout(() => $('eppBank') && $('eppBank').dispatchEvent(new Event('change')), 0);

        // Render floating panel bar (reuse original)
        if (typeof window.renderFloatingPanelModulation === 'function') {
            window.renderFloatingPanelModulation(data);
        }
    };

    // Expose EPP_RATES globally (in case it's not already)
    if (typeof window.EPP_RATES === 'undefined') {
        // app.js defines it as const; it's not on window. Re-declare for select population.
        window.EPP_RATES = {
            "Maybank": { 6: 2.50, 12: 3.50, 24: 5.50, 36: 6.00, 48: 8.00, 60: 10.00 },
            "Public Bank": { 6: 2.50, 12: 3.50, 18: 4.00, 24: 5.50, 36: 6.00, 48: 8.00, 60: 10.00 },
            "Hong Leong Bank": { 12: 3.50, 24: 5.50, 36: 6.00, 48: 8.00, 60: 10.00 },
            "CIMB": { 6: 2.50, 12: 3.50 },
            "AM Bank": { 24: 7.00, 36: 9.00 },
            "UOB": { 6: 2.50, 12: 3.50, 24: 5.50, 48: 8.50, 68: 11.50 },
            "OCBC": { 6: 4.00, 12: 5.00, 18: 6.00, 24: 7.00, 36: 8.00, 48: 9.00 }
        };
    }

    // ─── SVG Day Timeline ──────────────────────────────
    function renderDayTimeline(charts) {
        if (!charts || !charts.electricityUsagePattern) return '';
        const usage = charts.electricityUsagePattern.map(p => parseFloat(p.usage));
        const solar = charts.solarGenerationPattern.map(p => parseFloat(p.generation));
        const maxV = Math.max(...usage, ...solar, 0.01);

        const W = 320, H = 140, pad = 18;
        const step = (W - pad * 2) / 23;
        const y = (v) => H - pad - (v / maxV) * (H - pad * 2 - 10);

        const pathFrom = (arr) => arr.map((v, i) => `${i === 0 ? 'M' : 'L'} ${pad + i * step} ${y(v)}`).join(' ');
        const areaFrom = (arr) => `${pathFrom(arr)} L ${pad + (arr.length - 1) * step} ${H - pad} L ${pad} ${H - pad} Z`;

        return `
            <svg viewBox="0 0 ${W} ${H}" class="w-full day-tl" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="solarGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#10b981" stop-opacity="0.35"/>
                        <stop offset="100%" stop-color="#10b981" stop-opacity="0.02"/>
                    </linearGradient>
                    <linearGradient id="usageGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.28"/>
                        <stop offset="100%" stop-color="#f59e0b" stop-opacity="0.02"/>
                    </linearGradient>
                </defs>
                <line class="axis" x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}"/>
                <path d="${areaFrom(solar)}" fill="url(#solarGrad)" stroke="#10b981" stroke-width="2"/>
                <path d="${areaFrom(usage)}" fill="url(#usageGrad)" stroke="#f59e0b" stroke-width="2"/>
                <text x="${pad}" y="${H - 4}">6am</text>
                <text x="${W / 2 - 8}" y="${H - 4}">noon</text>
                <text x="${W - pad - 16}" y="${H - 4}">10pm</text>
            </svg>
        `;
    }

    // ─── Payback horizon ───────────────────────────────
    function renderPaybackHorizon(years) {
        if (!isFinite(years) || years <= 0 || years > 30) return '';
        const maxYears = Math.max(10, Math.ceil(years) + 3);
        const pos = Math.min(95, (years / maxYears) * 100);
        return `
            <div class="mt-5 pt-4 border-t border-divider">
                <p class="text-[10px] uppercase tracking-widest tier-3 font-semibold mb-3">Payback horizon</p>
                <div class="relative h-8">
                    <div class="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 bg-gradient-to-r from-gray-200 via-yellow-200 to-emerald-200 rounded-full"></div>
                    <div class="absolute top-0 bottom-0 flex items-center" style="left: ${pos}%; transform: translateX(-50%);">
                        <div class="flex flex-col items-center">
                            <span class="w-5 h-5 rounded-full bg-emerald-600 border-2 border-white shadow"></span>
                        </div>
                    </div>
                    <div class="absolute top-0 text-[9px] tier-3" style="left: 0">Year 0</div>
                    <div class="absolute top-0 text-[9px] tier-3 right-0">Year ${maxYears}</div>
                    <div class="absolute -bottom-1 text-[10px] font-bold text-emerald-700" style="left: ${pos}%; transform: translateX(-50%);">break even · yr ${years}</div>
                </div>
                <p class="mt-6 text-[10px] tier-3 text-center italic">Everything after this point is pure savings.</p>
            </div>
        `;
    }

    function shortMoney(v) {
        const n = parseFloat(v || 0);
        if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
        return money(n);
    }

})();
