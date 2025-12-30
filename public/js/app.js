// State Management
let latestSolarParams = null;
let latestSolarData = null;
let originalSolarData = null; // Baseline for price comparison
let currentHistoricalAfaRate = 0;
let panelUpdateInFlight = false;

// Data Cache (Client-Side DB)
let db = {
    tariffs: [],
    packages: []
};

// Charts
const chartInstances = {
    electricity: null,
    solar: null,
    combined: null
};

// --- Initialization ---
window.onload = function() {
    testConnection();
    initializeData();
};

async function initializeData() {
    try {
        const response = await fetch('/api/all-data');
        const data = await response.json();
        if (response.ok) {
            db.tariffs = data.tariffs.map(t => ({
                ...t,
                // Ensure numerics
                usage_kwh: parseFloat(t.usage_kwh),
                bill_total_normal: parseFloat(t.bill_total_normal),
                usage_normal: parseFloat(t.usage_normal),
                network: parseFloat(t.network),
                capacity: parseFloat(t.capacity),
                retail: parseFloat(t.retail),
                eei: parseFloat(t.eei),
                sst_normal: parseFloat(t.sst_normal),
                kwtbb_normal: parseFloat(t.kwtbb_normal)
            }));
            
            db.packages = data.packages.map(p => ({
                ...p,
                panel_qty: parseInt(p.panel_qty),
                price: parseFloat(p.price),
                solar_output_rating: parseInt(p.solar_output_rating)
            }));
            
            console.log('Client-side DB initialized:', db.tariffs.length, 'tariffs,', db.packages.length, 'packages');
        }
    } catch (err) {
        showNotification('Failed to load calculation data. Please refresh.', 'error');
        console.error(err);
    }
}

// --- Logic Engine (Ported from Server.js) ---

class SolarCalculator {
    constructor(tariffs, packages) {
        this.tariffs = tariffs;
        this.packages = packages;
    }

    findClosestTariff(targetAmount, afaRate) {
        // SQL: WHERE (bill + usage*afa) <= target ORDER BY adjusted_total DESC LIMIT 1
        // Adjusted for JS sort/find
        
        // Calculate adjusted total for all tariffs
        const candidates = this.tariffs.map(t => ({
            ...t,
            adjusted_total: t.bill_total_normal + (t.usage_kwh * afaRate)
        }));

        // Sort descending by adjusted_total
        candidates.sort((a, b) => b.adjusted_total - a.adjusted_total);

        // Find first one <= target
        const match = candidates.find(t => t.adjusted_total <= targetAmount);

        if (match) return match;

        // Fallback: Lowest possible (Sort ASC, take first)
        candidates.sort((a, b) => a.adjusted_total - b.adjusted_total);
        return candidates.length > 0 ? candidates[0] : null;
    }

    lookupTariffByUsage(usageValue) {
        if (usageValue <= 0) {
             // Lowest usage
             const sorted = [...this.tariffs].sort((a, b) => a.usage_kwh - b.usage_kwh);
             return sorted[0] || null;
        }

        // WHERE usage_kwh <= usageValue ORDER BY usage_kwh DESC LIMIT 1
        const sorted = [...this.tariffs].sort((a, b) => b.usage_kwh - a.usage_kwh);
        const match = sorted.find(t => t.usage_kwh <= usageValue);

        if (match) return match;

        // Fallback to lowest
        return [...this.tariffs].sort((a, b) => a.usage_kwh - b.usage_kwh)[0] || null;
    }

    calculate(params) {
        const {
            amount, sunPeakHour, morningUsage, panelType, 
            smpPrice, afaRate, historicalAfaRate, 
            percentDiscount, fixedDiscount, batterySize, overridePanels
        } = params;

        // 1. Initial Tariff Lookup
        const tariff = this.findClosestTariff(amount, historicalAfaRate);
        if (!tariff) throw new Error('No tariff data found');

        const monthlyUsageKwh = tariff.usage_kwh;

        // 2. Panel Recommendation
        // Formula: usage_kwh / sun_peak_hour / 30 / 0.62 = X, then floor(X)
        const recommendedPanelsRaw = Math.floor(monthlyUsageKwh / sunPeakHour / 30 / 0.62);
        const recommendedPanels = Math.max(1, recommendedPanelsRaw);
        const actualPanelQty = overridePanels !== null ? overridePanels : recommendedPanels;

        // 3. Package Selection
        // Filter by panel_qty, active=true, type='Residential', solar_output_rating (wattage)
        // Sort by price ASC
        let selectedPackage = this.packages
            .filter(p => 
                p.panel_qty === actualPanelQty && 
                p.active === true && 
                (p.special === false || p.special === null) &&
                p.type === 'Residential' &&
                p.solar_output_rating === panelType
            )
            .sort((a, b) => a.price - b.price)[0] || null;

        // 4. Solar Generation
        const dailySolarGeneration = (actualPanelQty * panelType * sunPeakHour) / 1000;
        const monthlySolarGeneration = dailySolarGeneration * 30;

        // 5. Morning Split
        const morningUsageKwh = (monthlyUsageKwh * morningUsage) / 100;
        const morningSelfConsumption = Math.min(monthlySolarGeneration, morningUsageKwh);

        // 6. Battery Logic
        const dailyExcessSolar = Math.max(0, monthlySolarGeneration - morningUsageKwh) / 30;
        const dailyNightUsage = Math.max(0, monthlyUsageKwh - morningUsageKwh) / 30;
        const dailyBatteryCap = batterySize;
        const dailyMaxDischarge = Math.min(dailyExcessSolar, dailyNightUsage, dailyBatteryCap);
        const monthlyMaxDischarge = dailyMaxDischarge * 30;

        // 7. Energy Accounting
        // Baseline (No Battery)
        const netUsageBaseline = Math.max(0, monthlyUsageKwh - morningSelfConsumption);
        const netUsageBaselineForLookup = Math.max(0, Math.floor(netUsageBaseline));
        const exportKwhBaseline = Math.max(0, monthlySolarGeneration - morningUsageKwh);

        // With Battery
        const netUsageKwh = Math.max(0, monthlyUsageKwh - morningSelfConsumption - monthlyMaxDischarge);
        const netUsageForLookup = Math.max(0, Math.floor(netUsageKwh));
        const exportKwh = Math.max(0, monthlySolarGeneration - morningUsageKwh - monthlyMaxDischarge);

        // 8. Financials
        const baselineTariff = this.lookupTariffByUsage(netUsageBaselineForLookup);
        const afterTariff = this.lookupTariffByUsage(netUsageForLookup);

        const morningSaving = morningUsageKwh * (0.4869 + afaRate);
        const exportSaving = exportKwh * smpPrice;
        const exportSavingBaseline = exportKwhBaseline * smpPrice;

        const buildBreakdown = (t) => {
            if (!t) return null;
            const afa = t.usage_kwh * afaRate;
            const total = t.bill_total_normal + afa;
            return {
                usage: t.usage_normal,
                network: t.network,
                capacity: t.capacity,
                sst: t.sst_normal,
                eei: t.eei,
                afa,
                total,
                totalBase: total - afa
            };
        };

        const beforeBreakdown = buildBreakdown(tariff);
        const afterBreakdown = buildBreakdown(afterTariff);
        const baselineBreakdown = buildBreakdown(baselineTariff);

        const billBefore = beforeBreakdown.total;
        
        // Baseline Bills
        const afterBillBaseline = baselineBreakdown ? baselineBreakdown.total : null;
        const billReductionBaseline = afterBillBaseline !== null ? Math.max(0, billBefore - afterBillBaseline) : morningSaving;
        const totalMonthlySavingsBaseline = morningSaving + exportSavingBaseline; // Logic correction: should match server formula closely? 
        // Server formula: (billBefore - afterBillBaseline) + exportSavingBaseline OR morningSaving + export...
        // Let's stick to Bill Reduction + Export
        const totalSavingsBaselineCalculated = (beforeBreakdown.total - baselineBreakdown.total) + exportSavingBaseline;

        // With Battery
        const afterBill = afterBreakdown ? afterBreakdown.total : null;
        const billReduction = afterBill !== null ? Math.max(0, billBefore - afterBill) : morningSaving;
        const totalMonthlySavings = (beforeBreakdown.total - afterBreakdown.total) + exportSaving;

        // Discounts & ROI
        let systemCostBeforeDiscount = null, finalSystemCost = null, totalDiscountAmount = 0, paybackPeriod = 'N/A';
        
        if (selectedPackage) {
            systemCostBeforeDiscount = selectedPackage.price;
            const afterPercent = systemCostBeforeDiscount * (1 - percentDiscount / 100);
            finalSystemCost = Math.max(0, afterPercent - fixedDiscount);
            totalDiscountAmount = systemCostBeforeDiscount - finalSystemCost;
            if (totalMonthlySavings > 0 && finalSystemCost > 0) {
                paybackPeriod = (finalSystemCost / (totalMonthlySavings * 12)).toFixed(1);
            }
        }

        // Patterns (for Charts)
        const dailyUsageKwh = monthlyUsageKwh / 30;
        const electricityUsagePattern = [];
        for (let hour = 0; hour < 24; hour++) {
            let m;
            if (hour >= 6 && hour <= 9) m = 1.8 * (morningUsage / 100);
            else if (hour >= 18 && hour <= 22) m = 2.2;
            else if (hour >= 10 && hour <= 17) m = 0.8 * (1 - (morningUsage / 100) * 0.3);
            else m = 0.3;
            electricityUsagePattern.push({ hour, usage: (dailyUsageKwh * m / 10).toFixed(3) });
        }

        const solarGenPattern = [];
        for (let hour = 0; hour < 24; hour++) {
            let m = 0;
            if (hour >= 7 && hour <= 19) {
                m = Math.max(0, Math.cos((Math.abs(hour - 12) / 5) * (Math.PI / 2)));
            }
            solarGenPattern.push({ hour, generation: (dailySolarGeneration * m / 8).toFixed(3) });
        }

        return {
            config: params,
            recommendedPanels,
            actualPanels: actualPanelQty,
            panelAdjustment: actualPanelQty - recommendedPanels,
            overrideApplied: overridePanels !== null,
            selectedPackage: selectedPackage ? {
                packageName: selectedPackage.package_name,
                price: selectedPackage.price,
                panelWattage: panelType
            } : null,
            solarConfig: `${actualPanelQty} x ${panelType}W panels (${(actualPanelQty * panelType / 1000).toFixed(1)} kW system)`,
            monthlySavings: totalMonthlySavings.toFixed(2),
            systemCostBeforeDiscount: systemCostBeforeDiscount,
            totalDiscountAmount,
            finalSystemCost: finalSystemCost !== null ? finalSystemCost.toFixed(2) : null,
            paybackPeriod,
            details: {
                monthlyUsageKwh,
                monthlySolarGeneration: monthlySolarGeneration.toFixed(2),
                billBefore: billBefore.toFixed(2),
                billAfter: afterBill !== null ? afterBill.toFixed(2) : null,
                billReduction: billReduction.toFixed(2),
                exportSaving: exportSaving.toFixed(2),
                totalGeneration: monthlySolarGeneration.toFixed(2),
                savingsBreakdown: {
                    afaImpact: (monthlyUsageKwh - netUsageBaseline) * afaRate,
                    baseBillReduction: billReductionBaseline - ((monthlyUsageKwh - netUsageBaseline) * afaRate),
                },
                battery: {
                    baseline: {
                        billReduction: billReductionBaseline,
                        exportCredit: exportSavingBaseline,
                        totalSavings: totalSavingsBaselineCalculated.toFixed(2),
                        billAfter: afterBillBaseline,
                        billBreakdown: {
                            items: [
                                { label: 'Usage', before: beforeBreakdown.usage, after: baselineBreakdown.usage, delta: beforeBreakdown.usage - baselineBreakdown.usage },
                                { label: 'Network', before: beforeBreakdown.network, after: baselineBreakdown.network, delta: beforeBreakdown.network - baselineBreakdown.network },
                                { label: 'Capacity Fee', before: beforeBreakdown.capacity, after: baselineBreakdown.capacity, delta: beforeBreakdown.capacity - baselineBreakdown.capacity },
                                { label: 'SST', before: beforeBreakdown.sst, after: baselineBreakdown.sst, delta: beforeBreakdown.sst - baselineBreakdown.sst },
                                { label: 'EEI', before: beforeBreakdown.eei, after: baselineBreakdown.eei, delta: beforeBreakdown.eei - baselineBreakdown.eei },
                                { label: 'AFA Charge', before: beforeBreakdown.afa, after: baselineBreakdown.afa, delta: beforeBreakdown.afa - baselineBreakdown.afa }
                            ]
                        }
                    }
                }
            },
            billBreakdownComparison: {
                items: [
                    { label: 'Usage', before: beforeBreakdown.usage, after: afterBreakdown.usage, delta: beforeBreakdown.usage - afterBreakdown.usage },
                    { label: 'Network', before: beforeBreakdown.network, after: afterBreakdown.network, delta: beforeBreakdown.network - afterBreakdown.network },
                    { label: 'Capacity Fee', before: beforeBreakdown.capacity, after: afterBreakdown.capacity, delta: beforeBreakdown.capacity - afterBreakdown.capacity },
                    { label: 'SST', before: beforeBreakdown.sst, after: afterBreakdown.sst, delta: beforeBreakdown.sst - afterBreakdown.sst },
                    { label: 'EEI', before: beforeBreakdown.eei, after: afterBreakdown.eei, delta: beforeBreakdown.eei - afterBreakdown.eei },
                    { label: 'AFA Charge', before: beforeBreakdown.afa, after: afterBreakdown.afa, delta: beforeBreakdown.afa - afterBreakdown.afa }
                ]
            },
            charts: {
                electricityUsagePattern,
                solarGenerationPattern: solarGenPattern
            }
        };
    }
}

// --- Interaction ---

document.getElementById('billForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    if (!db.tariffs.length) return showNotification('System initializing... please wait.', 'info');

    const billAmount = parseFloat(document.getElementById('billAmount').value);
    const afaRate = parseFloat(document.getElementById('historicalAfaRate').value) || 0;
    
    if (!billAmount || billAmount <= 0) return showNotification('Please enter a valid bill amount', 'error');

    // 1. Bill Breakdown (Instant Client-Side)
    const calculator = new SolarCalculator(db.tariffs, db.packages);
    const tariff = calculator.findClosestTariff(billAmount, afaRate);
    
    if (tariff) {
        // Mocking the structure expected by displayBillBreakdown
        const data = {
            tariff: tariff,
            afaRate: afaRate
        };
        displayBillBreakdown(data);
        currentHistoricalAfaRate = afaRate;
        const projInput = document.getElementById('afaRate');
        if (projInput) projInput.value = afaRate.toFixed(4);
    } else {
        showNotification('No tariff found for this amount.', 'error');
    }
});

window.calculateSolarSavings = function() {
    if (!db.tariffs.length) return showNotification('System initializing...', 'info');

    // Inputs
    const params = {
        amount: parseFloat(document.getElementById('billAmount').value),
        sunPeakHour: parseFloat(document.getElementById('sunPeakHour').value),
        morningUsage: parseFloat(document.getElementById('morningUsage').value),
        panelType: parseInt(document.getElementById('panelRating').value),
        smpPrice: parseFloat(document.getElementById('smpPrice').value),
        afaRate: parseFloat(document.getElementById('afaRate').value) || 0,
        historicalAfaRate: currentHistoricalAfaRate,
        percentDiscount: parseFloat(document.getElementById('percentDiscount').value) || 0,
        fixedDiscount: parseFloat(document.getElementById('fixedDiscount').value) || 0,
        batterySize: 0,
        overridePanels: null
    };

    latestSolarParams = params;
    
    try {
        const calculator = new SolarCalculator(db.tariffs, db.packages);
        const result = calculator.calculate(params);
        
        latestSolarData = result;
        originalSolarData = result; // Baseline

        displaySolarCalculation(result);
        showPanelRecommendationPopup(result);
    } catch (err) {
        showNotification(err.message, 'error');
    }
};

// The "Instant" Update
window.triggerSpontaneousUpdate = function() {
    if (!latestSolarParams) return;

    // Update Params from UI
    latestSolarParams.sunPeakHour = parseFloat(document.getElementById('sunPeakHour').value) || 3.4;
    latestSolarParams.morningUsage = parseFloat(document.getElementById('morningUsage').value) || 30;
    latestSolarParams.panelType = parseInt(document.getElementById('panelRating').value) || 620;
    latestSolarParams.afaRate = parseFloat(document.getElementById('afaRate').value) || 0;
    latestSolarParams.smpPrice = parseFloat(document.getElementById('smpPrice').value) || 0.2703;
    latestSolarParams.percentDiscount = parseFloat(document.getElementById('percentDiscount')?.value) || 0;
    latestSolarParams.fixedDiscount = parseFloat(document.getElementById('fixedDiscount')?.value) || 0;

    // Run Sync Calculation (No Debounce Needed for Client-Side Speed)
    try {
        const calculator = new SolarCalculator(db.tariffs, db.packages);
        const result = calculator.calculate(latestSolarParams);
        
        // Preserve override state if it exists in UI
        if (latestSolarData && latestSolarData.overrideApplied) {
            // Recalculate with override if user was in override mode?
            // For now, let's just update the data. The loop below handles it.
        }
        
        latestSolarData = result;
        displaySolarCalculation(result);
    } catch (err) {
        console.error(err);
    }
};

// Override / Panel Modulation
async function requestPanelUpdate(newCount) {
    if (!latestSolarParams) return;

    latestSolarParams.overridePanels = newCount;
    
    // Sync Calculation
    try {
        const calculator = new SolarCalculator(db.tariffs, db.packages);
        const result = calculator.calculate(latestSolarParams);
        
        latestSolarData = result;
        displaySolarCalculation(result);
    } catch (err) {
        showNotification(err.message, 'error');
    }
}


// --- UI Helpers (Keep as is, just remove server calls) ---

// (Copying the display logic from previous step, but ensuring it maps correctly to the new object structure)

function displayBillBreakdown(data) {
    const resultsDiv = document.getElementById('calculatorResults');
    const tariff = data.tariff;
    const afaRate = data.afaRate || 0;
    const usageKwh = parseFloat(tariff.usage_kwh) || 0;
    const afaCharge = usageKwh * afaRate;
    const adjustedTotal = (parseFloat(tariff.bill_total_normal) || 0) + afaCharge;

    resultsDiv.innerHTML = `
        <div class="space-y-20 md:space-y-32">
            <section class="pt-4">
                <h2 class="text-sm font-bold uppercase tracking-[0.2em] mb-10 md:mb-14 tier-2 border-b-2 border-fact inline-block pb-1">02_BILL_ANALYSIS_LEDGER</h2>
                
                <div class="space-y-4 text-sm md:text-base">
                    <div class="flex justify-between tier-3 uppercase text-xs md:text-xs tracking-widest mb-6 border-b border-divider pb-2">
                        <span>Component</span>
                        <span>Value_(RM)</span>
                    </div>
                    <div class="flex justify-between py-2 gap-4 border-b border-divider/50">
                        <span class="tier-2 truncate">Energy_Usage</span>
                        <span class="tier-1 font-medium whitespace-nowrap">${formatCurrency(tariff.usage_normal)}</span>
                    </div>
                    <div class="flex justify-between py-2 gap-4 border-b border-divider/50">
                        <span class="tier-2 truncate">Network_Fee</span>
                        <span class="tier-1 font-medium whitespace-nowrap">${formatCurrency(tariff.network)}</span>
                    </div>
                    <div class="flex justify-between py-2 gap-4 border-b border-divider/50">
                        <span class="tier-2 truncate">Capacity_Charge</span>
                        <span class="tier-1 font-medium whitespace-nowrap">${formatCurrency(tariff.capacity)}</span>
                    </div>
                    <div class="flex justify-between py-2 gap-4 border-b border-divider/50">
                        <span class="tier-2 truncate">Retail_Charge</span>
                        <span class="tier-1 font-medium whitespace-nowrap">${formatCurrency(tariff.retail)}</span>
                    </div>
                    <div class="flex justify-between py-2 gap-4 border-b border-divider/50">
                        <span class="tier-2 truncate">EEI_Adjustment</span>
                        <span class="tier-1 font-medium whitespace-nowrap">${formatCurrency(tariff.eei)}</span>
                    </div>
                    <div class="flex justify-between py-2 gap-4 border-b border-divider/50">
                        <span class="tier-2 truncate">SST_Tax</span>
                        <span class="tier-1 font-medium whitespace-nowrap">${formatCurrency(tariff.sst_normal)}</span>
                    </div>
                    <div class="flex justify-between py-2 gap-4 border-b border-divider/50">
                        <span class="tier-2 truncate">KWTBB_Fund</span>
                        <span class="tier-1 font-medium whitespace-nowrap">${formatCurrency(tariff.kwtbb_normal)}</span>
                    </div>
                    <div class="flex justify-between py-2 gap-4 border-b border-divider/50">
                        <span class="tier-2 truncate">AFA_Adjustment</span>
                        <span class="${afaCharge < 0 ? 'text-emerald-600' : 'tier-1'} font-medium whitespace-nowrap">${formatCurrency(afaCharge)}</span>
                    </div>
                    <div class="ledger-double-line pt-6 mt-8 flex justify-between items-baseline gap-4">
                        <span class="text-xs md:text-sm font-bold uppercase tracking-[0.2em]">Total_Matched</span>
                        <span class="text-3xl md:text-4xl font-bold tracking-tighter whitespace-nowrap">RM ${formatCurrency(adjustedTotal)}</span>
                    </div>
                    <div class="mt-10 flex justify-between items-center text-xs md:text-xs tier-3 uppercase tracking-widest gap-4 border-t border-divider pt-4">
                        <span>Derived_Usage: ${tariff.usage_kwh} kWh</span>
                        <span class="text-right">Tolerance: +/- 0.01%</span>
                    </div>
                </div>
            </section>

            <section id="solar-config-section" class="pt-4">
                <h2 class="text-sm font-bold uppercase tracking-[0.2em] mb-10 md:mb-14 tier-2 border-b-2 border-fact inline-block pb-1">03_MODELING_PARAMS</h2>
                <div class="grid gap-12 md:grid-cols-2 md:gap-x-24 md:gap-y-16">
                    <div class="space-y-4">
                        <label class="block text-xs uppercase tracking-[0.15em] tier-3 font-semibold">Sun_Peak_Hours</label>
                        <div class="border-b-2 border-divider focus-within:border-fact transition-colors pb-1">
                            <input type="number" id="sunPeakHour" step="0.1" min="3.0" max="4.5" value="3.4" oninput="triggerSpontaneousUpdate()" class="w-full text-xl md:text-2xl font-bold bg-transparent border-none outline-none py-1">
                        </div>
                        <p class="text-xs md:text-xs tier-3 uppercase opacity-70">Standard: 3.0 - 4.5 h</p>
                    </div>
                    <div class="space-y-4">
                        <label class="block text-xs uppercase tracking-[0.15em] tier-3 font-semibold">Day_Usage_Share (%)</label>
                        <div class="border-b-2 border-divider focus-within:border-fact transition-colors pb-1">
                            <input type="number" id="morningUsage" min="1" max="100" value="30" oninput="triggerSpontaneousUpdate()" class="w-full text-xl md:text-2xl font-bold bg-transparent border-none outline-none py-1">
                        </div>
                        <p class="text-xs md:text-xs tier-3 uppercase opacity-70">Range: 1% - 100%</p>
                    </div>
                    <div class="space-y-4">
                        <label class="block text-xs uppercase tracking-[0.15em] tier-3 font-semibold">Panel_Rating (W)</label>
                        <div class="border-b-2 border-divider focus-within:border-fact transition-colors pb-1">
                            <input type="number" id="panelRating" step="1" min="450" max="850" value="620" oninput="triggerSpontaneousUpdate()" class="w-full text-xl md:text-2xl font-bold bg-transparent border-none outline-none py-1">
                        </div>
                        <p class="text-xs md:text-xs tier-3 uppercase opacity-70">Range: 450W - 850W</p>
                    </div>
                    <div class="space-y-4">
                        <label class="block text-xs uppercase tracking-[0.15em] tier-3 font-semibold">AFA_Projection (RM)</label>
                        <div class="border-b-2 border-divider focus-within:border-fact transition-colors pb-1">
                            <input type="number" id="afaRate" step="0.0001" value="0.0000" oninput="triggerSpontaneousUpdate()" class="w-full text-xl md:text-2xl font-bold bg-transparent border-none outline-none py-1">
                        </div>
                        <p class="text-xs md:text-xs tier-3 uppercase opacity-70">Fuel Adjustment</p>
                    </div>
                    <div class="space-y-4">
                        <label class="block text-xs uppercase tracking-[0.15em] tier-3 font-semibold">Export_Rate (RM)</label>
                        <div class="border-b-2 border-divider focus-within:border-fact transition-colors pb-1">
                            <input type="number" id="smpPrice" step="0.0001" min="0.19" max="0.2703" value="0.2703" oninput="triggerSpontaneousUpdate()" class="w-full text-xl md:text-2xl font-bold bg-transparent border-none outline-none py-1">
                        </div>
                        <p class="text-xs md:text-xs tier-3 uppercase opacity-70">NEM SMP Price</p>
                    </div>
                    <div class="md:col-span-2 mt-4">
                        <div class="p-8 md:p-10 border-2 border-divider bg-white/30">
                            <h4 class="text-xs md:text-xs font-bold uppercase tracking-[0.2em] tier-3 mb-10 border-b border-divider pb-2 inline-block">Discount_Protocol</h4>
                            <div class="grid gap-8 md:grid-cols-2">
                                <div class="space-y-4">
                                    <label class="block text-xs uppercase tracking-[0.15em] tier-3 font-semibold">Percentage (%)</label>
                                    <div class="border-b-2 border-divider focus-within:border-fact transition-colors pb-1">
                                        <input type="number" id="percentDiscount" step="0.01" min="0" max="100" value="0" oninput="triggerSpontaneousUpdate()" class="w-full text-lg font-bold bg-transparent border-none outline-none py-1">
                                    </div>
                                </div>
                                <div class="space-y-4">
                                    <label class="block text-xs uppercase tracking-[0.15em] tier-3 font-semibold">Fixed (RM)</label>
                                    <div class="border-b-2 border-divider focus-within:border-fact transition-colors pb-1">
                                        <input type="number" id="fixedDiscount" step="0.01" min="0" value="0" oninput="triggerSpontaneousUpdate()" class="w-full text-lg font-bold bg-transparent border-none outline-none py-1">
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="md:col-span-2 pt-8">
                        <button
                            onclick="calculateSolarSavings()"
                            class="text-xs md:text-sm font-bold uppercase tracking-[0.3em] border-2 border-fact px-10 py-4 md:px-12 md:py-5 hover:bg-black hover:text-white transition-all w-full sm:w-auto shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
                        >
                            Generate_ROI_Matrix ->
                        </button>
                    </div>
                </div>
            </section>
        </div>
    `;
}

function displaySolarCalculation(data) {
    const resultsDiv = document.getElementById('calculatorResults');
    let solarDiv = document.getElementById('solarResultsCard');
    const isInitialRender = !solarDiv;

    // Helper to safety parse numbers
    const toNumber = (val) => Number(val) || 0;

    const detailSource = data.details || {};
    const monthlySavingsValue = toNumber(data.monthlySavings);
    const annualReturnValue = monthlySavingsValue * 12;
    const finalSystemCostValue = data.finalSystemCost !== null ? toNumber(data.finalSystemCost) : null;
    
    // Baseline (No Battery) Stats
    let baselineStats = {
        billReduction: formatCurrency(detailSource.billReduction),
        exportCredit: formatCurrency(detailSource.exportSaving),
        totalSavings: formatCurrency(monthlySavingsValue),
        billAfter: detailSource.billAfter !== null ? formatCurrency(detailSource.billAfter) : 'N/A',
        billBreakdown: data.billBreakdownComparison,
        afaImpact: formatCurrency(detailSource.savingsBreakdown?.afaImpact || 0),
        baseBillReduction: formatCurrency(detailSource.savingsBreakdown?.baseBillReduction || 0)
    };

    if (detailSource.battery && detailSource.battery.baseline) {
        const b = detailSource.battery.baseline;
        baselineStats = {
            billReduction: formatCurrency(b.billReduction),
            exportCredit: formatCurrency(b.exportCredit),
            totalSavings: formatCurrency(b.totalSavings),
            billAfter: b.billAfter !== null ? formatCurrency(b.billAfter) : 'N/A',
            billBreakdown: b.billBreakdown || data.billBreakdownComparison,
            afaImpact: formatCurrency(detailSource.savingsBreakdown?.afaImpact || 0), // Use main AFA calc
            baseBillReduction: formatCurrency(b.baseBillReduction || 0)
        };
    }

    const roiValue = (finalSystemCostValue && finalSystemCostValue > 0)
        ? (annualReturnValue / finalSystemCostValue) * 100
        : null;
    const roiDisplay = roiValue !== null ? `${formatPercentage(roiValue, 1)}%` : 'N/A';
    const paybackDisplay = data.paybackPeriod === null || data.paybackPeriod === 'N/A' 
        ? 'N/A' 
        : `${data.paybackPeriod} yr`;

    const buildLedgerRows = (breakdownData) => {
        const items = Array.isArray(breakdownData?.items) ? breakdownData.items : [];
        return items.map((item) => `
            <div class="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-4 py-2 border-b border-divider/50">
                <span class="tier-2 uppercase text-xs tracking-widest">${item.label.replace(' ', '_')}</span>
                <span class="tier-1 text-right">${formatCurrency(item.before)}</span>
                <span class="tier-1 text-right">${item.after !== null ? formatCurrency(item.after) : '---'}</span>
                <span class="${item.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'} text-right font-bold">${item.delta >= 0 ? '-' : '+'}${formatCurrency(Math.abs(item.delta))}</span>
            </div>
        `).join('');
    };

    if (!solarDiv) {
        solarDiv = document.createElement('div');
        solarDiv.id = 'solarResultsCard';
        resultsDiv.appendChild(solarDiv);
    }

    solarDiv.innerHTML = `
        <div class="space-y-20 md:space-y-32">
            <!-- 04 EXECUTIVE SUMMARY -->
            <section class="bg-black text-white p-10 md:p-16 -mx-4 md:-mx-6 shadow-2xl">
                <h2 class="text-xs font-bold uppercase tracking-[0.4em] mb-12 opacity-70 border-b border-white/20 pb-2 inline-block">ROI_EXECUTIVE_SUMMARY</h2>
                <div class="space-y-10 text-base md:text-lg">
                    <div class="space-y-4">
                        <p class="opacity-70 uppercase text-xs tracking-widest">Baseline_Consumption</p>
                        <div class="flex flex-col sm:flex-row justify-between gap-4">
                            <p class="font-medium">Original_Bill: <span class="text-white">RM ${formatCurrency(detailSource.billBefore)}</span></p>
                            <p class="font-medium">Monthly_Usage: <span class="text-white">${detailSource.monthlyUsageKwh} kWh</span></p>
                        </div>
                    </div>
                    <div class="h-px bg-white/20 w-full"></div>
                    <div class="space-y-4">
                        <p class="opacity-70 uppercase text-xs tracking-widest">System_Specifications</p>
                        <div class="flex flex-col sm:flex-row justify-between gap-4">
                            <p class="font-medium">Panel_Quantity: <span class="text-white">${data.actualPanels} Units</span></p>
                            <p class="font-medium">System_Size: <span class="text-white">${((data.actualPanels * data.config.panelType) / 1000).toFixed(2)} kWp</span></p>
                        </div>
                    </div>
                    <div class="h-px bg-white/20 w-full"></div>
                    <div class="space-y-6">
                        <p class="opacity-70 uppercase text-xs tracking-widest">Projected_Outcome</p>
                        <div class="flex justify-between items-baseline border-b border-white/10 pb-2">
                            <span>New_Monthly_Bill:</span>
                            <span class="font-bold">RM ${baselineStats.billAfter}</span>
                        </div>
                        <div class="flex justify-between items-baseline text-emerald-400 border-b border-white/10 pb-2">
                            <span>Bill_Reduction:</span>
                            <span class="font-bold">RM ${baselineStats.billReduction}</span>
                        </div>
                        <div class="flex justify-between items-baseline text-emerald-400">
                            <span>Export_Credit (${data.actualPanels}_Panels):</span>
                            <span class="font-bold">RM ${baselineStats.exportCredit}</span>
                        </div>
                        <p class="text-xs text-white/40 uppercase tracking-tighter text-right">@ NEM_Rate: RM ${data.config.smpPrice}/kWh</p>
                    </div>
                    <div class="pt-10 border-t-2 border-white/40">
                        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-baseline gap-4">
                            <span class="text-xs font-bold uppercase tracking-[0.2em] text-white/70">Total_Monthly_Savings:</span>
                            <span class="text-5xl md:text-6xl font-bold tracking-tighter text-emerald-400">RM ${baselineStats.totalSavings}</span>
                        </div>
                    </div>
                </div>
            </section>

            <div class="h-1 md:h-2 bg-black/10 -mx-4 md:-mx-6"></div>

            <!-- 05 ROI SUMMARY -->
            <section class="pt-4">
                <h2 class="text-sm font-bold uppercase tracking-[0.2em] mb-10 md:mb-14 tier-2 border-b-2 border-fact inline-block pb-1">05_ROI_MATRIX_SUMMARY</h2>
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-10 md:gap-16 py-12 md:py-16 border-y-2 border-fact">
                    <div class="space-y-4">
                        <span class="text-xs md:text-sm uppercase tracking-[0.2em] tier-3 font-semibold">Monthly_Savings_Est</span>
                        <div class="text-4xl md:text-5xl font-bold tracking-tighter">RM ${baselineStats.totalSavings}</div>
                    </div>
                    <div class="h-px md:h-16 w-full md:w-px bg-divider"></div>
                    <div class="space-y-4">
                        <span class="text-xs md:text-sm uppercase tracking-[0.2em] tier-3 font-semibold">ROI_Percentage</span>
                        <div class="text-4xl md:text-5xl font-bold tracking-tighter text-emerald-600">${roiDisplay}</div>
                    </div>
                    <div class="h-px md:h-16 w-full md:w-px bg-divider"></div>
                    <div class="space-y-4">
                        <span class="text-xs md:text-sm uppercase tracking-[0.2em] tier-3 font-semibold">Payback_Period</span>
                        <div class="text-4xl md:text-5xl font-bold tracking-tighter">${paybackDisplay}</div>
                    </div>
                </div>
            </section>

            <div class="h-1 md:h-2 bg-black/10 -mx-4 md:-mx-6"></div>

            <!-- 06 SYSTEM CONFIG -->
            <section class="pt-4">
                <h2 class="text-sm font-bold uppercase tracking-[0.2em] mb-10 md:mb-14 tier-2 border-b-2 border-fact inline-block pb-1">06_SYSTEM_CONFIGURATION</h2>
                <div class="grid gap-12 md:grid-cols-2">
                    <div class="space-y-6 md:space-y-8">
                        <div class="flex justify-between items-center py-3 border-b border-divider">
                            <span class="text-xs md:text-sm uppercase tracking-widest tier-3 font-semibold">System_Size</span>
                            <span class="text-sm md:text-base font-bold">${data.solarConfig}</span>
                        </div>
                        <div class="flex justify-between items-center py-3 border-b border-divider">
                            <span class="text-xs md:text-sm uppercase tracking-widest tier-3 font-semibold">Panel_Qty</span>
                            <span class="text-sm md:text-base font-bold">${data.actualPanels} UNIT</span>
                        </div>
                        <div class="flex justify-between items-center py-3 border-b border-divider">
                            <span class="text-xs md:text-sm uppercase tracking-widest tier-3 font-semibold">Monthly_Yield</span>
                            <span class="text-sm md:text-base font-bold">${detailSource.totalGeneration} kWh</span>
                        </div>
                    </div>
                    <div class="space-y-6 md:space-y-8">
                        <div class="flex justify-between items-center py-3 border-b border-divider">
                            <span class="text-xs md:text-sm uppercase tracking-widest tier-3 font-semibold">Base_System_Cost</span>
                            <span class="text-sm md:text-base font-bold">RM ${formatCurrency(data.systemCostBeforeDiscount)}</span>
                        </div>
                        <div class="flex justify-between items-center py-3 border-b border-divider">
                            <span class="text-xs md:text-sm uppercase tracking-widest tier-3 font-semibold">Applied_Discounts</span>
                            <span class="text-sm md:text-base font-bold text-emerald-600">-RM ${formatCurrency(data.totalDiscountAmount)}</span>
                        </div>
                        <div class="flex justify-between items-center py-4 border-b-2 border-fact bg-black/5 px-4 -mx-4">
                            <span class="text-xs md:text-sm uppercase tracking-widest tier-3 font-bold">Net_Investment</span>
                            <span class="text-base md:text-lg font-bold">RM ${formatCurrency(data.finalSystemCost)}</span>
                        </div>
                    </div>
                </div>
            </section>

            <div class="h-1 md:h-2 bg-black/10 -mx-4 md:-mx-6"></div>

            <!-- 07 LEDGER COMPARISON -->
            <section class="pt-4">
                <h2 class="text-sm font-bold uppercase tracking-[0.2em] mb-10 md:mb-14 tier-2 border-b-2 border-fact inline-block pb-1">07_SAVINGS_LEDGER</h2>
                <div class="space-y-6">
                    <div class="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                        <div class="min-w-[400px] space-y-4">
                            <div class="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-2 md:gap-4 tier-3 uppercase text-xs md:text-xs tracking-widest pb-4 border-b border-divider">
                                <span>Component</span>
                                <span class="text-right">Baseline</span>
                                <span class="text-right">Post_Solar</span>
                                <span class="text-right">Delta</span>
                            </div>
                            ${buildLedgerRows(baselineStats.billBreakdown)}
                        </div>
                    </div>
                    <div class="ledger-double-line pt-8 mt-6 flex justify-between items-baseline gap-4">
                        <span class="text-xs md:text-sm font-bold uppercase tracking-[0.2em] tier-2">Monthly_Bill</span>
                        <div class="flex flex-col items-end sm:flex-row sm:items-baseline gap-2 md:gap-6">
                            <span class="text-2xl md:text-3xl font-bold">RM ${baselineStats.billAfter}</span>
                            <span class="text-xs md:text-base tier-3">(${baselineStats.billReduction} Reduced)</span>
                        </div>
                    </div>
                    <div class="flex justify-between items-baseline py-4 gap-4 border-b border-divider/50">
                        <span class="text-xs md:text-sm font-bold uppercase tracking-[0.2em] tier-2">NEM_Export_Earnings</span>
                        <span class="text-2xl md:text-3xl font-bold text-emerald-600">+RM ${baselineStats.exportCredit}</span>
                    </div>
                    <div class="ledger-double-line pt-10 mt-10 flex justify-between items-baseline bg-black text-white p-8 md:p-12 -mx-4 md:-mx-6 shadow-xl">
                        <span class="text-xs md:text-sm font-bold uppercase tracking-[0.3em]">Net_Monthly_Savings</span>
                        <span class="text-4xl md:text-5xl font-bold tracking-tighter">RM ${baselineStats.totalSavings}</span>
                    </div>
                </div>
            </section>

            <div class="h-1 md:h-2 bg-black/10 -mx-4 md:-mx-6"></div>

            <!-- 08 FOOTNOTES -->
            <section class="pt-4 opacity-70">
                <h2 class="text-xs md:text-sm font-bold uppercase tracking-[0.2em] mb-6 tier-3">08_AFA_METHODOLOGY</h2>
                <div class="space-y-4 text-xs md:text-sm leading-relaxed tier-3 max-w-2xl">
                    <p>[*] AFA_IMPACT: Solar reduces grid consumption, lowering fuel adjustment charges by RM ${baselineStats.afaImpact}. 
                    ${Number(baselineStats.afaImpact.replace(/,/g,'')) >= 0 
                        ? 'In surcharge periods, this scales as a direct saving.' 
                        : 'In rebate periods, this reflects a reduction in the total rebate received due to lower volume.'}
                    </p>
                    <p>[*] ROI_CALC: Based on 12-month projected savings vs Net_Investment. NEM export rate locked at RM ${data.config.smpPrice}/kWh.</p>
                </div>
            </section>

            <!-- BATTERY INTEGRATION -->
            ${data.config.batterySize > 0 ? `
            <section class="pt-16 md:pt-24 border-t-2 border-divider">
                <h2 class="text-sm font-bold uppercase tracking-[0.2em] mb-10 md:mb-14 tier-2 border-b-2 border-fact inline-block pb-1">08_BATTERY_STORAGE_INTEGRATION</h2>
                <div class="grid gap-12 md:grid-cols-3">
                    <div class="space-y-4">
                        <span class="text-xs md:text-sm uppercase tracking-widest tier-3 font-semibold">Storage_Capacity</span>
                        <div class="flex items-center gap-6">
                            <button onclick="adjustBatterySize(-5)" class="text-xl border-2 border-divider w-10 h-10 md:w-12 md:h-12 hover:bg-black hover:text-white transition-colors">-</button>
                            <span class="text-xl md:text-2xl font-bold">${data.config.batterySize} kWh</span>
                            <button onclick="adjustBatterySize(5)" class="text-xl border-2 border-divider w-10 h-10 md:w-12 md:h-12 hover:bg-black hover:text-white transition-colors">+</button>
                        </div>
                    </div>
                    <div class="space-y-4">
                        <span class="text-xs md:text-sm uppercase tracking-widest tier-3 font-semibold">Battery_Value_Add</span>
                        <div class="text-xl md:text-2xl font-bold text-emerald-600">+RM ${(Number(data.monthlySavings.replace(/,/g,'')) - Number(baselineStats.totalSavings.replace(/,/g,''))).toLocaleString('en-MY', {minimumFractionDigits: 2})} / mo</div>
                    </div>
                    <div class="space-y-4">
                        <span class="text-xs md:text-sm uppercase tracking-widest tier-3 font-semibold">Total_Monthly_Savings</span>
                        <div class="text-xl md:text-2xl font-bold tracking-tighter">RM ${data.monthlySavings}</div>
                    </div>
                </div>
            </section>
            ` : `
            <section class="pt-12 md:pt-16 text-center tier-3 text-xs md:text-sm uppercase tracking-widest border-t border-divider">
                <button onclick="adjustBatterySize(5)" class="hover:tier-1 underline font-bold">[+]_SIMULATE_BATTERY_STORAGE</button>
            </section>
            `}
        </div>
    `;

    renderFloatingPanelModulation(data);
    
    if (isInitialRender) {
        solarDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    // Create charts
    if (data.charts) createCharts(data.charts);
}

// Global functions for buttons
window.adjustBatterySize = function(delta) {
    if (!latestSolarParams) return;
    const currentSize = latestSolarParams.batterySize || 0;
    const newSize = Math.max(0, currentSize + delta);
    if (newSize === currentSize) return;

    latestSolarParams.batterySize = newSize;
    window.triggerSpontaneousUpdate();
};

window.adjustPanelCount = function(delta) {
    if (!latestSolarData) return;
    const proposedCount = latestSolarData.actualPanels + delta;
    if (proposedCount < 1) return;
    requestPanelUpdate(proposedCount);
};

window.commitPanelInputChange = function(event) {
    if (!latestSolarData) return;
    let value = parseInt(event.target.value, 10);
    if (Number.isNaN(value) || value < 1) {
        value = latestSolarData.actualPanels;
        event.target.value = value;
        return;
    }
    if (value === latestSolarData.actualPanels) return;
    requestPanelUpdate(value);
};


// Utils
function formatCurrency(value) {
    const numericValue = Number(value);
    if (Number.isNaN(numericValue)) return '0.00';
    return numericValue.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercentage(value, decimals = 1) {
    const numericValue = Number(value);
    if (Number.isNaN(numericValue)) return Number(0).toFixed(decimals);
    return numericValue.toFixed(decimals);
}

function showNotification(message, type = 'info') {
    const colors = {
        success: 'border-emerald-600 text-emerald-700 bg-emerald-50',
        error: 'border-rose-600 text-rose-700 bg-rose-50',
        info: 'border-fact text-fact bg-paper'
    };
    const notification = document.createElement('div');
    notification.className = `fixed bottom-8 right-8 max-w-sm border p-4 z-[10001] text-xs uppercase tracking-widest font-bold shadow-lg ${colors[type]}`;
    notification.innerHTML = `<div class="flex items-center justify-between gap-8"><span>[ ${message} ]</span><button onclick="this.parentElement.parentElement.remove()" class="hover:opacity-50">X</button></div>`;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}

function showPanelRecommendationPopup(data) {
    const popup = document.createElement('div');
    popup.className = 'fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm';
    const existingBar = document.getElementById('floatingPanelBar');
    if (existingBar) existingBar.style.display = 'none';

    const packageInfo = data.selectedPackage ?
        `<div class="mt-8 p-6 border border-fact bg-black text-white">
            <div class="text-xs uppercase tracking-widest opacity-70 mb-4">SELECTED_PACKAGE</div>
            <div class="text-lg font-bold tracking-tighter mb-2">${data.selectedPackage.packageName}</div>
            <div class="text-xs uppercase tracking-widest opacity-70 space-y-1">
                <div>Price: RM ${parseFloat(data.selectedPackage.price).toLocaleString('en-MY', {minimumFractionDigits: 2})}</div>
                <div>Config: ${data.actualPanels} UNIT x ${data.config.panelType}W</div>
            </div>
        </div>` :
        `<div class="mt-8 p-6 border border-divider tier-3 text-xs uppercase tracking-widest text-center">[ NO_MATCHING_PACKAGE_FOUND ]</div>`;

    popup.innerHTML = `
        <div class="w-full max-w-lg border border-fact bg-paper p-10 shadow-2xl space-y-10">
            <div class="text-center space-y-2">
                <div class="text-xs font-bold uppercase tracking-[0.4em]">SYSTEM_RECOMMENDATION</div>
                <div class="h-px bg-divider w-12 mx-auto"></div>
            </div>
            <div class="text-center">
                <div class="text-6xl font-bold tracking-tighter mb-2">${data.recommendedPanels}</div>
                <div class="text-xs uppercase tracking-[0.3em] tier-3">Recommended_Panel_Units</div>
            </div>
            <div class="text-[11px] leading-relaxed tier-3 uppercase tracking-widest text-center border-y border-divider py-6">
                Basis: ${data.details.monthlyUsageKwh}kWh / ${data.config.sunPeakHour}h / 30 / 0.62 Efficiency
            </div>
            ${packageInfo}
            <div class="grid grid-cols-2 gap-4">
                <button id="popupCloseBtn" class="border border-divider py-4 text-xs font-bold uppercase tracking-widest hover:bg-divider transition-colors">Close</button>
                <button id="popupViewDetailsBtn" class="bg-black text-white py-4 text-xs font-bold uppercase tracking-widest hover:opacity-80 transition-colors">View_Full_Report</button>
            </div>
        </div>
    `;

    const revealFloatingPanel = () => {
        popup.remove();
        const bar = document.getElementById('floatingPanelBar');
        if (bar) bar.style.display = '';
        showNotification('ROI Matrix Generated', 'success');
        const reportStart = document.getElementById('solarResultsCard');
        if (reportStart) reportStart.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    popup.querySelector('#popupViewDetailsBtn').onclick = revealFloatingPanel;
    popup.querySelector('#popupCloseBtn').onclick = revealFloatingPanel;
    document.body.appendChild(popup);
}

function renderFloatingPanelModulation(data) {
    let bar = document.getElementById('floatingPanelBar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'floatingPanelBar';
        bar.className = 'fixed bottom-0 left-0 right-0 z-[10000] px-4 py-8 md:px-8 md:py-10 pointer-events-none';
        document.body.appendChild(bar);
    }
    let priceDiffHtml = '';
    if (originalSolarData && originalSolarData.selectedPackage && data.selectedPackage) {
        const diff = Number(data.selectedPackage.price) - Number(originalSolarData.selectedPackage.price);
        if (Math.abs(diff) > 0.01) {
            const colorClass = diff > 0 ? 'text-rose-600' : 'text-emerald-600';
            priceDiffHtml = `<div class="text-xs md:text-sm font-bold uppercase tracking-widest ${colorClass}">INVESTMENT_DELTA: ${diff > 0 ? '+' : '-'}RM ${Math.abs(diff).toFixed(0)}</div>`;
        }
    }
    bar.innerHTML = `
        <div class="mx-auto max-w-4xl border-2 border-fact bg-paper p-6 md:p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col sm:flex-row items-center justify-between gap-6 md:gap-8 pointer-events-auto transition-transform hover:translate-x-[-2px] hover:translate-y-[-2px]">
            <div class="space-y-2 text-center sm:text-left">
                <div class="text-xs md:text-sm font-bold uppercase tracking-[0.3em] border-b border-fact pb-1">PANEL_MODULATION</div>
                <div class="text-xs md:text-sm tier-3 uppercase tracking-widest font-bold">Recommended: ${data.recommendedPanels} Units</div>
                ${priceDiffHtml}
            </div>
            <div class="flex items-center gap-6 md:gap-10">
                <div class="flex items-center border-2 border-fact bg-white">
                    <button onclick="adjustPanelCount(-1)" class="w-10 h-10 md:w-12 md:h-12 hover:bg-black hover:text-white transition-colors text-xl font-bold">-</button>
                    <input type="number" id="panelQtyInputFloating" value="${data.actualPanels}" onchange="commitPanelInputChange(event)" class="w-16 md:w-20 text-center text-lg md:text-xl font-bold border-none py-0 bg-transparent">
                    <button onclick="adjustPanelCount(1)" class="w-10 h-10 md:w-12 md:h-12 hover:bg-black hover:text-white transition-colors text-xl font-bold">+</button>
                </div>
            </div>
        </div>
    `;
}

// Chart Logic (Ported exactly)
function createCharts(chartData) {
    if (!chartData) return;
    const importCanvas = document.getElementById('electricityImportChart');
    const solarCanvas = document.getElementById('solarGenerationChart');
    const combinedCanvas = document.getElementById('combinedChart');
    if (!importCanvas || !solarCanvas || !combinedCanvas) return;

    if (chartInstances.electricity) chartInstances.electricity.destroy();
    if (chartInstances.solar) chartInstances.solar.destroy();
    if (chartInstances.combined) chartInstances.combined.destroy();

    chartInstances.electricity = new Chart(importCanvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: chartData.electricityUsagePattern.map(d => d.hour + ':00'),
            datasets: [{
                label: 'Electricity Import (kWh)',
                data: chartData.electricityUsagePattern.map(d => parseFloat(d.usage)),
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#f59e0b',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 4
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } }, plugins: { legend: { display: false } } }
    });

    chartInstances.solar = new Chart(solarCanvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: chartData.solarGenerationPattern.map(d => d.hour + ':00'),
            datasets: [{
                label: 'Solar Generation (kWh)',
                data: chartData.solarGenerationPattern.map(d => parseFloat(d.generation)),
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#10b981',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 4
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } }, plugins: { legend: { display: false } } }
    });

    const netImportData = chartData.electricityUsagePattern.map((usage, index) => {
        const usageKwh = parseFloat(usage.usage);
        const solarKwh = parseFloat(chartData.solarGenerationPattern[index].generation);
        return Math.max(0, usageKwh - solarKwh).toFixed(3);
    });

    chartInstances.combined = new Chart(combinedCanvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: chartData.electricityUsagePattern.map(d => d.hour + ':00'),
            datasets: [
                {
                    label: 'Original Import',
                    data: chartData.electricityUsagePattern.map(d => parseFloat(d.usage)),
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    fill: false,
                    tension: 0.4,
                    pointRadius: 3,
                    borderWidth: 2
                },
                {
                    label: 'Solar Generation',
                    data: chartData.solarGenerationPattern.map(d => parseFloat(d.generation)),
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: false,
                    tension: 0.4,
                    pointRadius: 3,
                    borderWidth: 2
                },
                {
                    label: 'Net Import',
                    data: netImportData,
                    borderColor: '#dc2626',
                    backgroundColor: 'rgba(220, 38, 38, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#dc2626',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    borderWidth: 3
                }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } }, plugins: { legend: { position: 'top' } } }
    });
}

// Misc
async function testConnection() {
    const statusDiv = document.getElementById('dbStatus');
    try {
        const response = await fetch('/api/health');
        statusDiv.innerHTML = response.ok ? `<span>[ STATUS: ONLINE ]</span><div class="h-px grow bg-divider"></div>` : `<span>[ STATUS: OFFLINE ]</span><div class="h-px grow bg-divider"></div>`;
    } catch (error) {
        statusDiv.innerHTML = `<span>[ STATUS: ERROR ]</span><div class="h-px grow bg-divider"></div>`;
    }
}
window.testConnection = testConnection;

// Export helpers for debug
window.getSchema = async function() {
    const res = document.getElementById('results');
    res.innerHTML = 'Loading...';
    try {
        const response = await fetch('/api/schema');
        const data = await response.json();
        res.innerHTML = JSON.stringify(data, null, 2);
    } catch (e) { res.innerHTML = e.message; }
};
window.getTnbTariff = async function() {
    const res = document.getElementById('results');
    res.innerHTML = 'Loading...';
    try {
        const response = await fetch('/api/tnb-tariff');
        const data = await response.json();
        res.innerHTML = JSON.stringify(data, null, 2);
    } catch (e) { res.innerHTML = e.message; }
};
window.getPackageInfo = async function() {
    const res = document.getElementById('results');
    res.innerHTML = 'Loading...';
    try {
        const response = await fetch('/api/package-info');
        const data = await response.json();
        res.innerHTML = JSON.stringify(data, null, 2);
    } catch (e) { res.innerHTML = e.message; }
};