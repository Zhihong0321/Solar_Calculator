// Non-Domestic Solar Calculator JS

let db = {
    tariffs: [],
    packages: []
};

let matchedBillData = null; // Store results from Step 1
let workingHours = {};
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Hourly Solar Generation Map (Percentage of daily yield)
const HOURLY_SOLAR_MAP = {
    7: 0.02, 8: 0.05, 9: 0.09, 10: 0.12, 11: 0.15, 12: 0.16, 
    13: 0.15, 14: 0.12, 15: 0.08, 16: 0.04, 17: 0.02
};

// Initialize Working Hours
DAYS.forEach(day => {
    workingHours[day.toLowerCase()] = { start: 8, end: 18 };
});

window.onload = function() {
    testConnection();
    initializeData();
    initWorkingHoursUI();
};

async function initializeData() {
    try {
        const response = await fetch('/api/all-data');
        const data = await response.json();
        if (response.ok) {
            db.tariffs = data.tariffs;
            db.packages = data.packages.map(p => ({
                ...p,
                panel_qty: parseInt(p.panel_qty),
                price: parseFloat(p.price),
                solar_output_rating: parseInt(p.solar_output_rating)
            }));
        }
    } catch (err) {
        console.error('Failed to load data:', err);
    }
}

function initWorkingHoursUI() {
    DAYS.forEach(day => {
        const dayKey = day.toLowerCase();
        const startInput = document.getElementById(`${dayKey}-start`);
        const endInput = document.getElementById(`${dayKey}-end`);
        const startLabel = document.getElementById(`${dayKey}-start-label`);
        const endLabel = document.getElementById(`${dayKey}-end-label`);
        const highlight = document.getElementById(`${dayKey}-highlight`);

        const updateSlider = () => {
            let start = parseFloat(startInput.value);
            let end = parseFloat(endInput.value);

            if (start > end) {
                if (this === startInput) end = start;
                else start = end;
                startInput.value = start;
                endInput.value = end;
            }

            workingHours[dayKey] = { start, end };
            
            startLabel.innerText = formatTime(start);
            endLabel.innerText = formatTime(end);

            const startPct = (start / 24) * 100;
            const endPct = (end / 24) * 100;
            highlight.style.left = startPct + '%';
            highlight.style.width = (endPct - startPct) + '%';
        };

        startInput.oninput = updateSlider;
        endInput.oninput = updateSlider;
        updateSlider(); 
    });
}

window.setDayOff = function(dayKey) {
    const startInput = document.getElementById(`${dayKey}-start`);
    const endInput = document.getElementById(`${dayKey}-end`);
    if (startInput && endInput) {
        startInput.value = 0;
        endInput.value = 0;
        // Trigger the input event manually to update labels and highlight
        startInput.dispatchEvent(new Event('input'));
    }
}

function formatTime(decimalHour) {
    const h = Math.floor(decimalHour);
    const m = Math.round((decimalHour % 1) * 60);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 || 12;
    return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
}

document.getElementById('billForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const billAmount = parseFloat(document.getElementById('billAmount').value);

    if (!billAmount || billAmount <= 0) {
        alert('Please enter a valid bill amount');
        return;
    }

    const resultsDiv = document.getElementById('calculatorResults');
    resultsDiv.innerHTML = '<div class="text-center py-20 text-xs font-bold uppercase animate-pulse">Analyzing_TNB_Database...</div>';

    try {
        const response = await fetch(`/api/commercial/calculate-bill?amount=${billAmount}`);
        const data = await response.json();

        if (!response.ok || !data.tariff) {
            throw new Error(data.error || 'Failed to fetch bill breakdown');
        }

        matchedBillData = data.tariff;
        displayBillBreakdown(matchedBillData);
        
        document.getElementById('simulation-params').classList.remove('hidden');
        document.getElementById('simulation-params').scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
        console.error(err);
        resultsDiv.innerHTML = `<div class="text-rose-600 font-bold p-4 border border-rose-600 bg-rose-50 uppercase text-xs">Error: ${err.message}</div>`;
    }
});

function displayBillBreakdown(t) {
    const resultsDiv = document.getElementById('calculatorResults');
    resultsDiv.innerHTML = `
        <div class="space-y-10">
            <section class="pt-2">
                <h2 class="text-xs md:text-sm font-bold uppercase tracking-wide mb-6 md:mb-8 tier-2 border-b-2 border-fact inline-block pb-1">01.1_MATCHED_BILL_BREAKDOWN</h2>
                <div class="space-y-3 text-sm md:text-base">
                    <div class="flex justify-between tier-3 uppercase text-[10px] md:text-xs tracking-wide mb-4 border-b border-divider pb-1.5"><span>Component</span><span>Value_(RM)</span></div>
                    
                    <div class="flex justify-between py-1.5 gap-4 border-b border-divider/50">
                        <span class="tier-2 truncate text-sm uppercase">Energy_Charge</span>
                        <span class="tier-1 font-semibold whitespace-nowrap text-sm">${formatCurrency(t.energy_charge)}</span>
                    </div>
                    <div class="flex justify-between py-1.5 gap-4 border-b border-divider/50">
                        <span class="tier-2 truncate text-sm uppercase">Retail_Charge</span>
                        <span class="tier-1 font-semibold whitespace-nowrap text-sm">${formatCurrency(t.retail_charge)}</span>
                    </div>
                    <div class="flex justify-between py-1.5 gap-4 border-b border-divider/50">
                        <span class="tier-2 truncate text-sm uppercase">Capacity_Charge</span>
                        <span class="tier-1 font-semibold whitespace-nowrap text-sm">${formatCurrency(t.capacity_charge)}</span>
                    </div>
                    <div class="flex justify-between py-1.5 gap-4 border-b border-divider/50">
                        <span class="tier-2 truncate text-sm uppercase">Network_Charge</span>
                        <span class="tier-1 font-semibold whitespace-nowrap text-sm">${formatCurrency(t.network_charge)}</span>
                    </div>
                    <div class="flex justify-between py-1.5 gap-4 border-b border-divider/50">
                        <span class="tier-2 truncate text-sm uppercase">KWTBB_Fund</span>
                        <span class="tier-1 font-semibold whitespace-nowrap text-sm">${formatCurrency(t.kwtbb_fund)}</span>
                    </div>
                    <div class="flex justify-between py-1.5 gap-4 border-b border-divider/50">
                        <span class="tier-2 truncate text-sm uppercase">SST_Tax</span>
                        <span class="tier-1 font-semibold whitespace-nowrap text-sm">${formatCurrency(t.sst_tax)}</span>
                    </div>

                    <div class="ledger-double-line pt-4 mt-5 flex justify-between items-baseline gap-4">
                        <span class="text-xs md:text-sm font-bold uppercase tracking-wide">Total_Matched_Bill</span>
                        <span class="text-2xl md:text-3xl font-bold tracking-tight whitespace-nowrap">RM ${formatCurrency(t.total_bill)}</span>
                    </div>
                    <div class="mt-6 flex justify-between items-center text-[10px] md:text-xs tier-3 uppercase tracking-wide gap-4 border-t border-divider pt-3">
                        <span class="bg-yellow-100 px-3 py-1.5 rounded font-bold text-xs md:text-sm border-2 border-yellow-400">Monthly_Usage: ${t.usage_kwh} kWh</span>
                    </div>
                </div>
            </section>
        </div>
    `;
}

async function executeFullAnalysis() {
    if (!matchedBillData) return;

    const sunPeak = parseFloat(document.getElementById('sunPeakHour').value);
    const panelRating = parseInt(document.getElementById('panelRating').value);
    const baseLoadPct = parseFloat(document.getElementById('baseLoadPercent').value) / 100;
    const smpPrice = parseFloat(document.getElementById('smpPrice').value);

    const totalMonthlyKwh = parseFloat(matchedBillData.usage_kwh);
    
    let weeklyWorkingHours = 0;
    DAYS.forEach(day => {
        const h = workingHours[day.toLowerCase()];
        weeklyWorkingHours += (h.end - h.start);
    });

    const hourlyBaseLoad = (totalMonthlyKwh * baseLoadPct) / 720;
    const hourlyOperationalLoad = (totalMonthlyKwh * (1 - baseLoadPct)) / (weeklyWorkingHours * 4.33);

    const peakHourlyConsumption = hourlyBaseLoad + hourlyOperationalLoad;
    const recommendedKw = (peakHourlyConsumption / 0.7); 
    let recommendedPanels = Math.max(1, Math.ceil((recommendedKw * 1000) / panelRating));
    
    let pkg = db.packages
        .filter(p => p.panel_qty >= recommendedPanels && (p.type === 'Tariff B&D Low Voltage' || p.type === 'Residential'))
        .sort((a,b) => a.panel_qty - b.panel_qty)[0];

    if (!pkg) {
        pkg = db.packages
            .filter(p => p.type === 'Tariff B&D Low Voltage' || p.type === 'Residential')
            .sort((a,b) => Math.abs(a.panel_qty - recommendedPanels))[0];
    }

    const finalPanels = pkg ? pkg.panel_qty : recommendedPanels;
    const systemSizeKwp = (finalPanels * panelRating) / 1000;
    const dailyGenKwh = systemSizeKwp * sunPeak;

    let weeklyOffsetKwh = 0;
    let weeklyExportKwh = 0;
    let dailyData = [];

    for (let d = 0; d < 7; d++) {
        const dayName = DAYS[d];
        const dayKey = dayName.toLowerCase();
        const hours = workingHours[dayKey];
        let dayOffset = 0;
        let dayExport = 0;
        
        for (let h = 0; h < 24; h++) {
            const isWorking = h >= hours.start && h < hours.end;
            const currentLoad = isWorking ? (hourlyBaseLoad + hourlyOperationalLoad) : hourlyBaseLoad;
            const consumptionCap = currentLoad * 1.5;

            const solarGenPct = HOURLY_SOLAR_MAP[h] || 0;
            const hourlySolarGen = dailyGenKwh * solarGenPct;

            const offset = Math.min(hourlySolarGen, consumptionCap);
            const exportAmt = Math.max(0, hourlySolarGen - consumptionCap);

            dayOffset += offset;
            dayExport += exportAmt;
        }
        weeklyOffsetKwh += dayOffset;
        weeklyExportKwh += dayExport;
        dailyData.push({ day: dayName, offset: dayOffset, export: dayExport });
    }

    const monthlyOffsetKwh = weeklyOffsetKwh * 4.33;
    const monthlyExportKwh = weeklyExportKwh * 4.33;
    const newTotalUsageKwh = Math.max(0, totalMonthlyKwh - monthlyOffsetKwh);

    try {
        const response = await fetch(`/api/commercial/lookup-by-usage?usage=${newTotalUsageKwh}`);
        const data = await response.json();
        const newBillData = data.tariff;

        const billSaving = parseFloat(matchedBillData.total_bill) - parseFloat(newBillData.total_bill);
        const exportEarnings = monthlyExportKwh * smpPrice;
        const totalMonthlySavings = billSaving + exportEarnings;

        const systemCost = pkg ? pkg.price : systemSizeKwp * 3500;
        const payback = systemCost / (totalMonthlySavings * 12);

        displayFullROIResults({
            systemSizeKwp,
            finalPanels,
            panelRating,
            monthlyGen: dailyGenKwh * 30,
            monthlyOffsetKwh,
            monthlyExportKwh,
            oldBill: matchedBillData,
            newBill: newBillData,
            billSaving,
            exportEarnings,
            totalMonthlySavings,
            systemCost,
            payback,
            pkg,
            dailyData
        });

    } catch (err) {
        console.error('Failed to lookup new bill:', err);
        alert('Simulation failed. Check console for details.');
    }
}

function displayFullROIResults(data) {
    const resultsDiv = document.getElementById('calculatorResults');
    const roi = (data.totalMonthlySavings * 12 / data.systemCost) * 100;

    resultsDiv.innerHTML += `
        <div class="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <!-- Professional Executive Summary -->
            <section class="bg-black text-white p-6 md:p-10 -mx-4 md:mx-0 shadow-[10px_10px_0px_0px_rgba(0,0,0,0.1)] border border-white/10">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 border-b border-white/20 pb-6">
                    <div>
                        <h2 class="text-[10px] md:text-xs font-bold uppercase tracking-widest text-emerald-400 mb-1">SYSTEM_SPECIFICATION</h2>
                        <div class="text-2xl md:text-3xl font-bold tracking-tight">${data.systemSizeKwp.toFixed(2)} kWp <span class="text-xs md:text-sm opacity-50 font-normal">(${data.finalPanels} x ${data.panelRating}W)</span></div>
                    </div>
                    <div class="text-left md:text-right">
                        <div class="text-[10px] md:text-xs font-bold uppercase tracking-widest opacity-60">Estimated_Payback</div>
                        <div class="text-2xl md:text-3xl font-bold tracking-tight text-emerald-400">${data.payback.toFixed(1)} Years</div>
                    </div>
                </div>

                <div class="grid grid-cols-2 md:grid-cols-3 gap-8">
                    <div>
                        <p class="text-[10px] uppercase opacity-50 font-bold mb-1">Total_Project_Investment</p>
                        <p class="text-lg md:text-xl font-bold">RM ${data.systemCost.toLocaleString()}</p>
                    </div>
                    <div>
                        <p class="text-[10px] uppercase opacity-50 font-bold mb-1">Annualized_ROI</p>
                        <p class="text-lg md:text-xl font-bold text-emerald-400">${roi.toFixed(1)}%</p>
                    </div>
                    <div class="md:text-right">
                        <p class="text-[10px] uppercase opacity-50 font-bold mb-1">Model_Efficiency</p>
                        <p class="text-lg md:text-xl font-bold text-white">${Math.round((data.monthlyOffsetKwh/data.monthlyGen)*100)}% (Direct Offset)</p>
                    </div>
                </div>
            </section>

            <!-- 04.1 DAILY YIELD PROJECTION -->
            <section class="space-y-6">
                <h3 class="text-xs font-bold uppercase tracking-widest tier-2 border-b-2 border-fact inline-block pb-1">04.1_DAILY_YIELD_PROJECTION</h3>
                <div class="overflow-x-auto">
                    <table class="w-full text-[10px] md:text-xs text-left border-collapse">
                        <thead>
                            <tr class="tier-3 uppercase border-b border-divider">
                                <th class="py-3 font-bold">DAY_OF_WEEK</th>
                                <th class="py-3 font-bold text-right">DIRECT_OFFSET (kWh)</th>
                                <th class="py-3 font-bold text-right">EXPORT_TO_GRID (kWh)</th>
                                <th class="py-3 font-bold text-right">TOTAL_YIELD</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.dailyData.map(d => `
                                <tr class="border-b border-divider/40">
                                    <td class="py-3 font-semibold uppercase">${d.day}</td>
                                    <td class="py-3 text-right text-emerald-600 font-bold">${d.offset.toFixed(2)}</td>
                                    <td class="py-3 text-right text-orange-600 font-bold">${d.export.toFixed(2)}</td>
                                    <td class="py-3 text-right font-bold">${(d.offset + d.export).toFixed(2)}</td>
                                </tr>
                            `).join('')}
                            <tr class="bg-black/5 font-bold">
                                <td class="py-3 uppercase">WEEKLY_TOTAL</td>
                                <td class="py-3 text-right text-emerald-600 underline">${(data.monthlyOffsetKwh / 4.33).toFixed(2)}</td>
                                <td class="py-3 text-right text-orange-600 underline">${(data.monthlyExportKwh / 4.33).toFixed(2)}</td>
                                <td class="py-3 text-right underline">${((data.monthlyOffsetKwh + data.monthlyExportKwh) / 4.33).toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- 05 ACCUMULATED SAVINGS ANALYSIS -->
            <section class="space-y-6 pt-10 border-t-2 border-divider">
                <h3 class="text-xs font-bold uppercase tracking-widest tier-2 border-b-2 border-fact inline-block pb-1">05_ACCUMULATED_SAVINGS_ANALYSIS</h3>
                <div class="grid md:grid-cols-2 gap-10">
                    <div class="space-y-8">
                        <div>
                            <p class="text-[10px] uppercase opacity-60 font-bold mb-3 tracking-widest">A. ENERGY_YIELD_ACCUMULATION</p>
                            <div class="space-y-4">
                                <div class="flex justify-between items-baseline border-b border-divider/50 pb-2">
                                    <span class="text-xs uppercase tier-3">Total_Monthly_Offset</span>
                                    <span class="text-sm font-bold text-emerald-600">${Math.round(data.monthlyOffsetKwh).toLocaleString()} kWh</span>
                                </div>
                                <div class="flex justify-between items-baseline border-b border-divider/50 pb-2">
                                    <span class="text-xs uppercase tier-3">Total_Monthly_Export</span>
                                    <span class="text-sm font-bold text-orange-600">${Math.round(data.monthlyExportKwh).toLocaleString()} kWh</span>
                                </div>
                                <div class="flex justify-between items-baseline pt-2">
                                    <span class="text-xs uppercase font-bold">TOTAL_MONTHLY_GENERATION</span>
                                    <span class="text-base font-bold underline">${Math.round(data.monthlyGen).toLocaleString()} kWh</span>
                                </div>
                            </div>
                        </div>

                        <div>
                            <p class="text-[10px] uppercase opacity-60 font-bold mb-3 tracking-widest">B. BILL_IMPACT_ANALYSIS</p>
                            <div class="space-y-4">
                                <div class="flex justify-between items-baseline border-b border-divider/50 pb-2">
                                    <span class="text-xs uppercase tier-3">Original_Monthly_Bill</span>
                                    <span class="text-sm font-bold">RM ${formatCurrency(data.oldBill.total_bill)}</span>
                                </div>
                                <div class="flex justify-between items-baseline border-b border-divider/50 pb-2">
                                    <span class="text-xs uppercase tier-3 text-emerald-600">New_Bill_After_Solar</span>
                                    <span class="text-sm font-bold text-emerald-600">RM ${formatCurrency(data.newBill.total_bill)}</span>
                                </div>
                                <div class="flex justify-between items-baseline pt-2">
                                    <span class="text-xs uppercase font-bold text-emerald-600">SAVING_FROM_BILL_REDUCTION</span>
                                    <span class="text-base font-bold text-emerald-600 underline">RM ${formatCurrency(data.billSaving)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="flex flex-col justify-between">
                        <div>
                            <p class="text-[10px] uppercase opacity-60 font-bold mb-3 tracking-widest">C. EXPORT_EARNING_CREDIT</p>
                            <div class="space-y-4">
                                <div class="flex justify-between items-baseline border-b border-divider/50 pb-2">
                                    <span class="text-xs uppercase tier-3">Total_Export_Volume</span>
                                    <span class="text-sm font-bold">${Math.round(data.monthlyExportKwh).toLocaleString()} kWh</span>
                                </div>
                                <div class="flex justify-between items-baseline border-b border-divider/50 pb-2">
                                    <span class="text-xs uppercase tier-3">NEM_NOVA_SMP_Rate</span>
                                    <span class="text-sm font-bold">RM ${parseFloat(document.getElementById('smpPrice').value).toFixed(2)} /kWh</span>
                                </div>
                                <div class="flex justify-between items-baseline pt-2">
                                    <span class="text-xs uppercase font-bold text-orange-600">EARNING_FROM_EXPORT_CREDIT</span>
                                    <span class="text-base font-bold text-orange-600 underline">RM ${formatCurrency(data.exportEarnings)}</span>
                                </div>
                            </div>
                        </div>

                        <div class="bg-emerald-50 border-2 border-emerald-600 p-6 md:p-8 mt-10 shadow-[6px_6px_0px_0px_rgba(16,185,129,0.1)]">
                            <h4 class="text-[10px] md:text-xs font-bold uppercase tracking-widest text-emerald-800 mb-6 border-b border-emerald-200 pb-2">06_TOTAL_ECONOMIC_BENEFIT</h4>
                            <div class="space-y-3">
                                <div class="flex justify-between text-xs font-bold text-emerald-700">
                                    <span>NET_MONTHLY_SAVINGS</span>
                                    <span class="text-xl md:text-2xl">RM ${formatCurrency(data.totalMonthlySavings)}</span>
                                </div>
                                <p class="text-[9px] text-emerald-600 uppercase font-semibold leading-relaxed">
                                    *Combined Value of Premise Energy Offset and Utility Export Credit.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <div class="flex flex-col items-center gap-4 pt-10 border-t border-divider">
                <div class="text-[10px] uppercase font-bold tier-3 opacity-60">Modeling_Hardware: ${data.pkg ? data.pkg.package_name : 'Custom_Commercial_Build'}</div>
                <button onclick="window.print()" class="text-[10px] font-bold uppercase tracking-widest border-2 border-fact px-10 py-4 hover:bg-black hover:text-white transition-all shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]">
                    [ DOWNLOAD_FULL_PRECISION_REPORT ]
                </button>
            </div>
        </div>
    `;
    resultsDiv.lastElementChild.scrollIntoView({ behavior: 'smooth' });
}

function formatCurrency(v) { return Number(v||0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

async function testConnection() {
    const s = document.getElementById('dbStatus');
    try {
        const r = await fetch('/api/health');
        s.innerHTML = r.ok ? `<span>[ STATUS: ONLINE ]</span><div class="h-px grow bg-divider"></div>` : `<span>[ STATUS: OFFLINE ]</span><div class="h-px grow bg-divider"></div>`;
    } catch { s.innerHTML = `<span>[ STATUS: ERROR ]</span><div class="h-px grow bg-divider"></div>`; }
}
window.testConnection = testConnection;
