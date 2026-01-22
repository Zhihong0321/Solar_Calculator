// Non-Domestic Solar Calculator JS

let db = {
    tariffs: [],
    packages: []
};

let latestSolarData = null;
let workingHours = {};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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

document.getElementById('billForm').addEventListener('submit', function(e) {
    e.preventDefault();
    calculateNonDomesticROI();
});

async function calculateNonDomesticROI() {
    const tariffType = document.getElementById('tariffType').value;
    const billAmount = parseFloat(document.getElementById('billAmount').value);

    if (!billAmount || billAmount <= 0) {
        alert('Please enter a valid bill amount');
        return;
    }

    // Show Loading State
    const resultsDiv = document.getElementById('calculatorResults');
    resultsDiv.innerHTML = '<div class="text-center py-20 text-xs font-bold uppercase animate-pulse">Analyzing_TNB_Database...</div>';

    try {
        const response = await fetch(`/api/commercial/calculate-bill?amount=${billAmount}`);
        const data = await response.json();

        if (!response.ok || !data.tariff) {
            throw new Error(data.error || 'Failed to fetch bill breakdown');
        }

        const tariff = data.tariff;
        const sunPeak = 3.4;
        const panelRating = 620;
        
        // Target system size
        const recommendedKw = (parseFloat(tariff.usage_kwh) / 30 / sunPeak) * 0.7; 
        const recommendedPanels = Math.max(1, Math.ceil((recommendedKw * 1000) / panelRating));

        // Find closest package
        let pkg = db.packages
            .filter(p => p.panel_qty === recommendedPanels && (p.type === 'Tariff B&D Low Voltage' || p.type === 'Residential'))
            .sort((a,b) => a.price - b.price)[0];

        if (!pkg) {
            pkg = db.packages
                .filter(p => p.type === 'Tariff B&D Low Voltage' || p.type === 'Residential')
                .sort((a,b) => Math.abs(a.panel_qty - recommendedPanels))[0];
        }

        const finalPanels = pkg ? pkg.panel_qty : recommendedPanels;
        const systemSizeKwp = (finalPanels * panelRating) / 1000;

        const results = performCalculation({
            tariffType,
            billAmount,
            tariff,
            recommendedPanels: finalPanels,
            panelRating,
            pkg,
            sunPeak,
            workingHours,
            systemSizeKwp
        });

        displayResults(results);
    } catch (err) {
        console.error(err);
        resultsDiv.innerHTML = `<div class="text-rose-600 font-bold p-4 border border-rose-600 bg-rose-50 uppercase text-xs">Error: ${err.message}</div>`;
    }
}

function getSolarIntegration(start, end) {
    const f = (t) => (10 / Math.PI) * Math.sin((Math.PI * (t - 12)) / 10);
    const solarStart = 7;
    const solarEnd = 17;
    const a = Math.max(solarStart, start);
    const b = Math.min(solarEnd, end);
    if (a >= b) return 0;
    const totalArea = f(solarEnd) - f(solarStart);
    const overlapArea = f(b) - f(a);
    return overlapArea / totalArea;
}

function performCalculation(input) {
    const { systemSizeKwp, sunPeak, workingHours, tariff } = input;
    const monthlyGen = systemSizeKwp * sunPeak * 30;
    
    let totalSolarOverlap = 0;
    DAYS.forEach(day => {
        const h = workingHours[day.toLowerCase()];
        totalSolarOverlap += getSolarIntegration(h.start, h.end);
    });
    
    const avgSolarOverlap = totalSolarOverlap / 7;
    const selfConsumedKwh = monthlyGen * avgSolarOverlap;
    const exportedKwh = monthlyGen * (1 - avgSolarOverlap);
    
    // Exact rates from DB lookup
    const energyChargePerKwh = parseFloat(tariff.energy_charge) / parseFloat(tariff.usage_kwh);
    const icptRate = 0.02; // Standard commercial ICPT
    const effectiveRate = energyChargePerKwh + icptRate;
    
    const selfConsumptionSavings = selfConsumedKwh * effectiveRate;
    const exportSavings = exportedKwh * effectiveRate;
    
    const totalMonthlySavings = selfConsumptionSavings + exportSavings;
    const systemCost = input.pkg ? input.pkg.price : systemSizeKwp * 3500;
    const payback = systemCost / (totalMonthlySavings * 12);

    return {
        ...input,
        monthlyGen,
        selfConsumedKwh,
        exportedKwh,
        totalMonthlySavings,
        systemCost,
        payback,
        avgSolarOverlap,
        effectiveRate
    };
}

function displayResults(data) {
    const resultsDiv = document.getElementById('calculatorResults');
    const roi = (data.totalMonthlySavings * 12 / data.systemCost) * 100;
    const t = data.tariff;

    resultsDiv.innerHTML = `
        <div class="space-y-12">
            <!-- Executive Summary -->
            <section class="bg-black text-white p-6 md:p-10 -mx-4 md:mx-0 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 border-b border-white/20 pb-6">
                    <div>
                        <h2 class="text-[10px] md:text-xs font-bold uppercase tracking-widest opacity-60">COMMERCIAL_ROI_SUMMARY</h2>
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
                        <p class="text-[10px] uppercase opacity-50 font-bold mb-1">Investment</p>
                        <p class="text-lg font-bold">RM ${data.systemCost.toLocaleString()}</p>
                    </div>
                    <div>
                        <p class="text-[10px] uppercase opacity-50 font-bold mb-1">Annual_ROI</p>
                        <p class="text-lg font-bold text-emerald-400">${roi.toFixed(1)}%</p>
                    </div>
                    <div class="text-right">
                        <p class="text-[10px] uppercase opacity-50 font-bold mb-1">Self_Consumption</p>
                        <p class="text-lg font-bold">${(data.avgSolarOverlap * 100).toFixed(0)}%</p>
                    </div>
                </div>
            </section>

            <!-- Bill Breakdown Ledger -->
            <section class="space-y-6">
                <h3 class="text-xs font-bold uppercase tracking-widest tier-2 border-b-2 border-fact inline-block pb-1">03_TNB_BILL_BREAKDOWN_MATCH</h3>
                <div class="grid md:grid-cols-2 gap-10">
                    <div class="space-y-4">
                        <div class="flex justify-between py-2 border-b border-divider">
                            <span class="text-xs uppercase tier-3">Usage_Matched</span>
                            <span class="text-sm font-bold">${t.usage_kwh} kWh</span>
                        </div>
                        <div class="flex justify-between py-2 border-b border-divider">
                            <span class="text-xs uppercase tier-3">Energy_Charge</span>
                            <span class="text-sm font-bold">RM ${parseFloat(t.energy_charge).toFixed(2)}</span>
                        </div>
                        <div class="flex justify-between py-2 border-b border-divider">
                            <span class="text-xs uppercase tier-3">Capacity_Charge</span>
                            <span class="text-sm font-bold">RM ${parseFloat(t.capacity_charge).toFixed(2)}</span>
                        </div>
                    </div>
                    <div class="space-y-4">
                        <div class="flex justify-between py-2 border-b border-divider">
                            <span class="text-xs uppercase tier-3">Network_Charge</span>
                            <span class="text-sm font-bold">RM ${parseFloat(t.network_charge).toFixed(2)}</span>
                        </div>
                        <div class="flex justify-between py-2 border-b border-divider">
                            <span class="text-xs uppercase tier-3">KWTBB_Fund</span>
                            <span class="text-sm font-bold">RM ${parseFloat(t.kwtbb_fund).toFixed(2)}</span>
                        </div>
                        <div class="flex justify-between py-2 border-b border-divider">
                            <span class="text-xs uppercase tier-3">Matched_Bill_Total</span>
                            <span class="text-sm font-bold underline">RM ${parseFloat(t.total_bill).toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </section>

            <!-- ROI Analysis -->
            <section class="space-y-6">
                <h3 class="text-xs font-bold uppercase tracking-widest tier-2 border-b-2 border-fact inline-block pb-1">04_SOLAR_ROI_ANALYSIS</h3>
                <div class="grid md:grid-cols-3 gap-6">
                    <div class="p-4 border border-divider">
                        <p class="text-[10px] uppercase opacity-50 font-bold mb-1">Monthly_Solar_Yield</p>
                        <p class="text-xl font-bold">${Math.round(data.monthlyGen)} kWh</p>
                    </div>
                    <div class="p-4 border border-divider bg-emerald-50/30">
                        <p class="text-[10px] uppercase text-emerald-800 font-bold mb-1">Effective_Rate_Saving</p>
                        <p class="text-xl font-bold">RM ${data.effectiveRate.toFixed(4)}/kWh</p>
                    </div>
                    <div class="p-4 border border-divider">
                        <p class="text-[10px] uppercase opacity-50 font-bold mb-1">NEM_Type</p>
                        <p class="text-xl font-bold">NEM NOVA</p>
                    </div>
                </div>
            </section>

            <div class="flex justify-center pt-6">
                <button onclick="window.print()" class="text-[10px] font-bold uppercase tracking-widest border border-divider px-6 py-3 hover:bg-black hover:text-white transition-all">
                    [ DOWNLOAD_FULL_ANALYSIS_PDF ]
                </button>
            </div>
        </div>
    `;
    resultsDiv.scrollIntoView({ behavior: 'smooth' });
}

async function testConnection() {
    const s = document.getElementById('dbStatus');
    try {
        const r = await fetch('/api/health');
        s.innerHTML = r.ok ? `<span>[ STATUS: ONLINE ]</span><div class="h-px grow bg-divider"></div>` : `<span>[ STATUS: OFFLINE ]</span><div class="h-px grow bg-divider"></div>`;
    } catch { s.innerHTML = `<span>[ STATUS: ERROR ]</span><div class="h-px grow bg-divider"></div>`; }
}
