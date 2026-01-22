// Non-Domestic Solar Calculator JS

let db = {
    tariffs: [],
    packages: []
};

let matchedBillData = null; // Store results from Step 1
let workingHours = {};
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Hourly Solar Generation Map (Percentage of daily yield)
// Peak at 12-1pm (16%)
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
            console.log('Data initialized:', db.packages.length, 'packages');
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

function formatTime(decimalHour) {
    const h = Math.floor(decimalHour);
    const m = Math.round((decimalHour % 1) * 60);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 || 12;
    return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
}

// STEP 1: Process Bill and Show Breakdown
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
        
        // Show Step 2
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

// STEP 2: Execute Full Analysis
async function executeFullAnalysis() {
    if (!matchedBillData) return;

    const sunPeak = parseFloat(document.getElementById('sunPeakHour').value);
    const panelRating = parseInt(document.getElementById('panelRating').value);
    const baseLoadPct = parseFloat(document.getElementById('baseLoadPercent').value) / 100;
    const smpPrice = parseFloat(document.getElementById('smpPrice').value);

    // 1. Calculate Load Profiles
    const totalMonthlyKwh = parseFloat(matchedBillData.usage_kwh);
    
    // Total Weekly Working Hours
    let weeklyWorkingHours = 0;
    DAYS.forEach(day => {
        const h = workingHours[day.toLowerCase()];
        weeklyWorkingHours += (h.end - h.start);
    });

    const hourlyBaseLoad = (totalMonthlyKwh * baseLoadPct) / 720;
    const hourlyOperationalLoad = (totalMonthlyKwh * (1 - baseLoadPct)) / (weeklyWorkingHours * 4.33);

    // 2. Recommend System Size (Target 70% of peak hourly consumption)
    const peakHourlyConsumption = hourlyBaseLoad + hourlyOperationalLoad;
    const recommendedKw = (peakHourlyConsumption / 0.7); // Simple heuristic
    let recommendedPanels = Math.max(1, Math.ceil((recommendedKw * 1000) / panelRating));
    
    // Find closest package
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

    // 3. Hourly Simulation for 1 Week
    let weeklyOffsetKwh = 0;
    let weeklyExportKwh = 0;

    for (let d = 0; d < 7; d++) {
        const dayName = DAYS[d].toLowerCase();
        const hours = workingHours[dayName];
        
        for (let h = 0; h < 24; h++) {
            const isWorking = h >= hours.start && h < hours.end;
            const currentLoad = isWorking ? (hourlyBaseLoad + hourlyOperationalLoad) : hourlyBaseLoad;
            const consumptionCap = currentLoad * 1.5;

            const solarGenPct = HOURLY_SOLAR_MAP[h] || 0;
            const hourlySolarGen = dailyGenKwh * solarGenPct;

            const offset = Math.min(hourlySolarGen, consumptionCap);
            const exportAmt = Math.max(0, hourlySolarGen - consumptionCap);

            weeklyOffsetKwh += offset;
            weeklyExportKwh += exportAmt;
        }
    }

    const monthlyOffsetKwh = weeklyOffsetKwh * 4.33;
    const monthlyExportKwh = weeklyExportKwh * 4.33;
    const newTotalUsageKwh = Math.max(0, totalMonthlyKwh - monthlyOffsetKwh);

    // 4. Calculate Bill After Solar (Fetch from DB by Usage)
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
            pkg
        });

    } catch (err) {
        console.error('Failed to lookup new bill:', err);
        alert('Simulation failed. Check console for details.');
    }
}

function displayFullROIResults(data) {
    const resultsDiv = document.getElementById('calculatorResults');
    const roi = (data.totalMonthlySavings * 12 / data.systemCost) * 100;

    // Append to existing Step 1 results
    resultsDiv.innerHTML += `
        <div class="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <section class="bg-black text-white p-6 md:p-10 -mx-4 md:mx-0 shadow-[8px_8px_0px_0px_rgba(16,185,129,0.3)] border-2 border-emerald-500/30">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 border-b border-white/20 pb-6">
                    <div>
                        <h2 class="text-[10px] md:text-xs font-bold uppercase tracking-widest text-emerald-400">04_PRECISION_ROI_SUMMARY</h2>
                        <div class="text-3xl md:text-4xl font-bold tracking-tight mt-1">RM ${data.totalMonthlySavings.toLocaleString(undefined, {minimumFractionDigits: 2})}<span class="text-base md:text-lg opacity-50 font-normal"> /mo</span></div>
                    </div>
                    <div class="text-left md:text-right">
                        <div class="text-[10px] md:text-xs font-bold uppercase tracking-widest opacity-60">Payback_Period</div>
                        <div class="text-3xl md:text-4xl font-bold tracking-tight mt-1 text-emerald-400">${data.payback.toFixed(1)}<span class="text-base md:text-lg opacity-70 font-normal"> Years</span></div>
                    </div>
                </div>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div>
                        <p class="text-[10px] uppercase opacity-50 font-bold mb-1">System_Size</p>
                        <p class="text-lg font-bold">${data.systemSizeKwp.toFixed(2)} kWp</p>
                    </div>
                    <div>
                        <p class="text-[10px] uppercase opacity-50 font-bold mb-1">Total_Investment</p>
                        <p class="text-lg font-bold">RM ${data.systemCost.toLocaleString()}</p>
                    </div>
                    <div>
                        <p class="text-[10px] uppercase opacity-50 font-bold mb-1">Annual_Yield</p>
                        <p class="text-lg font-bold text-emerald-400">${roi.toFixed(1)}%</p>
                    </div>
                    <div class="text-right">
                        <p class="text-[10px] uppercase opacity-50 font-bold mb-1">Direct_Offset</p>
                        <p class="text-lg font-bold text-emerald-400">${Math.round((data.monthlyOffsetKwh/data.monthlyGen)*100)}%</p>
                    </div>
                </div>
            </section>

            <section class="space-y-6">
                <h3 class="text-xs font-bold uppercase tracking-widest tier-2 border-b-2 border-fact inline-block pb-1">05_SIMULATION_LEDGER</h3>
                <div class="grid md:grid-cols-2 gap-10">
                    <div class="space-y-4">
                        <div class="flex justify-between py-2 border-b border-divider">
                            <span class="text-xs uppercase tier-3">Monthly_Solar_Yield</span>
                            <span class="text-sm font-bold">${Math.round(data.monthlyGen)} kWh</span>
                        </div>
                        <div class="flex justify-between py-2 border-b border-divider">
                            <span class="text-xs uppercase tier-3">Premise_Self_Consumed</span>
                            <span class="text-sm font-bold text-emerald-600">${Math.round(data.monthlyOffsetKwh)} kWh</span>
                        </div>
                        <div class="flex justify-between py-2 border-b border-divider">
                            <span class="text-xs uppercase tier-3">Exported_to_Grid</span>
                            <span class="text-sm font-bold text-orange-600">${Math.round(data.monthlyExportKwh)} kWh</span>
                        </div>
                    </div>
                    <div class="space-y-4">
                        <div class="flex justify-between py-2 border-b border-divider">
                            <span class="text-xs uppercase tier-3">Bill_Saving (Offset)</span>
                            <span class="text-sm font-bold">RM ${formatCurrency(data.billSaving)}</span>
                        </div>
                        <div class="flex justify-between py-2 border-b border-divider">
                            <span class="text-xs uppercase tier-3">Export_Earnings (SMP)</span>
                            <span class="text-sm font-bold">RM ${formatCurrency(data.exportEarnings)}</span>
                        </div>
                        <div class="flex justify-between py-2 border-b border-divider">
                            <span class="text-xs uppercase tier-3">Net_Import_After_Solar</span>
                            <span class="text-sm font-bold underline">RM ${formatCurrency(data.newBill.total_bill)}</span>
                        </div>
                    </div>
                </div>
            </section>

            <div class="flex flex-col items-center gap-4 pt-6">
                <div class="text-[10px] uppercase font-bold tier-3 opacity-60">Modeling_Package: ${data.pkg ? data.pkg.package_name : 'Custom_Commercial_Build'}</div>
                <button onclick="window.print()" class="text-[10px] font-bold uppercase tracking-widest border-2 border-fact px-8 py-3 hover:bg-black hover:text-white transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] hover:shadow-none">
                    [ DOWNLOAD_PRECISION_REPORT ]
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