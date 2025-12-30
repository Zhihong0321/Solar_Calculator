// State Management
let latestSolarParams = null;
let latestSolarData = null;
let originalSolarData = null; // Baseline for price comparison (the very first recommendation)
let currentHistoricalAfaRate = 0;

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
    initializeData().then(() => {
        if (document.getElementById('reverseCalcForm')) {
            initReversePage();
        }
    });
};

async function initializeData() {
    try {
        const response = await fetch('/api/all-data');
        const data = await response.json();
        if (response.ok) {
            db.tariffs = data.tariffs.map(t => ({
                ...t,
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

function initReversePage() {
    document.getElementById('reverseCalcForm').addEventListener('submit', function(e) {
        e.preventDefault();
        runReverseSimulation();
    });
}

function updateScenarioUI(id, status, value, desc, sunPeak = null, morningUsage = null) {
    const statusEl = document.getElementById(id + '_status');
    const valEl = document.getElementById(id + '_value');
    const descEl = document.getElementById(id + '_desc');
    
    if (statusEl) {
        statusEl.innerText = status;
        statusEl.className = `px-3 py-1 text-xs font-bold uppercase tracking-widest ${
            status === 'REALISTIC' ? 'bg-emerald-100 text-emerald-800' : 
            (status === 'IMPOSSIBLE' || status === 'RIDICULOUS' ? 'bg-rose-100 text-rose-800' : 'bg-orange-100 text-orange-800')
        }`;
    }
    
    // Calculate and append Confidence Level if sunPeak is provided
    let valueHtml = value;
    if (sunPeak !== null && sunPeak > 3.4) {
        let confidence = 90;
        const diff = sunPeak - 3.4;
        const penalty = (diff / 0.1) * 7;
        confidence = Math.max(0, 90 - penalty).toFixed(1);
        valueHtml += ` <span class="text-xs font-bold ${confidence < 50 ? 'text-rose-600' : 'text-orange-500'}">[Confidence: ${confidence}%]</span>`;
    }
    
    if (valEl) valEl.innerHTML = valueHtml;
    
    // Add Warning Note for high morning usage
    let finalDesc = desc || '';
    if (morningUsage !== null && morningUsage > 50) {
        finalDesc += `<br><span class="text-[10px] text-rose-600 font-bold mt-2 block leading-tight">NOTE: In a typical residential scenario, daytime usage is usually low as occupants are often away from home. Please be cautious of high morning offset estimations.</span>`;
    }
    
    if (descEl) descEl.innerHTML = finalDesc;
}

function runReverseSimulation() {
    const systemSizeKwp = parseFloat(document.getElementById('systemSize').value);
    const billAmount = parseFloat(document.getElementById('billAmount').value);
    const promisedSaving = parseFloat(document.getElementById('promisedSaving').value);

    if (!systemSizeKwp || !billAmount || !promisedSaving) {
        return showNotification('Please fill all fields', 'error');
    }

    const calculator = new SolarCalculator(db.tariffs, db.packages);
    const resultsDiv = document.getElementById('reverseResults');
    resultsDiv.classList.remove('hidden');
    // Fade in animation
    setTimeout(() => resultsDiv.classList.remove('opacity-0'), 50);

    // Common params
    const baseParams = {
        amount: billAmount,
        smpPrice: 0.2703,
        afaRate: 0,
        historicalAfaRate: 0,
        percentDiscount: 0,
        fixedDiscount: 0,
        batterySize: 0,
        overridePanels: 1, 
        panelType: systemSizeKwp * 1000
    };

    const getSavings = (p) => {
        try {
            const res = calculator.calculate(p);
            return parseFloat(res.monthlySavings);
        } catch (e) { return 0; }
    };

    const solve = (paramName, min, max, fixedParams) => {
        let low = min, high = max;
        let bestVal = low;
        let bestDiff = Infinity;

        for (let i = 0; i < 20; i++) {
            const mid = (low + high) / 2;
            const p = { ...baseParams, ...fixedParams, [paramName]: mid };
            const savings = getSavings(p);
            
            if (Math.abs(savings - promisedSaving) < bestDiff) {
                bestDiff = Math.abs(savings - promisedSaving);
                bestVal = mid;
            }

            if (savings < promisedSaving) {
                low = mid; 
            } else {
                high = mid;
            }
        }
        return { val: bestVal, achieved: getSavings({ ...baseParams, ...fixedParams, [paramName]: bestVal }) };
    };

    // Scenario 1: Fixed Morning 30%, Find Sun Peak
    updateScenarioUI('s1', 'Testing...', '--');
    setTimeout(() => {
        const s1 = solve('sunPeakHour', 0, 12, { morningUsage: 30 });
        updateScenarioUI('s1', 
            s1.val > 8 ? 'RIDICULOUS' : (s1.val > 4.5 ? 'OPTIMISTIC' : 'REALISTIC'),
            s1.val.toFixed(2) + ' h',
            `Achieves RM ${s1.achieved.toFixed(2)}`,
            s1.val,
            30
        );
    }, 100);

    // Scenario 2: Fixed Sun Peak 3.4, Find Morning Usage
    updateScenarioUI('s2', 'Testing...', '--');
    setTimeout(() => {
        const s2 = solve('morningUsage', 0, 100, { sunPeakHour: 3.4 });
        const isMaxed = s2.val > 99 && s2.achieved < promisedSaving - 5;
        
        updateScenarioUI('s2',
            isMaxed ? 'IMPOSSIBLE' : (s2.val > 70 ? 'UNREALISTIC' : 'REALISTIC'),
            isMaxed ? '> 100%' : s2.val.toFixed(1) + '%',
            isMaxed ? `Max possible: RM ${s2.achieved.toFixed(2)}` : `Achieves RM ${s2.achieved.toFixed(2)}`,
            3.4,
            s2.val
        );
    }, 300);

    // Scenario 3: Max Morning 70%, Find Sun Peak
    updateScenarioUI('s3', 'Testing...', '--');
    setTimeout(() => {
        const s3 = solve('sunPeakHour', 0, 12, { morningUsage: 70 });
        updateScenarioUI('s3',
            s3.val > 8 ? 'RIDICULOUS' : (s3.val > 4.5 ? 'OPTIMISTIC' : 'REALISTIC'),
            s3.val.toFixed(2) + ' h',
            `Achieves RM ${s3.achieved.toFixed(2)}`,
            s3.val,
            70
        );
        
        const isRidiculous = s1.val > 5.0 || (s2.val > 99 && s2.achieved < promisedSaving);
        const isOptimistic = !isRidiculous && (s1.val > 4.0 || s2.val > 60);
        
        const verdictTitle = document.getElementById('verdictTitle');
        const verdictDesc = document.getElementById('verdictDesc');
        const verdictBanner = document.getElementById('verdictBanner');
        
        if (isRidiculous) {
            verdictTitle.innerText = "UNREALISTIC";
            verdictDesc.innerText = "The promised savings are likely inflated. Required sun hours or self-consumption rates exceed typical Malaysian standards.";
            verdictBanner.className = "bg-rose-900 text-white p-8 md:p-12 shadow-2xl relative overflow-hidden";
        } else if (isOptimistic) {
            verdictTitle.innerText = "OPTIMISTIC";
            verdictDesc.innerText = "The offer is theoretically possible but relies on ideal conditions (high self-consumption or perfect roof orientation).";
            verdictBanner.className = "bg-orange-600 text-white p-8 md:p-12 shadow-2xl relative overflow-hidden";
        } else {
            verdictTitle.innerText = "REALISTIC";
            verdictDesc.innerText = "The promised savings align with standard modeling parameters and TNB tariffs.";
            verdictBanner.className = "bg-emerald-800 text-white p-8 md:p-12 shadow-2xl relative overflow-hidden";
        }
    }, 600);
}

// --- Logic Engine (The Authoritative Source) ---

class SolarCalculator {
    constructor(tariffs, packages) {
        this.tariffs = tariffs;
        this.packages = packages;
    }

    findClosestTariff(targetAmount, afaRate) {
        const candidates = this.tariffs.map(t => ({
            ...t,
            adjusted_total: t.bill_total_normal + (t.usage_kwh * afaRate)
        }));
        candidates.sort((a, b) => b.adjusted_total - a.adjusted_total);
        const match = candidates.find(t => t.adjusted_total <= targetAmount);
        if (match) return match;
        candidates.sort((a, b) => a.adjusted_total - b.adjusted_total);
        return candidates.length > 0 ? candidates[0] : null;
    }

    lookupTariffByUsage(usageValue) {
        const val = Math.max(0, Math.floor(usageValue));
        const sorted = [...this.tariffs].sort((a, b) => b.usage_kwh - a.usage_kwh);
        const match = sorted.find(t => t.usage_kwh <= val);
        return match || [...this.tariffs].sort((a, b) => a.usage_kwh - b.usage_kwh)[0];
    }

    calculate(params) {
        const {
            amount, sunPeakHour, morningUsage, panelType, 
            smpPrice, afaRate, historicalAfaRate, 
            percentDiscount, fixedDiscount, batterySize, overridePanels
        } = params;

        // 1. Initial Tariff
        const tariff = this.findClosestTariff(amount, historicalAfaRate);
        if (!tariff) throw new Error('No tariff data found');
        const monthlyUsageKwh = tariff.usage_kwh;

        // 2. Recommendation (Using Server's Math.floor rule)
        const recommendedPanels = Math.max(1, Math.floor(monthlyUsageKwh / sunPeakHour / 30 / 0.62));
        const actualPanelQty = overridePanels !== null ? overridePanels : recommendedPanels;

        // 3. Package Lookup
        let selectedPackage = this.packages
            .filter(p => 
                p.panel_qty === actualPanelQty && 
                p.active === true && 
                (p.special === false || p.special === null) &&
                p.type === 'Residential' &&
                p.solar_output_rating === panelType
            )
            .sort((a, b) => a.price - b.price)[0] || null;

        // 4. Solar Gen
        const dailySolarGeneration = (actualPanelQty * panelType * sunPeakHour) / 1000;
        const monthlySolarGeneration = dailySolarGeneration * 30;

        // 5. Consumption Split
        const morningUsageKwh = (monthlyUsageKwh * morningUsage) / 100;
        const morningSelfConsumption = Math.min(monthlySolarGeneration, morningUsageKwh);

        // 6. Battery Math (Hard Caps)
        const dailyExcessSolar = Math.max(0, monthlySolarGeneration - morningUsageKwh) / 30;
        const dailyNightUsage = Math.max(0, monthlyUsageKwh - morningUsageKwh) / 30;
        const dailyMaxDischarge = Math.min(dailyExcessSolar, dailyNightUsage, batterySize);
        const monthlyMaxDischarge = dailyMaxDischarge * 30;

        // 7. Energy Flows
        // Baseline
        const netUsageBaseline = Math.max(0, monthlyUsageKwh - morningSelfConsumption);
        const exportKwhBaseline = Math.max(0, monthlySolarGeneration - morningUsageKwh);
        // With Battery
        const netUsageKwh = Math.max(0, monthlyUsageKwh - morningSelfConsumption - monthlyMaxDischarge);
        const exportKwh = Math.max(0, monthlySolarGeneration - morningUsageKwh - monthlyMaxDischarge);

        // 8. Financials
        const baselineTariff = this.lookupTariffByUsage(netUsageBaseline);
        const afterTariff = this.lookupTariffByUsage(netUsageKwh);

        const buildBreakdown = (t) => {
            const afa = t.usage_kwh * afaRate;
            return {
                usage: t.usage_normal, network: t.network, capacity: t.capacity,
                sst: t.sst_normal, eei: t.eei, afa, total: t.bill_total_normal + afa
            };
        };

        const beforeBreakdown = buildBreakdown(tariff);
        const afterBreakdown = buildBreakdown(afterTariff);
        const baselineBreakdown = buildBreakdown(baselineTariff);

        // Confidence Level Calculation
        // Base 90%, -7% for every 0.1h above 3.4h
        let confidenceLevel = 90;
        if (sunPeakHour > 3.4) {
            const diff = sunPeakHour - 3.4;
            // (diff / 0.1) * 7
            const penalty = (diff / 0.1) * 7;
            confidenceLevel = Math.max(0, 90 - penalty);
        }

        // Final Savings Logic
        const billReduction = beforeBreakdown.total - afterBreakdown.total;
        const exportSaving = exportKwh * smpPrice;
        const totalMonthlySavings = billReduction + exportSaving;

        const billReductionBaseline = beforeBreakdown.total - baselineBreakdown.total;
        const exportSavingBaseline = exportKwhBaseline * smpPrice;
        const totalMonthlySavingsBaseline = billReductionBaseline + exportSavingBaseline;

        // 9. System Costs
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

        // 10. Chart Data
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
            if (hour >= 7 && hour <= 19) m = Math.max(0, Math.cos((Math.abs(hour - 12) / 5) * (Math.PI / 2)));
            solarGenPattern.push({ hour, generation: (dailySolarGeneration * m / 8).toFixed(3) });
        }

        return {
            config: params,
            recommendedPanels, actualPanels: actualPanelQty,
            panelAdjustment: actualPanelQty - recommendedPanels,
            overrideApplied: overridePanels !== null,
            selectedPackage: selectedPackage ? { packageName: selectedPackage.package_name, price: selectedPackage.price, panelWattage: panelType, bubbleId: selectedPackage.bubble_id } : null,
            solarConfig: `${actualPanelQty} x ${panelType}W panels (${(actualPanelQty * panelType / 1000).toFixed(1)} kW system)`,
            monthlySavings: totalMonthlySavings.toFixed(2),
            confidenceLevel: confidenceLevel.toFixed(1),
            systemCostBeforeDiscount, totalDiscountAmount, finalSystemCost: finalSystemCost !== null ? finalSystemCost.toFixed(2) : null,
            paybackPeriod,
            details: {
                monthlyUsageKwh, monthlySolarGeneration: monthlySolarGeneration.toFixed(2),
                billBefore: beforeBreakdown.total.toFixed(2), billAfter: afterBreakdown.total.toFixed(2),
                billReduction: billReduction.toFixed(2), exportSaving: exportSaving.toFixed(2),
                totalGeneration: monthlySolarGeneration.toFixed(2),
                savingsBreakdown: {
                    afaImpact: (monthlyUsageKwh - netUsageBaseline) * afaRate,
                    baseBillReduction: billReductionBaseline - ((monthlyUsageKwh - netUsageBaseline) * afaRate),
                },
                battery: {
                    baseline: {
                        billReduction: billReductionBaseline, exportCredit: exportSavingBaseline,
                        totalSavings: totalMonthlySavingsBaseline.toFixed(2), billAfter: baselineBreakdown.total,
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
            charts: { electricityUsagePattern, solarGenerationPattern: solarGenPattern }
        };
    }
}

// --- Interaction Handlers ---

document.getElementById('billForm').addEventListener('submit', function(e) {
    e.preventDefault();
    if (!db.tariffs.length) return showNotification('System initializing...', 'info');
    const billAmount = parseFloat(document.getElementById('billAmount').value);
    const afaRate = parseFloat(document.getElementById('historicalAfaRate').value) || 0;
    if (!billAmount || billAmount <= 0) return showNotification('Invalid bill amount', 'error');

    const calculator = new SolarCalculator(db.tariffs, db.packages);
    const tariff = calculator.findClosestTariff(billAmount, afaRate);
    if (tariff) {
        displayBillBreakdown({ tariff, afaRate });
        currentHistoricalAfaRate = afaRate;
        if (document.getElementById('afaRate')) document.getElementById('afaRate').value = afaRate.toFixed(4);
    }
});

window.calculateSolarSavings = function() {
    if (!db.tariffs.length) return;
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
    runAndDisplay();
    // Scroll to results
    const solarDiv = document.getElementById('solarResultsCard');
    if (solarDiv) solarDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });

    originalSolarData = JSON.parse(JSON.stringify(latestSolarData)); // Capture baseline for Investment Delta
};

window.triggerSpontaneousUpdate = function() {
    if (!latestSolarParams) return;
    // Update inputs from UI
    latestSolarParams.sunPeakHour = parseFloat(document.getElementById('sunPeakHour').value) || 3.4;
    latestSolarParams.morningUsage = parseFloat(document.getElementById('morningUsage').value) || 30;
    latestSolarParams.panelType = parseInt(document.getElementById('panelRating').value) || 620;
    latestSolarParams.afaRate = parseFloat(document.getElementById('afaRate').value) || 0;
    latestSolarParams.smpPrice = parseFloat(document.getElementById('smpPrice').value) || 0.2703;
    latestSolarParams.percentDiscount = parseFloat(document.getElementById('percentDiscount')?.value) || 0;
    latestSolarParams.fixedDiscount = parseFloat(document.getElementById('fixedDiscount')?.value) || 0;
    
    // NOTE: latestSolarParams.overridePanels is preserved here (set by requestPanelUpdate)
    runAndDisplay();
};

function runAndDisplay() {
    try {
        const calculator = new SolarCalculator(db.tariffs, db.packages);
        const result = calculator.calculate(latestSolarParams);
        latestSolarData = result;
        displaySolarCalculation(result);
    } catch (err) { console.error(err); }
}

async function requestPanelUpdate(newCount) {
    if (!latestSolarParams) return;
    latestSolarParams.overridePanels = newCount;
    runAndDisplay();
}

window.adjustBatterySize = function(delta) {
    if (!latestSolarParams) return;
    latestSolarParams.batterySize = Math.max(0, (latestSolarParams.batterySize || 0) + delta);
    runAndDisplay();
};

window.adjustPanelCount = function(delta) {
    if (!latestSolarData) return;
    requestPanelUpdate(Math.max(1, latestSolarData.actualPanels + delta));
};

window.commitPanelInputChange = function(event) {
    const val = parseInt(event.target.value);
    if (!val || val < 1) { event.target.value = latestSolarData.actualPanels; return; }
    requestPanelUpdate(val);
};

window.syncAndTrigger = function(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.value = value;
        triggerSpontaneousUpdate();
    }
};

window.generateInvoiceLink = function() {
    if (!latestSolarData || !latestSolarData.selectedPackage || !latestSolarData.selectedPackage.bubbleId) {
        showNotification('No valid package selected for invoice. Please ensure a package is matched.', 'error');
        return;
    }

    const baseUrl = 'https://ee-inv-v2-production.up.railway.app/create-invoice';
    const params = new URLSearchParams();
    
    // Required
    params.set('package_id', latestSolarData.selectedPackage.bubbleId);

    // Optional: Discount
    // Access params from latestSolarParams
    const pDisc = latestSolarParams.percentDiscount || 0;
    const fDisc = latestSolarParams.fixedDiscount || 0;
    let discountStr = '';

    if (fDisc > 0) discountStr += `${fDisc}`;
    if (pDisc > 0) {
        if (discountStr) discountStr += ' '; // Space separator for combined
        discountStr += `${pDisc}%`;
    }
    
    if (discountStr) params.set('discount_given', discountStr);

    // Optional: Customer Default
    params.set('customer_name', 'Sample Quotation');
    
    // Optional: Panel Info (for reference)
    if (latestSolarData.actualPanels) params.set('panel_qty', latestSolarData.actualPanels);
    if (latestSolarData.config.panelType) params.set('panel_rating', `${latestSolarData.config.panelType}W`);

    window.open(`${baseUrl}?${params.toString()}`, '_blank');
};

// --- UI Rendering ---

function displayBillBreakdown(data) {
    const resultsDiv = document.getElementById('calculatorResults');
    const tariff = data.tariff;
    const afaRate = data.afaRate || 0;
    const afaCharge = tariff.usage_kwh * afaRate;
    const adjustedTotal = tariff.bill_total_normal + afaCharge;

    resultsDiv.innerHTML = `
        <div class="space-y-20 md:space-y-32">
            <section class="pt-4">
                <h2 class="text-sm font-bold uppercase tracking-[0.2em] mb-10 md:mb-14 tier-2 border-b-2 border-fact inline-block pb-1">02_BILL_ANALYSIS_LEDGER</h2>
                <div class="space-y-4 text-sm md:text-base">
                    <div class="flex justify-between tier-3 uppercase text-xs tracking-widest mb-6 border-b border-divider pb-2"><span>Component</span><span>Value_(RM)</span></div>
                    ${['usage_normal', 'network', 'capacity', 'retail', 'eei', 'sst_normal', 'kwtbb_normal'].map(key => `
                        <div class="flex justify-between py-2 gap-4 border-b border-divider/50">
                            <span class="tier-2 truncate">${key.replace('_normal','').toUpperCase()}</span>
                            <span class="tier-1 font-medium whitespace-nowrap">${formatCurrency(tariff[key])}</span>
                        </div>
                    `).join('')}
                    <div class="flex justify-between py-2 gap-4 border-b border-divider/50">
                        <span class="tier-2 truncate">AFA_ADJUSTMENT</span>
                        <span class="${afaCharge < 0 ? 'text-emerald-600' : 'tier-1'} font-medium whitespace-nowrap">${formatCurrency(afaCharge)}</span>
                    </div>
                    <div class="ledger-double-line pt-6 mt-8 flex justify-between items-baseline gap-4">
                        <span class="text-xs md:text-sm font-bold uppercase tracking-[0.2em]">Total_Matched</span>
                        <span class="text-3xl md:text-4xl font-bold tracking-tighter whitespace-nowrap">RM ${formatCurrency(adjustedTotal)}</span>
                    </div>
                    <div class="mt-10 flex justify-between items-center text-xs tier-3 uppercase tracking-widest gap-4 border-t border-divider pt-4">
                        <span>Derived_Usage: ${tariff.usage_kwh} kWh</span>
                        <span class="text-right">Tolerance: +/- 0.01%</span>
                    </div>
                </div>
            </section>

            <section id="solar-config-section" class="pt-4">
                <h2 class="text-sm font-bold uppercase tracking-[0.2em] mb-10 md:mb-14 tier-2 border-b-2 border-fact inline-block pb-1">03_MODELING_PARAMS</h2>
                <div class="grid gap-12 md:grid-cols-2 md:gap-x-24 md:gap-y-16">
                    ${renderInput('sunPeakHour', 'Sun_Peak_Hours', 'number', '3.4', '0.1', '3.0', '4.5')}
                    ${renderInput('morningUsage', 'Day_Usage_Share (%)', 'number', '30', '1', '1', '100')}
                    ${renderInput('panelRating', 'Panel_Rating (W)', 'number', '620', '1', '450', '850')}
                    ${renderInput('afaRate', 'AFA_Projection (RM)', 'number', '0.0000', '0.0001')}
                    ${renderInput('smpPrice', 'Export_Rate (RM)', 'number', '0.2703', '0.0001', '0.19', '0.2703')}
                    <div class="md:col-span-2 mt-4">
                        <div class="p-8 md:p-10 border-2 border-divider bg-white/30">
                            <h4 class="text-xs font-bold uppercase tracking-[0.2em] tier-3 mb-10 border-b border-divider pb-2 inline-block">Discount_Protocol</h4>
                            <div class="grid gap-8 md:grid-cols-2">
                                ${renderInput('percentDiscount', 'Percentage (%)', 'number', '0', '0.01', '0', '100')}
                                ${renderInput('fixedDiscount', 'Fixed (RM)', 'number', '0', '0.01', '0')}
                            </div>
                        </div>
                    </div>
                    <div class="md:col-span-2 pt-8">
                        <button onclick="calculateSolarSavings()" class="text-xs md:text-sm font-bold uppercase tracking-[0.3em] border-2 border-fact px-10 py-4 md:px-12 md:py-5 hover:bg-black hover:text-white transition-all w-full sm:w-auto shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]">Generate_ROI_Matrix -></button>
                    </div>
                </div>
            </section>
        </div>
    `;
}

function renderInput(id, label, type, val, step, min, max) {
    return `
        <div class="space-y-4">
            <label class="block text-xs uppercase tracking-[0.15em] tier-3 font-semibold">${label}</label>
            <div class="border-b-2 border-divider focus-within:border-fact transition-colors pb-1">
                <input type="${type}" id="${id}" step="${step}" ${min?`min="${min}"`:''} ${max?`max="${max}"`:''} value="${val}" oninput="triggerSpontaneousUpdate()" class="w-full text-xl md:text-2xl font-bold bg-transparent border-none outline-none py-1">
            </div>
        </div>
    `;
}

function displaySolarCalculation(data) {
    const resultsDiv = document.getElementById('calculatorResults');
    let solarDiv = document.getElementById('solarResultsCard');
    const isInitialRender = !solarDiv;

    if (!solarDiv) {
        solarDiv = document.createElement('div');
        solarDiv.id = 'solarResultsCard';
        resultsDiv.appendChild(solarDiv);
    }

    // "On The Spot" Visual Feedback
    solarDiv.classList.remove('opacity-100');
    solarDiv.classList.add('opacity-80');
    setTimeout(() => { solarDiv.classList.remove('opacity-80'); solarDiv.classList.add('opacity-100'); }, 50);

    const ds = data.details;
    const b = ds.battery.baseline;

    solarDiv.innerHTML = `
        <div class="space-y-20 md:space-y-32">
            <section class="bg-black text-white p-10 md:p-16 -mx-4 md:-mx-6 shadow-2xl">
                <h2 class="text-xs font-bold uppercase tracking-[0.4em] mb-12 opacity-70 border-b border-white/20 pb-2 inline-block">ROI_EXECUTIVE_SUMMARY</h2>
                <div class="space-y-10 text-base md:text-lg">
                    <div class="flex flex-col sm:flex-row justify-between gap-4">
                        <div><p class="opacity-70 text-xs tracking-widest uppercase">Original_Bill</p><p class="font-bold">RM ${formatCurrency(ds.billBefore)}</p></div>
                        <div><p class="opacity-70 text-xs tracking-widest uppercase">System_Size</p><p class="font-bold">${((data.actualPanels * data.config.panelType)/1000).toFixed(2)} kWp</p></div>
                    </div>
                    <div class="h-px bg-white/20"></div>
                    <div class="space-y-6">
                        <div class="flex justify-between items-baseline"><span>New_Monthly_Bill:</span><span class="font-bold">RM ${formatCurrency(b.billAfter)}</span></div>
                        <div class="flex justify-between items-baseline"><span>Bill_Reduction:</span><span class="font-bold">RM ${formatCurrency(ds.billReduction)}</span></div>
                        <div class="flex justify-between items-baseline"><span>Export_Savings:</span><span class="font-bold">RM ${formatCurrency(ds.exportSaving)}</span></div>
                        <div class="flex justify-between items-baseline text-emerald-400"><span>Net_Savings:</span><span class="font-bold">RM ${formatCurrency(b.totalSavings)}</span></div>
                        <div class="flex justify-between items-baseline text-orange-400"><span>Confidence_Level:</span><span class="font-bold">${data.confidenceLevel}%</span></div>
                    </div>
                    <div class="pt-10 border-t-2 border-white/40 flex justify-between items-baseline">
                        <span class="text-xs font-bold uppercase tracking-[0.2em] text-white/70">Total_Savings (Inc. Export):</span>
                        <span class="text-5xl md:text-6xl font-bold tracking-tighter text-emerald-400">RM ${data.monthlySavings}</span>
                    </div>
                </div>
            </section>

            <div class="flex justify-center -mt-10 mb-10 relative z-10">
                 <button onclick="generateInvoiceLink()" class="bg-white text-black font-bold uppercase tracking-[0.2em] text-xs md:text-sm px-8 py-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[4px] hover:translate-y-[4px] transition-all border-2 border-black flex items-center gap-3">
                    <span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                    Create_Invoice_Link
                 </button>
            </div>

            <section class="pt-4 border-y-2 border-fact py-12 md:py-16">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-10">
                    <div><span class="text-xs uppercase tracking-[0.2em] tier-3 font-bold">ROI_Percent</span><div class="text-4xl font-bold text-emerald-600">${formatPercentage((data.monthlySavings*12/data.finalSystemCost)*100,1)}%</div></div>
                    <div><span class="text-xs uppercase tracking-[0.2em] tier-3 font-bold">Payback</span><div class="text-4xl font-bold">${data.paybackPeriod} yr</div></div>
                    <div><span class="text-xs uppercase tracking-[0.2em] tier-3 font-bold">Net_Cost</span><div class="text-4xl font-bold">RM ${formatCurrency(data.finalSystemCost)}</div></div>
                </div>
            </section>

            <section class="pt-4">
                <h2 class="text-sm font-bold uppercase tracking-[0.2em] mb-10 tier-2 border-b-2 border-fact inline-block pb-1">07_SAVINGS_LEDGER</h2>
                <div class="space-y-4">
                    <div class="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-4 tier-3 uppercase text-xs tracking-widest pb-4 border-b border-divider"><span>Component</span><span class="text-right">Before</span><span class="text-right">After</span><span class="text-right">Delta</span></div>
                    ${data.billBreakdownComparison.items.map(i => `
                        <div class="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-4 py-2 border-b border-divider/50 text-sm">
                            <span class="tier-2 uppercase tracking-tighter">${i.label}</span>
                            <span class="text-right">${formatCurrency(i.before)}</span>
                            <span class="text-right">${formatCurrency(i.after)}</span>
                            <span class="text-right font-bold ${i.delta>=0?'text-emerald-600':'text-rose-600'}">${i.delta>=0?'-':'+'}${formatCurrency(Math.abs(i.delta))}</span>
                        </div>
                    `).join('')}
                </div>
            </section>

            ${data.config.batterySize > 0 ? `
                <section class="pt-16 border-t-2 border-divider">
                    <h2 class="text-sm font-bold uppercase tracking-[0.2em] mb-10 tier-2 border-b-2 border-fact inline-block pb-1">08_BATTERY_STORAGE</h2>
                    <div class="flex items-center gap-10">
                        <div class="flex items-center border-2 border-fact bg-white">
                            <button onclick="adjustBatterySize(-5)" class="w-12 h-12 hover:bg-black hover:text-white transition-colors text-xl font-bold">-</button>
                            <span class="w-24 text-center text-xl font-bold">${data.config.batterySize} kWh</span>
                            <button onclick="adjustBatterySize(5)" class="w-12 h-12 hover:bg-black hover:text-white transition-colors text-xl font-bold">+</button>
                        </div>
                        <div><p class="text-xs uppercase tier-3 font-bold">Value_Add</p><p class="text-2xl font-bold text-emerald-600">+RM ${formatCurrency(parseFloat(data.monthlySavings) - parseFloat(b.totalSavings))} / mo</p></div>
                    </div>
                </section>
            ` : `<div class="text-center"><button onclick="adjustBatterySize(5)" class="text-xs uppercase tracking-widest underline font-bold tier-3 hover:tier-1">[+] Simulate_Battery_Storage</button></div>`}
        </div>
    `;

    renderFloatingPanelModulation(data);
    // Scroll handled in calculateSolarSavings
    if (data.charts) createCharts(data.charts);
}

function renderFloatingPanelModulation(data) {
    let bar = document.getElementById('floatingPanelBar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'floatingPanelBar';
        bar.className = 'fixed bottom-4 left-0 right-0 z-[10000] flex justify-center pointer-events-none';
        document.body.appendChild(bar);
    }
    const delta = originalSolarData ? parseFloat(data.selectedPackage?.price || 0) - parseFloat(originalSolarData.selectedPackage?.price || 0) : 0;
    
    // Minimalist "Pill" Design
    bar.innerHTML = `
        <div class="bg-paper border-2 border-fact shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] pointer-events-auto flex items-center gap-4 px-4 py-2">
            
            <!-- Sun Peak -->
            <div class="flex items-center gap-1">
                <span class="text-[9px] font-bold uppercase tracking-wider tier-3">Sun</span>
                <div class="flex items-center bg-white border border-fact">
                    <button onclick="syncAndTrigger('sunPeakHour', (parseFloat(${data.config.sunPeakHour}) - 0.1).toFixed(1))" class="w-5 h-5 hover:bg-black hover:text-white transition-colors text-xs font-bold flex items-center justify-center">-</button>
                    <span class="w-8 text-center font-bold text-xs leading-none">${data.config.sunPeakHour}</span>
                    <button onclick="syncAndTrigger('sunPeakHour', (parseFloat(${data.config.sunPeakHour}) + 0.1).toFixed(1))" class="w-5 h-5 hover:bg-black hover:text-white transition-colors text-xs font-bold flex items-center justify-center">+</button>
                </div>
            </div>

            <div class="h-4 w-px bg-divider"></div>

            <!-- Morning Usage -->
            <div class="flex items-center gap-1">
                <span class="text-[9px] font-bold uppercase tracking-wider tier-3">Use</span>
                <div class="flex items-center bg-white border border-fact">
                    <button onclick="syncAndTrigger('morningUsage', Math.max(1, ${data.config.morningUsage} - 5))" class="w-5 h-5 hover:bg-black hover:text-white transition-colors text-xs font-bold flex items-center justify-center">-</button>
                    <span class="w-8 text-center font-bold text-xs leading-none">${data.config.morningUsage}%</span>
                    <button onclick="syncAndTrigger('morningUsage', Math.min(100, ${data.config.morningUsage} + 5))" class="w-5 h-5 hover:bg-black hover:text-white transition-colors text-xs font-bold flex items-center justify-center">+</button>
                </div>
            </div>

            <div class="h-4 w-px bg-divider"></div>

            <!-- Panels -->
            <div class="flex items-center gap-1">
                <div class="flex flex-col items-end leading-none">
                    <span class="text-[9px] font-bold uppercase tracking-wider tier-3">Panel</span>
                    ${Math.abs(delta) > 1 ? `<span class="text-[8px] font-bold ${delta>0?'text-rose-600':'text-emerald-600'}">${delta>0?'+':'-'}RM${Math.round(Math.abs(delta)/1000)}k</span>` : ''}
                </div>
                <div class="flex items-center bg-white border border-fact">
                    <button onclick="adjustPanelCount(-1)" class="w-6 h-6 hover:bg-black hover:text-white transition-colors text-xs font-bold flex items-center justify-center">-</button>
                    <input type="number" value="${data.actualPanels}" onchange="commitPanelInputChange(event)" class="w-8 text-center font-bold text-xs border-none bg-transparent outline-none p-0 appearance-none leading-none">
                    <button onclick="adjustPanelCount(1)" class="w-6 h-6 hover:bg-black hover:text-white transition-colors text-xs font-bold flex items-center justify-center">+</button>
                </div>
            </div>

        </div>
    `;
}

// --- Utils & Charts ---

function formatCurrency(v) { return Number(v||0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatPercentage(v, d=1) { return Number(v||0).toFixed(d); }
function showNotification(m, t='info') {
    const n = document.createElement('div');
    n.className = `fixed bottom-8 right-8 border p-4 z-[10001] text-xs uppercase font-bold shadow-lg ${t==='error'?'border-rose-600 bg-rose-50':'border-fact bg-paper'}`;
    n.innerHTML = `<div class="flex items-center gap-8"><span>[ ${m} ]</span><button onclick="this.parentElement.parentElement.remove()">X</button></div>`;
    document.body.appendChild(n);
    setTimeout(()=>n.remove(), 5000);
}

function showPanelRecommendationPopup(data) {
    const p = document.createElement('div');
    p.className = 'fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm';
    p.innerHTML = `
        <div class="w-full max-w-lg border border-fact bg-paper p-10 shadow-2xl space-y-8 text-center">
            <div class="text-xs font-bold uppercase tracking-[0.4em]">SYSTEM_RECOMMENDATION</div>
            <div class="text-6xl font-bold tracking-tighter">${data.recommendedPanels}</div>
            <div class="text-xs uppercase tier-3">Recommended_Panel_Units</div>
            <div class="text-[10px] tier-3 uppercase border-y border-divider py-4">Basis: ${data.details.monthlyUsageKwh}kWh/mo @ ${data.config.sunPeakHour}h Peak Sun</div>
            ${data.selectedPackage ? `<div class="p-4 bg-black text-white text-left"><div class="text-[10px] opacity-70">SELECTED_PACKAGE</div><div class="font-bold">${data.selectedPackage.packageName}</div><div class="text-[10px] opacity-70">RM ${formatCurrency(data.selectedPackage.price)}</div></div>` : ''}
            <button onclick="this.parentElement.parentElement.remove()" class="w-full bg-black text-white py-4 text-xs font-bold uppercase tracking-widest">View_Full_Report</button>
        </div>
    `;
    document.body.appendChild(p);
}

function createCharts(d) {
    const ctx1 = document.getElementById('electricityImportChart')?.getContext('2d');
    const ctx2 = document.getElementById('combinedChart')?.getContext('2d');
    if (!ctx1 || !ctx2) return;
    if (chartInstances.electricity) chartInstances.electricity.destroy();
    if (chartInstances.combined) chartInstances.combined.destroy();

    const commonOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } } } };
    
    chartInstances.electricity = new Chart(ctx1, {
        type: 'line',
        data: { labels: d.electricityUsagePattern.map(p=>p.hour+':00'), datasets: [{ data: d.electricityUsagePattern.map(p=>p.usage), borderColor: '#f59e0b', fill: true, tension: 0.4 }] },
        options: commonOpts
    });

    const net = d.electricityUsagePattern.map((u, i) => Math.max(0, u.usage - d.solarGenerationPattern[i].generation).toFixed(3));
    chartInstances.combined = new Chart(ctx2, {
        type: 'line',
        data: { 
            labels: d.electricityUsagePattern.map(p=>p.hour+':00'), 
            datasets: [
                { label: 'Original', data: d.electricityUsagePattern.map(p=>p.usage), borderColor: '#f59e0b', tension: 0.4 },
                { label: 'Solar', data: d.solarGenerationPattern.map(p=>p.generation), borderColor: '#10b981', tension: 0.4 },
                { label: 'Net', data: net, borderColor: '#dc2626', fill: true, tension: 0.4 }
            ] 
        },
        options: { ...commonOpts, plugins: { legend: { display: true, position: 'top' } } }
    });
}

async function testConnection() {
    const s = document.getElementById('dbStatus');
    try {
        const r = await fetch('/api/health');
        s.innerHTML = r.ok ? `<span>[ STATUS: ONLINE ]</span><div class="h-px grow bg-divider"></div>` : `<span>[ STATUS: OFFLINE ]</span><div class="h-px grow bg-divider"></div>`;
    } catch { s.innerHTML = `<span>[ STATUS: ERROR ]</span><div class="h-px grow bg-divider"></div>`; }
}
window.testConnection = testConnection;
