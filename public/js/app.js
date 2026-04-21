// State Management
let latestSolarParams = null;
let latestSolarData = null;
let latestFutureUsageData = null;
let originalSolarData = null; // Baseline for price comparison (the very first recommendation)
let currentHistoricalAfaRate = 0;
let invoiceBaseUrl = 'https://quote.atap.solar/create-invoice';
let selectedBillCycleMode = 'fullMonth';

// Surgical mode: stores the single matched tariff row from Bill Analysis
let currentTariffData = null;

// Data Cache — only used by the Reverse Simulation page
let db = {
    tariffs: [],
    packages: []
};

// Debounce timer for spontaneous updates (slider/knob changes)
let _spontaneousDebounceTimer = null;
let _futureUsageDebounceTimer = null;
let _solarRequestSeq = 0;
let _futureUsageRequestSeq = 0;
let futureUsageBlocks = Array(6).fill(false);

// Charts
const chartInstances = {
    electricity: null,
    solar: null,
    combined: null
};

const DAY_USAGE_WEIGHTS = [
    0, 0, 0, 0, 0, 0, 0.35, 0.7, 0.95, 1.05, 1.12, 1.18,
    1.2, 1.14, 1.02, 0.92, 0.82, 0.72, 0.48, 0
];

const NIGHT_USAGE_WEIGHTS = [
    0.42, 0.38, 0.34, 0.3, 0.32, 0.44, 0.6, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0.58, 0.92, 1.08, 1.14, 1.02, 0.7
];

const ALLOWED_BATTERY_SIZES = [0, 16, 32, 48];
const SHORT_BILL_CYCLE_SST_RATE = 0.08;
const DEFAULT_BATTERY_LOSS_PERCENT = 0;
const DEFAULT_BATTERY_DOD_PERCENT = 5;

function getResidentialPackagePhasePrefix(systemPhase = 3) {
    return parseInt(systemPhase, 10) === 1 ? '[1P]' : '[3P]';
}

function normalizeResidentialInverterType(value = 'string') {
    return String(value || '').trim().toLowerCase() === 'hybrid' ? 'hybrid' : 'string';
}

function buildResidentialPackageText(pkg = {}) {
    return `${pkg?.package_name || ''} ${pkg?.invoice_desc || ''}`.trim().toLowerCase();
}

function isHybridResidentialPackage(pkg = {}) {
    return /(hybrid|hybird)/i.test(buildResidentialPackageText(pkg));
}

function matchesResidentialInverterType(pkg, inverterType = 'string') {
    const normalizedType = normalizeResidentialInverterType(inverterType);
    const hybridPackage = isHybridResidentialPackage(pkg);
    return normalizedType === 'hybrid' ? hybridPackage : !hybridPackage;
}

function clampPercent(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(max, Math.max(min, numeric));
}

function normalizeBatteryLossPercent(value) {
    return clampPercent(value, 0, 20, DEFAULT_BATTERY_LOSS_PERCENT);
}

function normalizeBatteryDodPercent(value) {
    return clampPercent(value, 0, 10, DEFAULT_BATTERY_DOD_PERCENT);
}

function calculateBatteryFlow({
    monthlySolarGeneration,
    morningUsageKwh,
    dailyNightUsageKwh = 0,
    batterySizeVal,
    batteryLossPercent = DEFAULT_BATTERY_LOSS_PERCENT,
    batteryDodPercent = DEFAULT_BATTERY_DOD_PERCENT
}) {
    const nonOffsetSolarKwh = Math.max(0, monthlySolarGeneration - morningUsageKwh);
    const dailyNonOffsetSolarKwh = nonOffsetSolarKwh / 30;
    const roundTripEfficiency = Math.max(0, 1 - (batteryLossPercent / 100));
    const oneWayEfficiency = roundTripEfficiency > 0 ? Math.sqrt(roundTripEfficiency) : 0;
    const usableBatteryCapacityKwh = Math.max(0, batterySizeVal * (1 - (batteryDodPercent / 100)));
    const dailyInputNeededForFullBatteryKwh = oneWayEfficiency > 0 ? (usableBatteryCapacityKwh / oneWayEfficiency) : 0;
    const dailyInputNeededForNightLoadKwh = roundTripEfficiency > 0 ? (dailyNightUsageKwh / roundTripEfficiency) : 0;
    const dailySolarToBatteryInputKwh = Math.min(
        dailyNonOffsetSolarKwh,
        dailyInputNeededForFullBatteryKwh,
        dailyInputNeededForNightLoadKwh
    );
    const dailyStoredInternalKwh = dailySolarToBatteryInputKwh * oneWayEfficiency;
    const dailyBatteryDeliveredKwh = Math.min(dailyStoredInternalKwh * oneWayEfficiency, dailyNightUsageKwh);
    const monthlySolarToBatteryInputKwh = dailySolarToBatteryInputKwh * 30;
    const monthlyBatteryStoredKwh = dailyBatteryDeliveredKwh * 30;
    const dailyChargeAvailableKwh = dailySolarToBatteryInputKwh;
    const dailyBatteryStoredKwh = dailyBatteryDeliveredKwh;
    const dailyExcessExportKwh = Math.max(0, dailyNonOffsetSolarKwh - dailySolarToBatteryInputKwh);
    const monthlyExcessExportKwh = dailyExcessExportKwh * 30;
    const dailyChargeLossKwh = Math.max(0, dailySolarToBatteryInputKwh - dailyStoredInternalKwh);
    const dailyDischargeLossKwh = Math.max(0, dailyStoredInternalKwh - dailyBatteryDeliveredKwh);

    return {
        nonOffsetSolarKwh,
        dailyNonOffsetSolarKwh,
        roundTripEfficiency,
        chargeEfficiency: oneWayEfficiency,
        dischargeEfficiency: oneWayEfficiency,
        batteryLossPercent,
        batteryDodPercent,
        usableBatteryCapacityKwh,
        dailySolarToBatteryInputKwh,
        monthlySolarToBatteryInputKwh,
        dailyStoredInternalKwh,
        dailyChargeAvailableKwh,
        dailyBatteryStoredKwh,
        monthlyBatteryStoredKwh,
        dailyExcessExportKwh,
        monthlyExcessExportKwh,
        dailyChargeLossKwh,
        dailyDischargeLossKwh
    };
}

function normalizeBatterySize(value) {
    const numeric = Number(value);
    return ALLOWED_BATTERY_SIZES.includes(numeric) ? numeric : 0;
}

function getResidentialPanelQuantityGate(data) {
    const recommendedPanels = Math.max(1, Math.floor(toFiniteNumber(data?.recommendedPanels, data?.actualPanels || 1)));
    const systemPhase = parseInt(data?.config?.systemPhase, 10) || 3;
    const baseMin = Math.max(1, recommendedPanels - 2);

    return {
        recommendedPanels,
        min: systemPhase === 1 ? Math.min(baseMin, 10) : baseMin,
        max: recommendedPanels + 20
    };
}

function clampResidentialPanelQuantity(value, data) {
    const gate = data && Number.isFinite(Number(data.min)) && Number.isFinite(Number(data.max)) && !data.config
        ? {
            recommendedPanels: Math.max(1, Math.floor(toFiniteNumber(data.recommendedPanels, data.max))),
            min: Math.max(1, Math.floor(toFiniteNumber(data.min, 1))),
            max: Math.max(1, Math.floor(toFiniteNumber(data.max, 1)))
        }
        : getResidentialPanelQuantityGate(data);
    const numeric = Math.floor(toFiniteNumber(value, gate.recommendedPanels));
    return Math.max(gate.min, Math.min(gate.max, numeric));
}

function getBatterySizeStepIndex(value) {
    const normalized = normalizeBatterySize(value);
    return ALLOWED_BATTERY_SIZES.indexOf(normalized);
}

function buildUsagePattern(dailyUsageKwh, dayUsagePercent) {
    const safeDailyUsage = Number.isFinite(dailyUsageKwh) ? Math.max(0, dailyUsageKwh) : 0;
    const safeDayUsagePercent = Number.isFinite(dayUsagePercent)
        ? Math.min(100, Math.max(0, dayUsagePercent))
        : 30;

    const dayUsageKwh = safeDailyUsage * (safeDayUsagePercent / 100);
    const nightUsageKwh = Math.max(0, safeDailyUsage - dayUsageKwh);
    const dayWeightTotal = DAY_USAGE_WEIGHTS.reduce((sum, weight) => sum + weight, 0) || 1;
    const nightWeightTotal = NIGHT_USAGE_WEIGHTS.reduce((sum, weight) => sum + weight, 0) || 1;

    return Array.from({ length: 24 }, (_, hour) => {
        const dayPortion = DAY_USAGE_WEIGHTS[hour] > 0
            ? (dayUsageKwh * DAY_USAGE_WEIGHTS[hour]) / dayWeightTotal
            : 0;
        const nightPortion = NIGHT_USAGE_WEIGHTS[hour] > 0
            ? (nightUsageKwh * NIGHT_USAGE_WEIGHTS[hour]) / nightWeightTotal
            : 0;

        return {
            hour,
            usage: (dayPortion + nightPortion).toFixed(3)
        };
    });
}

function toFiniteNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function resetFutureUsageSimulation() {
    futureUsageBlocks = Array(6).fill(false);
    latestFutureUsageData = null;
    _futureUsageRequestSeq += 1;
    clearTimeout(_futureUsageDebounceTimer);
    _futureUsageDebounceTimer = null;
}

function getFutureUsageBoostKwh() {
    return futureUsageBlocks.reduce((sum, active) => sum + (active ? 1 : 0), 0) * 200;
}

function getProjectedFutureUsageKwh(baseUsageKwh = 0) {
    return Math.max(0, toFiniteNumber(baseUsageKwh) + getFutureUsageBoostKwh());
}

function normalizeBillCycleMode(mode) {
    return mode === 'under28Days' ? 'under28Days' : 'fullMonth';
}

function buildBillCycleMetrics(data) {
    if (data && data.billCycleModes && data.billCycleModes.fullMonth && data.billCycleModes.under28Days) {
        return data.billCycleModes;
    }

    const ds = data?.details || {};
    const afterBreakdown = data?.billBreakdownComparison?.after || ds?.billBreakdown?.after || null;
    const beforeBreakdown = data?.billBreakdownComparison?.before || ds?.billBreakdown?.before || null;
    const billBefore = toFiniteNumber(ds.billBefore, toFiniteNumber(beforeBreakdown?.total));
    const fullBillAfter = toFiniteNumber(ds.billAfter, toFiniteNumber(afterBreakdown?.total));
    const actualEeiSaving = toFiniteNumber(ds.actualEeiSaving, toFiniteNumber(data?.savingsBreakdown?.eeiSaving));
    const exportSaving = toFiniteNumber(ds.exportSaving);
    const fullBillReduction = toFiniteNumber(ds.billReduction, toFiniteNumber(data?.savingsBreakdown?.billReduction));
    const fullTotalSavings = toFiniteNumber(data?.monthlySavings);
    const fullPayableAfterSolar = Number.isFinite(Number(ds.estimatedPayableAfterSolar))
        ? toFiniteNumber(ds.estimatedPayableAfterSolar)
        : Math.max(0, fullBillAfter - exportSaving);
    const currentSst = toFiniteNumber(afterBreakdown?.sst);
    const shortCycleSstBase = toFiniteNumber(afterBreakdown?.usage) + toFiniteNumber(afterBreakdown?.network) + toFiniteNumber(afterBreakdown?.capacity);
    const recalculatedSst = shortCycleSstBase * SHORT_BILL_CYCLE_SST_RATE;
    const under28BillAfter = Math.max(0, fullBillAfter - currentSst + recalculatedSst);
    const under28GrossBillReduction = Math.max(0, billBefore - under28BillAfter);
    const under28BillReduction = Math.max(0, under28GrossBillReduction - actualEeiSaving);
    const under28TotalSavings = under28BillReduction + actualEeiSaving + exportSaving;
    const under28PayableAfterSolar = Math.max(0, under28BillAfter - exportSaving);

    return {
        fullMonth: {
            key: 'fullMonth',
            label: 'Full Month Bill Cycle',
            billAfter: fullBillAfter,
            billReduction: fullBillReduction,
            totalSavings: fullTotalSavings,
            payableAfterSolar: fullPayableAfterSolar,
            currentSst,
            recalculatedSst: currentSst,
            shortCycleSstBase
        },
        under28Days: {
            key: 'under28Days',
            label: '<28 Days Bill Cycle',
            billAfter: under28BillAfter,
            billReduction: under28BillReduction,
            totalSavings: under28TotalSavings,
            payableAfterSolar: under28PayableAfterSolar,
            currentSst,
            recalculatedSst,
            shortCycleSstBase
        }
    };
}

function buildBillBreakdownItemsForMode(data, modeMetrics) {
    const items = Array.isArray(data?.billBreakdownComparison?.items) ? data.billBreakdownComparison.items : [];
    return items.map((item) => {
        if (modeMetrics.key !== 'under28Days' || item.label !== 'SST') {
            return item;
        }

        const before = toFiniteNumber(item.before);
        const after = modeMetrics.recalculatedSst;
        return {
            ...item,
            after,
            delta: before - after
        };
    });
}

// --- Initialization ---
window.onload = function () {
    testConnection();
    fetchConfig().then(() => {
        // Only load the full dataset on the Reverse Simulation page (needs local binary search)
        if (document.getElementById('reverseCalcForm')) {
            initializeData().then(() => initReversePage());
        } else {
            // Main calculator: mark as ready immediately — no data pre-load needed
            const s = document.getElementById('dbStatus');
            if (s) s.innerHTML = `<span>[ STATUS: READY ]</span><div class="h-px grow bg-divider"></div>`;
        }
    });
};

async function fetchConfig() {
    try {
        const response = await fetch('/api/config');
        const config = await response.json();
        if (response.ok && config.invoiceBaseUrl) {
            invoiceBaseUrl = config.invoiceBaseUrl;
            console.log('Invoice base URL configured:', invoiceBaseUrl);
        }
    } catch (err) {
        console.error('Failed to fetch config, using default:', invoiceBaseUrl);
    }
}

// Full data load — ONLY used by the Reverse Simulation page
async function initializeData() {
    console.log('[initializeData] Starting fetch (Reverse Simulation mode)...');
    try {
        const response = await fetch('/api/all-data');
        if (!response.ok) {
            const errText = await response.text();
            console.error('[initializeData] API Error Text:', errText);
            throw new Error(`API Error: ${response.status}`);
        }
        const data = await response.json();
        console.log('[initializeData] Data parsed:', data.tariffs?.length, 'tariffs', data.packages?.length, 'packages');
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
        const s = document.getElementById('dbStatus');
        if (s) s.innerHTML = `<span>[ STATUS: DATA_LOADED ]</span><div class="h-px grow bg-divider"></div>`;
    } catch (err) {
        showNotification('Failed to load calculation data. ' + err.message, 'error');
        console.error('[initializeData] Error:', err);
        const s = document.getElementById('dbStatus');
        if (s) s.innerHTML = `<span>[ STATUS: DATA_ERROR ]</span><div class="h-px grow bg-divider"></div>`;
    }
}

// ─────────────────────────────────────────────
// Surgical API helpers
// ─────────────────────────────────────────────

/**
 * Surgical Bill Analysis: fetches exactly ONE matching tariff row from the server.
 * Stores it in currentTariffData. Returns the tariff row or null.
 */
async function fetchBillTariff(billAmount, historicalAfaRate) {
    const url = `/api/calculate-bill?amount=${encodeURIComponent(billAmount)}&afaRate=${encodeURIComponent(historicalAfaRate)}`;
    const response = await fetch(url);
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${response.status}`);
    }
    const data = await response.json();
    return data.tariff || null;
}

/**
 * Surgical Solar Calculation: sends all params to the server-side engine.
 * Returns the full result object compatible with displaySolarCalculation().
 */
async function fetchSolarCalculation(params) {
    const url = `/api/solar-calculation?${new URLSearchParams(params)}`;
    const response = await fetch(url);
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${response.status}`);
    }
    return response.json();
}

function initReversePage() {
    document.getElementById('reverseCalcForm').addEventListener('submit', function (e) {
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
        statusEl.className = `px-2.5 md:px-3 py-1 text-[10px] md:text-xs font-semibold uppercase tracking-wide ${status === 'REALISTIC' ? 'bg-emerald-100 text-emerald-800' :
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
        valueHtml += ` <span class="text-[10px] md:text-xs font-semibold ${confidence < 50 ? 'text-rose-600' : 'text-orange-500'}">[Confidence: ${confidence}%]</span>`;
    }

    if (valEl) valEl.innerHTML = valueHtml;

    // Add Warning Note for high morning usage
    let finalDesc = desc || '';
    if (morningUsage !== null && morningUsage > 50) {
        finalDesc += `<br><span class="text-[9px] md:text-[10px] text-rose-600 font-semibold mt-1.5 block leading-relaxed">NOTE: In a typical residential scenario, daytime usage is usually low as occupants are often away from home. Please be cautious of high morning offset estimations.</span>`;
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
            verdictBanner.className = "bg-rose-900 text-white p-6 md:p-8 shadow-xl relative overflow-hidden";
        } else if (isOptimistic) {
            verdictTitle.innerText = "OPTIMISTIC";
            verdictDesc.innerText = "The offer is theoretically possible but relies on ideal conditions (high self-consumption or perfect roof orientation).";
            verdictBanner.className = "bg-orange-600 text-white p-6 md:p-8 shadow-xl relative overflow-hidden";
        } else {
            verdictTitle.innerText = "REALISTIC";
            verdictDesc.innerText = "The promised savings align with standard modeling parameters and TNB tariffs.";
            verdictBanner.className = "bg-emerald-800 text-white p-6 md:p-8 shadow-xl relative overflow-hidden";
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

    resolveActualUsageKwh(usageAfterOffsetKwh, exportKwh) {
        return Math.max(0, Number(usageAfterOffsetKwh || 0) - Number(exportKwh || 0));
    }

    resolveActualEeiValue(tariffRow, eeiTariffRow, actualUsageKwh) {
        if (actualUsageKwh <= 0) {
            return 0;
        }

        const candidate = eeiTariffRow?.eei ?? tariffRow?.eei ?? 0;
        const numeric = Number(candidate);
        return Number.isFinite(numeric) ? numeric : 0;
    }

    buildBreakdown(tariffRow, afaRate, options = {}) {
        const usage = Number(tariffRow.usage_normal || 0);
        const network = Number(tariffRow.network || 0);
        const capacity = Number(tariffRow.capacity || 0);
        const sst = Number(tariffRow.sst_normal || 0);
        const originalEei = Number(tariffRow.eei || 0);
        const eei = options.overrideEei === null || options.overrideEei === undefined
            ? originalEei
            : Number(options.overrideEei || 0);
        const afa = Number(tariffRow.usage_kwh || 0) * afaRate;
        const fuelAdjustment = Number(tariffRow.fuel_adjustment || 0);
        const hasStoredTotal = tariffRow.bill_total_normal !== null && tariffRow.bill_total_normal !== undefined;
        const baseTotal = hasStoredTotal
            ? (Number(tariffRow.bill_total_normal || 0) - fuelAdjustment - originalEei + eei)
            : (usage + network + capacity + sst + eei);

        return {
            usage,
            network,
            capacity,
            sst,
            eei,
            eeiOriginal: originalEei,
            eeiUsageKwh: options.eeiUsageKwh ?? Number(tariffRow.usage_kwh || 0),
            afa,
            total: baseTotal + afa
        };
    }

    calculateEeiSaving(beforeEei, afterEei) {
        const before = Number(beforeEei || 0);
        const after = afterEei === null || afterEei === undefined ? before : Number(afterEei || 0);
        return before - after;
    }

    calculate(params) {
        const {
            amount, sunPeakHour, morningUsage, panelType,
            smpPrice, afaRate, historicalAfaRate,
            percentDiscount, fixedDiscount, batterySize, overridePanels,
            batteryLossPercent = DEFAULT_BATTERY_LOSS_PERCENT,
            batteryDodPercent = DEFAULT_BATTERY_DOD_PERCENT,
            systemPhase = 3,
            inverterType = 'string'
        } = params;

        // 1. Initial Tariff
        const tariff = this.findClosestTariff(amount, historicalAfaRate);
        if (!tariff) throw new Error('No tariff data found');
        const monthlyUsageKwh = tariff.usage_kwh;

        // 2. Recommendation (Using Server's Math.floor rule)
        const recommendedPanels = Math.max(1, Math.floor(monthlyUsageKwh / sunPeakHour / 30 / 0.62)) + 1;
        const actualPanelQty = overridePanels !== null ? overridePanels : recommendedPanels;

        // Calculate system size in kWp
        const systemSizeKwp = (actualPanelQty * panelType) / 1000;

        // SEDA Fee Logic: >=15.01kW for 3-phase, >=5.01kW for 1-phase
        const sedaLimit = systemPhase == 1 ? 5.01 : 15.01;
        const requiresSedaFee = systemSizeKwp >= sedaLimit;

        // 3. Package Lookup (Closest Match Logic)
        let selectedPackage = this.packages
            .filter(p =>
                p.active === true &&
                (p.special === false || p.special === null) &&
                p.type === 'Residential' &&
                p.solar_output_rating === panelType &&
                typeof p.package_name === 'string' &&
                p.package_name.toUpperCase().startsWith(getResidentialPackagePhasePrefix(systemPhase)) &&
                matchesResidentialInverterType(p, inverterType)
            )
            .sort((a, b) => Math.abs(a.panel_qty - actualPanelQty) - Math.abs(b.panel_qty - actualPanelQty) || a.price - b.price)[0] || null;

        // 4. Solar Gen
        const dailySolarGeneration = (actualPanelQty * panelType * sunPeakHour) / 1000;
        const monthlySolarGeneration = dailySolarGeneration * 30;

        // 5. Consumption Split
        const morningUsageKwh = (monthlySolarGeneration * morningUsage) / 100;
        const morningSelfConsumption = Math.min(monthlySolarGeneration, morningUsageKwh);
        const dailyNightUsage = Math.max(0, monthlyUsageKwh - morningUsageKwh) / 30;

        // 6. Battery Math (Hard Caps)
        const batteryFlow = calculateBatteryFlow({
            monthlySolarGeneration,
            morningUsageKwh,
            dailyNightUsageKwh: dailyNightUsage,
            batterySizeVal: batterySize,
            batteryLossPercent: normalizeBatteryLossPercent(batteryLossPercent),
            batteryDodPercent: normalizeBatteryDodPercent(batteryDodPercent)
        });
        const dailyMaxDischarge = batteryFlow.dailyBatteryStoredKwh;
        const monthlyMaxDischarge = batteryFlow.monthlyBatteryStoredKwh;

        // 7. Energy Flows
        // Baseline
        const netUsageBaseline = Math.max(0, monthlyUsageKwh - morningSelfConsumption);
        // ATAP Solar Malaysia: Max export = reduced import from grid
        // Any generation more than reduced import is considered donation to the grid
        const potentialExportBaseline = Math.max(0, monthlySolarGeneration - morningUsageKwh);
        const exportKwhBaseline = Math.min(potentialExportBaseline, netUsageBaseline);
        // With Battery
        const netUsageKwh = Math.max(0, monthlyUsageKwh - morningSelfConsumption - monthlyMaxDischarge);
        // ATAP Solar Malaysia: Max export = reduced import from grid
        const potentialExport = Math.max(0, monthlySolarGeneration - morningUsageKwh - batteryFlow.monthlySolarToBatteryInputKwh);
        const exportKwh = Math.min(potentialExport, netUsageKwh);
        const actualUsageBaselineKwh = this.resolveActualUsageKwh(netUsageBaseline, exportKwhBaseline);
        const actualUsageBaselineForLookup = Math.max(0, Math.floor(actualUsageBaselineKwh));
        const actualUsageKwh = this.resolveActualUsageKwh(netUsageKwh, exportKwh);
        const actualUsageForLookup = Math.max(0, Math.floor(actualUsageKwh));

        // Backup Generation Logic:
        // Exceeded generation is used as a weather buffer, capped at 10% of reduced import
        const exceededGeneration = Math.max(0, potentialExport - exportKwh);
        const backupGenerationKwh = Math.min(exceededGeneration, netUsageKwh * 0.1);
        const donatedKwh = Math.max(0, exceededGeneration - backupGenerationKwh);

        // 8. Financials
        const baselineTariff = this.lookupTariffByUsage(netUsageBaseline);
        const afterTariff = this.lookupTariffByUsage(netUsageKwh);
        const baselineEeiTariff = actualUsageBaselineKwh > 0 ? this.lookupTariffByUsage(actualUsageBaselineForLookup) : null;
        const afterEeiTariff = actualUsageKwh > 0 ? this.lookupTariffByUsage(actualUsageForLookup) : null;
        const actualEeiBaseline = this.resolveActualEeiValue(baselineTariff, baselineEeiTariff, actualUsageBaselineKwh);
        const actualEei = this.resolveActualEeiValue(afterTariff, afterEeiTariff, actualUsageKwh);

        const beforeBreakdown = this.buildBreakdown(tariff, afaRate);
        const afterBreakdown = this.buildBreakdown(afterTariff, afaRate, {
            overrideEei: actualEei,
            eeiUsageKwh: actualUsageForLookup
        });
        const baselineBreakdown = this.buildBreakdown(baselineTariff, afaRate, {
            overrideEei: actualEeiBaseline,
            eeiUsageKwh: actualUsageBaselineForLookup
        });

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
        const actualEeiSaving = this.calculateEeiSaving(beforeBreakdown.eei, afterBreakdown.eei);
        const grossBillReduction = beforeBreakdown.total - afterBreakdown.total;
        const billReduction = Math.max(0, grossBillReduction - actualEeiSaving);
        // Export rate logic: if reduced bill total kWh usage > 1500 kWh, use 0.3703, otherwise use smpPrice
        const effectiveExportRate = netUsageKwh > 1500 ? 0.3703 : smpPrice;
        const exportSavingRaw = exportKwh * effectiveExportRate;
        const backupGenerationSaving = backupGenerationKwh * effectiveExportRate;

        const actualEeiSavingBaseline = this.calculateEeiSaving(beforeBreakdown.eei, baselineBreakdown.eei);
        const grossBillReductionBaseline = beforeBreakdown.total - baselineBreakdown.total;
        const billReductionBaseline = Math.max(0, grossBillReductionBaseline - actualEeiSavingBaseline);
        // For baseline, check netUsageBaseline instead
        const effectiveExportRateBaseline = netUsageBaseline > 1500 ? 0.3703 : smpPrice;
        const exportSavingBaselineRaw = exportKwhBaseline * effectiveExportRateBaseline;
        const exportSavingBaseline = Math.min(exportSavingBaselineRaw, baselineBreakdown.total);
        const totalMonthlySavingsBaseline = billReductionBaseline + actualEeiSavingBaseline + exportSavingBaseline;
        const exportSaving = Math.min(exportSavingRaw, afterBreakdown.total);
        const totalMonthlySavings = billReduction + actualEeiSaving + exportSaving;
        const estimatedPayableAfterSolar = Math.max(0, afterBreakdown.total - exportSavingRaw);
        const batteryValueFromStoredEnergy = monthlyMaxDischarge * (0.4869 + afaRate);
        const batteryExportOpportunityCost = Math.max(0, exportSavingBaselineRaw - exportSavingRaw);
        const batteryEeiValueAdd = actualEeiSaving - actualEeiSavingBaseline;
        const batteryValueAddMonthly = Math.max(0, batteryValueFromStoredEnergy - batteryExportOpportunityCost + batteryEeiValueAdd);

        // 9. System Costs
        let systemCostBeforeDiscount = null, finalSystemCost = null, totalDiscountAmount = 0, paybackPeriod = 'N/A';
        if (selectedPackage) {
            systemCostBeforeDiscount = selectedPackage.price;
            const afterPercent = systemCostBeforeDiscount * (1 - (percentDiscount || 0) / 100);
            finalSystemCost = Math.max(0, afterPercent - (fixedDiscount || 0));
            totalDiscountAmount = systemCostBeforeDiscount - finalSystemCost;

            console.log('[Calculator] System Cost:', {
                base: systemCostBeforeDiscount,
                percentDiscount: percentDiscount,
                fixedDiscount: fixedDiscount,
                final: finalSystemCost
            });

            if (totalMonthlySavings > 0 && finalSystemCost > 0) {
                paybackPeriod = (finalSystemCost / (totalMonthlySavings * 12)).toFixed(1);
            }
        } else {
            console.warn('[Calculator] No package selected, cannot calculate costs/discounts');
        }

        // 10. Chart Data
        const dailyUsageKwh = monthlyUsageKwh / 30;
        const electricityUsagePattern = buildUsagePattern(dailyUsageKwh, morningUsage);
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
            selectedPackage: selectedPackage ? { packageName: selectedPackage.package_name, price: selectedPackage.price, panelWattage: panelType, linked_package: selectedPackage.bubble_id || String(selectedPackage.id || '') } : null,
            solarConfig: `${actualPanelQty} x ${panelType}W panels (${systemSizeKwp.toFixed(1)} kW system)`,
            systemSizeKwp: systemSizeKwp.toFixed(1),
            requiresSedaFee: requiresSedaFee,
            monthlySavings: totalMonthlySavings.toFixed(2),
            confidenceLevel: confidenceLevel.toFixed(1),
            systemCostBeforeDiscount, totalDiscountAmount, finalSystemCost: finalSystemCost !== null ? finalSystemCost.toFixed(2) : null,
            paybackPeriod,
            details: {
                monthlyUsageKwh, monthlySolarGeneration: monthlySolarGeneration.toFixed(2),
                billBefore: beforeBreakdown.total.toFixed(2), billAfter: afterBreakdown.total.toFixed(2),
                billReduction: billReduction.toFixed(2), exportSaving: exportSaving.toFixed(2), exportSavingRaw: exportSavingRaw.toFixed(2),
                estimatedPayableAfterSolar: estimatedPayableAfterSolar.toFixed(2),
                netUsageKwh: netUsageKwh.toFixed(2), exportKwh: exportKwh.toFixed(2),
                actualUsageForEeiKwh: actualUsageKwh.toFixed(2),
                actualUsageForEeiLookupKwh: actualUsageForLookup,
                actualEei: actualEei.toFixed(2),
                actualEeiSaving: actualEeiSaving.toFixed(2),
                backupGenerationKwh: backupGenerationKwh.toFixed(2),
                backupGenerationSaving: backupGenerationSaving.toFixed(2),
                donatedKwh: donatedKwh.toFixed(2),
                effectiveExportRate: effectiveExportRate.toFixed(4),
                totalGeneration: monthlySolarGeneration.toFixed(2),
                savingsBreakdown: {
                    billReduction: billReduction.toFixed(2),
                    eeiSaving: actualEeiSaving.toFixed(2),
                    exportCredit: exportSaving.toFixed(2),
                    grossBillReduction: grossBillReduction.toFixed(2),
                    afaImpact: (monthlyUsageKwh - netUsageBaseline) * afaRate,
                    baseBillReduction: billReduction - ((monthlyUsageKwh - netUsageBaseline) * afaRate),
                },
                battery: {
                    baseline: {
                        billReduction: billReductionBaseline, eeiSaving: actualEeiSavingBaseline, exportCredit: exportSavingBaseline, exportCreditRaw: exportSavingBaselineRaw,
                        grossBillReduction: grossBillReductionBaseline,
                        totalSavings: totalMonthlySavingsBaseline.toFixed(2), billAfter: baselineBreakdown.total,
                        estimatedPayableAfterSolar: Math.max(0, baselineBreakdown.total - exportSavingBaselineRaw),
                        actualUsageForEeiKwh: actualUsageBaselineKwh.toFixed(2),
                        actualUsageForEeiLookupKwh: actualUsageBaselineForLookup,
                        actualEei: actualEeiBaseline.toFixed(2),
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
                    },
                    size: batterySize,
                    efficiency: batteryFlow.roundTripEfficiency,
                    roundTripEfficiency: batteryFlow.roundTripEfficiency,
                    chargeEfficiency: batteryFlow.chargeEfficiency,
                    dischargeEfficiency: batteryFlow.dischargeEfficiency,
                    lossPercent: normalizeBatteryLossPercent(batteryLossPercent),
                    dodPercent: normalizeBatteryDodPercent(batteryDodPercent),
                    usableCapacityKwh: batteryFlow.usableBatteryCapacityKwh.toFixed(2),
                    nonOffsetSolarKwh: batteryFlow.nonOffsetSolarKwh.toFixed(2),
                    dailyNonOffsetSolarKwh: batteryFlow.dailyNonOffsetSolarKwh.toFixed(2),
                    dailySolarToBatteryInputKwh: batteryFlow.dailySolarToBatteryInputKwh.toFixed(2),
                    monthlySolarToBatteryInputKwh: batteryFlow.monthlySolarToBatteryInputKwh.toFixed(2),
                    dailyChargeAvailableKwh: batteryFlow.dailyChargeAvailableKwh.toFixed(2),
                    dailyStoredInternalKwh: batteryFlow.dailyStoredInternalKwh.toFixed(2),
                    dailyStoredKwh: batteryFlow.dailyBatteryStoredKwh.toFixed(2),
                    monthlyStoredKwh: batteryFlow.monthlyBatteryStoredKwh.toFixed(2),
                    dailyExcessExportKwh: batteryFlow.dailyExcessExportKwh.toFixed(2),
                    monthlyExcessExportKwh: batteryFlow.monthlyExcessExportKwh.toFixed(2),
                    dailyChargeLossKwh: batteryFlow.dailyChargeLossKwh.toFixed(2),
                    dailyDischargeLossKwh: batteryFlow.dailyDischargeLossKwh.toFixed(2),
                    valueAddMonthly: batteryValueAddMonthly.toFixed(2),
                    miniReport: {
                        monthlySolarSentToChargeBatteryKwh: batteryFlow.monthlySolarToBatteryInputKwh.toFixed(2),
                        monthlyBatteryStoredAndDischargedKwh: batteryFlow.monthlyStoredKwh.toFixed(2),
                        newBillAfterSolarBattery: afterBreakdown.total !== null ? afterBreakdown.total.toFixed(2) : null,
                        newExportKwh: exportKwh.toFixed(2),
                        newActualEei: actualEei.toFixed(2)
                    }
                },
                miniReport: {
                    monthlySolarSentToChargeBatteryKwh: batteryFlow.monthlySolarToBatteryInputKwh.toFixed(2),
                    monthlyBatteryStoredAndDischargedKwh: batteryFlow.monthlyStoredKwh.toFixed(2),
                    newBillAfterSolarBattery: afterBreakdown.total !== null ? afterBreakdown.total.toFixed(2) : null,
                    newExportKwh: exportKwh.toFixed(2),
                    newActualEei: actualEei.toFixed(2)
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

// EPP Rates Data
const EPP_RATES = {
    "Maybank": { 6: 2.50, 12: 3.50, 24: 5.50, 36: 6.00, 48: 8.00, 60: 10.00 },
    "Public Bank": { 6: 2.50, 12: 3.50, 18: 4.00, 24: 5.50, 36: 6.00, 48: 8.00, 60: 10.00 },
    "Hong Leong Bank": { 12: 3.50, 24: 5.50, 36: 6.00, 48: 8.00, 60: 10.00 },
    "CIMB": { 6: 2.50, 12: 3.50 },
    "AM Bank": { 24: 7.00, 36: 9.00 },
    "UOB": { 6: 2.50, 12: 3.50, 24: 5.50, 48: 8.50, 68: 11.50 },
    "OCBC": { 6: 4.00, 12: 5.00, 18: 6.00, 24: 7.00, 36: 8.00, 48: 9.00 }
};

window.updateEPPCalculation = function (event) {
    const bankSelect = document.getElementById('eppBank');
    const tenureSelect = document.getElementById('eppTenure');
    const resultDiv = document.getElementById('eppResult');
    const feeDiv = document.getElementById('eppFee');
    const netDiv = document.getElementById('eppNet');
    const noteDiv = document.getElementById('eppNote');

    if (!bankSelect || !tenureSelect || !latestSolarData || !latestSolarData.finalSystemCost) return;

    const bank = bankSelect.value;
    const fullPrice = parseFloat(latestSolarData.finalSystemCost);

    // Update tenure options ONLY if bank changed or tenure is empty
    if (!event || (event && event.target.id === 'eppBank') || tenureSelect.options.length === 0) {
        const rates = EPP_RATES[bank] || {};
        const tenures = Object.keys(rates).sort((a, b) => parseInt(a) - parseInt(b));
        const currentTenure = tenureSelect.value;

        tenureSelect.innerHTML = tenures.map(t => `<option value="${t}">${t} Months</option>`).join('');

        // Try to preserve selection if possible, else select max
        if (tenures.includes(currentTenure)) {
            tenureSelect.value = currentTenure;
        } else {
            tenureSelect.value = tenures[tenures.length - 1]; // Default to longest tenure
        }
    }

    const tenure = parseInt(tenureSelect.value);
    const rate = EPP_RATES[bank]?.[tenure] || 0;

    // 5% Downpayment Rule
    const downpayment = fullPrice * 0.05;
    const financedAmount = fullPrice * 0.95; // 95% is financed via EPP

    const monthlyInstallment = (fullPrice * 0.95 * (1 + rate / 100)) / tenure;
    const feeAmount = financedAmount * (rate / 100);
    const netProceeds = financedAmount - feeAmount;

    if (resultDiv) resultDiv.textContent = `RM ${formatCurrency(monthlyInstallment)}`;

    if (feeDiv) {
        feeDiv.innerHTML = `
            <div class="space-y-1">
                <div class="flex justify-between">
                    <span class="text-gray-500">System Price</span>
                    <span>RM ${formatCurrency(fullPrice)}</span>
                </div>
                <div class="flex justify-between text-rose-600 font-medium">
                    <span>Downpayment (5%)</span>
                    <span>-RM ${formatCurrency(downpayment)}</span>
                </div>
                <div class="flex justify-between border-t border-gray-100 pt-1 mt-1">
                    <span class="text-gray-500">Financed Amount (95%)</span>
                    <span class="font-semibold">RM ${formatCurrency(financedAmount)}</span>
                </div>
                <div class="flex justify-between text-[10px] mt-1">
                    <span class="text-gray-500">EPP Interest (${rate}%)</span>
                    <span class="text-purple-700">RM ${formatCurrency(financedAmount * (rate / 100))}</span>
                </div>
                <div class="flex justify-between text-[10px] border-t border-gray-100 pt-1 mt-1">
                    <span class="text-gray-500">Monthly Payment</span>
                    <span class="text-gray-500 text-[9px]">RM ${formatCurrency(financedAmount)} × (100% + ${rate}%) ÷ ${tenure}</span>
                </div>
            </div>
        `;
    }

    if (netDiv) {
        netDiv.innerHTML = `<span class="text-gray-500">Net Receivable (95%):</span> <span class="text-emerald-600 font-bold ml-2">RM ${formatCurrency(netProceeds)}</span>`;
    }

    if (noteDiv) {
        noteDiv.innerHTML = `<span class="text-rose-600 font-bold">IMPORTANT:</span> 1st 5% Downpayment (RM ${formatCurrency(downpayment)}) must be paid via Cash/Credit Card. EPP interest (${rate}%) applies to remaining 95% financed amount.`;
    }
};

// --- Sun Peak Detector ---
// Feature intentionally disabled to keep sun peak input manual only.
window.openSunPeakDetector = function () {
    showNotification('Sun Peak Detector is disabled.', 'info');
};

window.closeSunPeakDetector = function () {
    // Detector removed.
};

window.detectSunPeak = async function () {
    showNotification('Sun Peak Detector is disabled.', 'info');
};

window.applyDetectedSunPeak = function () {
    showNotification('Sun Peak Detector is disabled.', 'info');
};

// --- Interaction Handlers ---

document.getElementById('billForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const billAmount = parseFloat(document.getElementById('billAmount').value);
    const afaRate = parseFloat(document.getElementById('historicalAfaRate').value) || 0;
    if (!billAmount || billAmount <= 0) return showNotification('Invalid bill amount', 'error');

    // Show loading state in results area
    const resultsDiv = document.getElementById('calculatorResults');
    if (resultsDiv) resultsDiv.innerHTML = `<div class="py-16 text-center text-xs font-bold uppercase tracking-widest animate-pulse tier-3">Querying_TNB_Database...</div>`;

    try {
        const tariff = await fetchBillTariff(billAmount, afaRate);
        if (!tariff) throw new Error('No matching tariff found');

        // Store for downstream surgical calls
        currentTariffData = tariff;
        currentHistoricalAfaRate = afaRate;

        // Map server field names to the shape displayBillBreakdown() expects
        const mappedTariff = {
            usage_kwh: parseFloat(tariff.usage_kwh),
            usage_normal: parseFloat(tariff.energy_charge ?? tariff.usage_normal ?? 0),
            network: parseFloat(tariff.network_charge ?? tariff.network ?? 0),
            capacity: parseFloat(tariff.capacity_charge ?? tariff.capacity ?? 0),
            retail: parseFloat(tariff.retail_charge ?? tariff.retail ?? 0),
            eei: parseFloat(tariff.energy_efficiency_incentive ?? tariff.eei ?? 0),
            sst_normal: parseFloat(tariff.sst_tax ?? tariff.sst_normal ?? 0),
            kwtbb_normal: parseFloat(tariff.kwtbb_fund ?? tariff.kwtbb_normal ?? 0),
            bill_total_normal: parseFloat(tariff.total_bill ?? tariff.bill_total_normal ?? 0),
            fuel_adjustment: parseFloat(tariff.fuel_adjustment ?? 0)
        };

        displayBillBreakdown({ tariff: mappedTariff, afaRate });
        if (document.getElementById('afaRate')) document.getElementById('afaRate').value = afaRate.toFixed(4);

        // Reset solar results so stale data is cleared
        clearTimeout(_spontaneousDebounceTimer);
        _spontaneousDebounceTimer = null;
        _solarRequestSeq += 1;
        latestSolarParams = null;
        latestSolarData = null;
        resetFutureUsageSimulation();
        const existing = document.getElementById('solarResultsCard');
        if (existing) existing.remove();
        const floatingBar = document.getElementById('floatingPanelBar');
        if (floatingBar) floatingBar.innerHTML = '';

    } catch (err) {
        console.error('[Bill Analysis] Error:', err);
        showNotification('Bill Analysis failed: ' + err.message, 'error');
        if (resultsDiv) resultsDiv.innerHTML = `<div class="py-10 text-center text-xs font-bold uppercase text-rose-600 border border-rose-300 p-4">[ Error: ${err.message} ]</div>`;
    }
});

window.calculateSolarSavings = async function () {
    if (!currentTariffData) return showNotification('Please complete Bill Analysis first.', 'error');

    const params = collectLiveSolarParams({
        batterySize: 0,
        overridePanels: ''
    });
    latestSolarParams = params;

    // Show inline loading inside the results card area
    let solarDiv = document.getElementById('solarResultsCard');
    if (!solarDiv) {
        solarDiv = document.createElement('div');
        solarDiv.id = 'solarResultsCard';
        document.getElementById('calculatorResults').appendChild(solarDiv);
    }
    solarDiv.innerHTML = `<div class="py-16 text-center text-xs font-bold uppercase tracking-widest animate-pulse tier-3">Computing_ROI_Matrix...</div>`;

    try {
        const requestSeq = ++_solarRequestSeq;
        const result = await fetchSolarCalculation(params);
        if (requestSeq !== _solarRequestSeq) return;
        latestSolarData = result;
        displaySolarCalculation(result);

        // Scroll to results
        solarDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
        originalSolarData = JSON.parse(JSON.stringify(result)); // Capture baseline for Investment Delta
    } catch (err) {
        console.error('[Solar Calculation] Error:', err);
        showNotification('Calculation failed: ' + err.message, 'error');
        solarDiv.innerHTML = `<div class="py-10 text-center text-xs font-bold uppercase text-rose-600 border border-rose-300 p-4">[ Calculation Error: ${err.message} ]</div>`;
    }
};

function collectLiveSolarParams(overrides = {}) {
    const panelRatingInput = document.getElementById('panelRating');
    const panelCountInput = document.querySelector('#floatingPanelBar input[type="number"]');
    const batteryLossInput = document.getElementById('batteryLossPercent');
    const batteryDodInput = document.getElementById('batteryDodPercent');
    const livePanelOverride = panelCountInput ? parseInt(panelCountInput.value, 10) : NaN;
    const fallbackOverride = latestSolarParams?.overridePanels;
    const resolvedOverridePanels = Number.isFinite(livePanelOverride) && livePanelOverride >= 1
        ? livePanelOverride
        : (fallbackOverride !== undefined ? fallbackOverride : '');

    return {
        amount: parseFloat(document.getElementById('billAmount').value),
        sunPeakHour: parseFloat(document.getElementById('sunPeakHour').value),
        morningUsage: parseFloat(document.getElementById('morningUsage').value),
        panelType: panelRatingInput ? parseInt(panelRatingInput.value, 10) : 650,
        smpPrice: parseFloat(document.getElementById('smpPrice').value),
        afaRate: parseFloat(document.getElementById('afaRate').value) || 0,
        historicalAfaRate: currentHistoricalAfaRate,
        percentDiscount: parseFloat(document.getElementById('percentDiscount')?.value) || 0,
        fixedDiscount: parseFloat(document.getElementById('fixedDiscount')?.value) || 0,
        batterySize: normalizeBatterySize(latestSolarParams?.batterySize || 0),
        batteryLossPercent: normalizeBatteryLossPercent(batteryLossInput?.value ?? latestSolarParams?.batteryLossPercent),
        batteryDodPercent: normalizeBatteryDodPercent(batteryDodInput?.value ?? latestSolarParams?.batteryDodPercent),
        overridePanels: resolvedOverridePanels,
        systemPhase: parseInt(document.getElementById('systemPhase').value, 10) || 3,
        inverterType: normalizeResidentialInverterType(document.getElementById('inverterType')?.value || latestSolarParams?.inverterType || 'string'),
        ...overrides
    };
}

window.triggerSpontaneousUpdate = function (source) {
    if (!latestSolarParams) {
        console.warn('[triggerSpontaneousUpdate] No active calculation — ignoring.');
        return;
    }

    console.log(`[triggerSpontaneousUpdate] Triggered by: ${source}`);

    const panelRatingInput = document.getElementById('panelRating');
    const newPanelRating = panelRatingInput ? parseInt(panelRatingInput.value) : 650;
    const panelRatingChanged = latestSolarParams.panelType !== newPanelRating;

    // Update in-memory params
    latestSolarParams.sunPeakHour = parseFloat(document.getElementById('sunPeakHour').value) || 3.4;
    latestSolarParams.morningUsage = parseFloat(document.getElementById('morningUsage').value) || 30;
    latestSolarParams.panelType = newPanelRating;
    latestSolarParams.afaRate = parseFloat(document.getElementById('afaRate').value) || 0;
    latestSolarParams.smpPrice = parseFloat(document.getElementById('smpPrice').value) || 0.2703;
    latestSolarParams.percentDiscount = parseFloat(document.getElementById('percentDiscount')?.value) || 0;
    latestSolarParams.fixedDiscount = parseFloat(document.getElementById('fixedDiscount')?.value) || 0;
    latestSolarParams.systemPhase = parseInt(document.getElementById('systemPhase')?.value) || 3;
    latestSolarParams.inverterType = normalizeResidentialInverterType(document.getElementById('inverterType')?.value || latestSolarParams.inverterType || 'string');
    latestSolarParams.batteryLossPercent = normalizeBatteryLossPercent(document.getElementById('batteryLossPercent')?.value ?? latestSolarParams.batteryLossPercent);
    latestSolarParams.batteryDodPercent = normalizeBatteryDodPercent(document.getElementById('batteryDodPercent')?.value ?? latestSolarParams.batteryDodPercent);

    // If panel rating changed, reset panel override so server recalculates from scratch
    if (panelRatingChanged) {
        console.log(`[Panel Rating Change] ${latestSolarParams.panelType}W → ${newPanelRating}W`);
        latestSolarParams.overridePanels = '';
    }

    // Debounce: wait 200ms after last change before firing the server request
    clearTimeout(_spontaneousDebounceTimer);
    _spontaneousDebounceTimer = setTimeout(() => runAndDisplay(), 200);
};

async function runAndDisplay() {
    if (!latestSolarParams) return;
    try {
        const requestSeq = ++_solarRequestSeq;
        const params = collectLiveSolarParams({
            batterySize: latestSolarParams.batterySize || 0,
            overridePanels: latestSolarParams.overridePanels
        });
        latestSolarParams = params;
        const result = await fetchSolarCalculation(params);
        if (requestSeq !== _solarRequestSeq) return;
        latestSolarData = result;
        displaySolarCalculation(result);
    } catch (err) {
        console.error('[runAndDisplay] Error:', err);
        showNotification('Recalculation failed: ' + err.message, 'error');
    }
}

async function requestPanelUpdate(newCount) {
    if (!latestSolarParams) return;
    latestSolarParams.overridePanels = clampResidentialPanelQuantity(newCount, latestSolarData);
    // Debounce panel +/- button rapid clicks
    clearTimeout(_spontaneousDebounceTimer);
    _spontaneousDebounceTimer = setTimeout(() => runAndDisplay(), 150);
}

function scheduleFutureUsageSimulation() {
    clearTimeout(_futureUsageDebounceTimer);
    _futureUsageDebounceTimer = setTimeout(() => updateFutureUsageSimulation(), 150);
}

function renderFutureUsageResultCard(baseData, futureData, projectedUsageKwh, boostKwh) {
    const currentSavings = toFiniteNumber(latestSolarData?.monthlySavings);
    const futureSavings = toFiniteNumber(futureData?.monthlySavings);
    const savingsDelta = futureSavings - currentSavings;
    const currentPanels = latestSolarData?.actualPanels ?? baseData?.actualPanels ?? 0;
    const batterySize = normalizeBatterySize(latestSolarParams?.batterySize ?? baseData?.config?.batterySize ?? 0);
    const futureBillBefore = toFiniteNumber(futureData?.billComparison?.before?.billAmount, futureData?.details?.billBefore);
    const futureBillAfter = toFiniteNumber(futureData?.billComparison?.after?.billAmount, futureData?.details?.billAfter);
    const futureMorningOffsetKwh = toFiniteNumber(futureData?.details?.morningUsageKwh);
    const futureMorningSaving = toFiniteNumber(futureData?.details?.morningSaving);
    const futureExportSaving = toFiniteNumber(futureData?.details?.exportSaving);
    const futureActualEei = toFiniteNumber(futureData?.details?.actualEei);
    const futureActualEeiSaving = toFiniteNumber(futureData?.details?.actualEeiSaving);
    const futureMonthlyUsage = toFiniteNumber(futureData?.details?.monthlyUsageKwh, projectedUsageKwh);

    return `
        <div class="space-y-5 md:space-y-6">
            <div class="bg-black text-white p-4 md:p-5 space-y-3">
                <div class="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <div class="text-[10px] md:text-xs font-bold uppercase tracking-wide opacity-70">Projected_Future_Usage</div>
                        <div class="text-[10px] md:text-xs uppercase tracking-wide opacity-60 mt-1">Current system stays fixed at ${currentPanels} panels and ${batterySize} kWh battery.</div>
                    </div>
                    <div class="text-right">
                        <div class="text-[10px] md:text-xs uppercase tracking-wide opacity-60">Selected_Bump</div>
                        <div class="text-xl md:text-2xl font-bold">${boostKwh > 0 ? `+${boostKwh.toLocaleString('en-MY')} kWh` : '0 kWh'}</div>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                <div class="border-2 border-fact bg-white p-4 md:p-5 space-y-3">
                    <div class="text-[10px] md:text-xs font-bold uppercase tracking-wide tier-3">Usage_Shift</div>
                    <div class="grid grid-cols-2 gap-3 md:gap-4">
                        <div>
                            <div class="text-[10px] uppercase tracking-wide tier-3 font-semibold mb-1">Base Usage</div>
                            <div class="text-lg md:text-xl font-bold">${toFiniteNumber(baseData?.details?.monthlyUsageKwh, 0).toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} kWh</div>
                        </div>
                        <div>
                            <div class="text-[10px] uppercase tracking-wide tier-3 font-semibold mb-1">Future Usage</div>
                            <div class="text-lg md:text-xl font-bold">${futureMonthlyUsage.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} kWh</div>
                        </div>
                        <div>
                            <div class="text-[10px] uppercase tracking-wide tier-3 font-semibold mb-1">Morning Offset</div>
                            <div class="text-lg md:text-xl font-bold">${futureMorningOffsetKwh.toLocaleString('en-MY', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh</div>
                        </div>
                        <div>
                            <div class="text-[10px] uppercase tracking-wide tier-3 font-semibold mb-1">Morning Saving</div>
                            <div class="text-lg md:text-xl font-bold text-emerald-600">RM ${formatCurrency(futureMorningSaving)}</div>
                        </div>
                    </div>
                </div>
                <div class="border-2 border-fact bg-white p-4 md:p-5 space-y-3">
                    <div class="text-[10px] md:text-xs font-bold uppercase tracking-wide tier-3">Bill_Impact</div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                        <div>
                            <div class="text-[10px] uppercase tracking-wide tier-3 font-semibold mb-1">New Bill</div>
                            <div class="text-lg md:text-xl font-bold">RM ${formatCurrency(futureBillBefore)}</div>
                        </div>
                        <div>
                            <div class="text-[10px] uppercase tracking-wide tier-3 font-semibold mb-1">Bill After Solar</div>
                            <div class="text-lg md:text-xl font-bold text-emerald-600">RM ${formatCurrency(futureBillAfter)}</div>
                        </div>
                        <div>
                            <div class="text-[10px] uppercase tracking-wide tier-3 font-semibold mb-1">Export Saving</div>
                            <div class="text-lg md:text-xl font-bold text-emerald-600">RM ${formatCurrency(futureExportSaving)}</div>
                        </div>
                        <div>
                            <div class="text-[10px] uppercase tracking-wide tier-3 font-semibold mb-1">Actual EEI</div>
                            <div class="text-lg md:text-xl font-bold">RM ${formatCurrency(futureActualEei)}</div>
                        </div>
                        <div>
                            <div class="text-[10px] uppercase tracking-wide tier-3 font-semibold mb-1">EEI Saving</div>
                            <div class="text-lg md:text-xl font-bold text-emerald-600">RM ${formatCurrency(futureActualEeiSaving)}</div>
                        </div>
                        <div>
                            <div class="text-[10px] uppercase tracking-wide tier-3 font-semibold mb-1">Savings Change</div>
                            <div class="text-lg md:text-xl font-bold ${savingsDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}">${savingsDelta >= 0 ? '+' : '-'}RM ${formatCurrency(Math.abs(savingsDelta))}</div>
                        </div>
                    </div>
                    <div class="text-[10px] md:text-xs uppercase tracking-wide tier-3 font-semibold pt-2 border-t border-divider">
                        Future Payback: ${futureData?.paybackPeriod ?? 'N/A'} yr
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderFutureUsageSimulationSection(baseData) {
    const section = document.getElementById('futureUsageSimulationSection');
    if (!section) return;

    const baseUsageKwh = toFiniteNumber(baseData?.details?.monthlyUsageKwh, 0);
    const boostKwh = getFutureUsageBoostKwh();
    const projectedUsageKwh = getProjectedFutureUsageKwh(baseUsageKwh);

    section.innerHTML = `
        <div class="space-y-6 md:space-y-8">
            <div class="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h2 class="text-xs md:text-sm font-bold uppercase tracking-wide mb-2 md:mb-3 tier-2 border-b-2 border-fact inline-block pb-1">09_FUTURE_USAGE_STRESS_TEST</h2>
                    <p class="text-[10px] md:text-xs uppercase tracking-wide tier-3 font-semibold max-w-2xl">Toggle the 200 kWh blocks to simulate future household growth while keeping the current panels and battery fixed.</p>
                </div>
                <div class="text-[10px] md:text-xs uppercase tracking-wide tier-3 font-semibold text-right">
                    <div>Selected_Blocks: ${futureUsageBlocks.filter(Boolean).length} / 6</div>
                    <div>Usage_Bump: +${boostKwh.toLocaleString('en-MY')} kWh</div>
                </div>
            </div>

            <div class="flex flex-wrap gap-2">
                ${futureUsageBlocks.map((active, index) => `
                    <button
                        type="button"
                        onclick="toggleFutureUsageBlock(${index})"
                        class="min-w-[92px] border-2 px-3 py-2 text-left text-[10px] md:text-xs font-bold uppercase tracking-wide transition-colors ${active ? 'border-black bg-black text-white' : 'border-divider bg-white hover:bg-black hover:text-white'}"
                    >
                        <span class="block opacity-70">Block ${index + 1}</span>
                        <span class="block text-sm md:text-base leading-tight">+200 kWh</span>
                    </button>
                `).join('')}
            </div>

            <div id="futureUsageSimulationResult" class="border-t border-divider pt-6 md:pt-8">
                ${boostKwh > 0
                    ? `<div class="py-8 text-center text-[10px] md:text-xs font-bold uppercase tracking-widest animate-pulse tier-3">Recomputing_future_usage...</div>`
                    : `<div class="text-[10px] md:text-xs uppercase tracking-wide tier-3 font-semibold">No future usage blocks selected yet. Toggle one or more blocks to recalculate with the current system fixed.</div>`
                }
            </div>
        </div>
    `;
}

async function updateFutureUsageSimulation() {
    const resultEl = document.getElementById('futureUsageSimulationResult');
    if (!resultEl || !latestSolarData || !latestSolarParams) return;

    const boostKwh = getFutureUsageBoostKwh();
    const baseUsageKwh = toFiniteNumber(latestSolarData.details?.monthlyUsageKwh, 0);
    const projectedUsageKwh = getProjectedFutureUsageKwh(baseUsageKwh);

    if (boostKwh <= 0) {
        latestFutureUsageData = null;
        resultEl.innerHTML = `<div class="text-[10px] md:text-xs uppercase tracking-wide tier-3 font-semibold">No future usage blocks selected yet. Toggle one or more blocks to recalculate with the current system fixed.</div>`;
        return;
    }

    const requestSeq = ++_futureUsageRequestSeq;
    resultEl.innerHTML = `<div class="py-8 text-center text-[10px] md:text-xs font-bold uppercase tracking-widest animate-pulse tier-3">Recomputing_future_usage...</div>`;

    try {
        const futureParams = collectLiveSolarParams({
            batterySize: latestSolarParams.batterySize || 0,
            overridePanels: latestSolarData.actualPanels,
            futureUsageKwh: projectedUsageKwh,
            skipResidentialPanelGate: true
        });
        const result = await fetchSolarCalculation(futureParams);
        if (requestSeq !== _futureUsageRequestSeq) return;

        latestFutureUsageData = result;
        resultEl.innerHTML = renderFutureUsageResultCard(latestSolarData, result, projectedUsageKwh, boostKwh);
    } catch (err) {
        if (requestSeq !== _futureUsageRequestSeq) return;
        console.error('[Future Usage Simulation] Error:', err);
        resultEl.innerHTML = `<div class="py-6 text-center text-[10px] md:text-xs font-bold uppercase text-rose-600 border border-rose-300 p-4">[ Future Usage Error: ${err.message} ]</div>`;
    }
}

window.adjustBatterySize = function (delta) {
    if (!latestSolarParams) return;
    const currentIndex = getBatterySizeStepIndex(latestSolarParams.batterySize);
    const nextIndex = Math.max(0, Math.min(ALLOWED_BATTERY_SIZES.length - 1, currentIndex + delta));
    latestSolarParams.batterySize = ALLOWED_BATTERY_SIZES[nextIndex];
    clearTimeout(_spontaneousDebounceTimer);
    _spontaneousDebounceTimer = setTimeout(() => runAndDisplay(), 150);
};

window.setBatterySize = function (size) {
    if (!latestSolarParams) return;
    latestSolarParams.batterySize = normalizeBatterySize(size);
    clearTimeout(_spontaneousDebounceTimer);
    _spontaneousDebounceTimer = setTimeout(() => runAndDisplay(), 150);
};

window.setBatteryLossPercent = function (value) {
    if (!latestSolarParams) return;
    latestSolarParams.batteryLossPercent = normalizeBatteryLossPercent(value);
    clearTimeout(_spontaneousDebounceTimer);
    _spontaneousDebounceTimer = setTimeout(() => runAndDisplay(), 150);
};

window.setBatteryDodPercent = function (value) {
    if (!latestSolarParams) return;
    latestSolarParams.batteryDodPercent = normalizeBatteryDodPercent(value);
    clearTimeout(_spontaneousDebounceTimer);
    _spontaneousDebounceTimer = setTimeout(() => runAndDisplay(), 150);
};

window.setBillCycleMode = function (mode) {
    selectedBillCycleMode = normalizeBillCycleMode(mode);
    if (latestSolarData) {
        displaySolarCalculation(latestSolarData);
    }
};

window.toggleFutureUsageBlock = function (index) {
    if (!Number.isInteger(index) || index < 0 || index >= futureUsageBlocks.length) return;
    futureUsageBlocks[index] = !futureUsageBlocks[index];
    if (latestSolarData) {
        renderFutureUsageSimulationSection(latestSolarData);
        scheduleFutureUsageSimulation();
    }
};

window.adjustPanelCount = function (delta) {
    if (!latestSolarData) return;
    const gate = getResidentialPanelQuantityGate(latestSolarData);
    requestPanelUpdate(clampResidentialPanelQuantity(latestSolarData.actualPanels + delta, gate));
};

window.commitPanelInputChange = function (event) {
    const val = parseInt(event.target.value, 10);
    if (Number.isNaN(val)) {
        event.target.value = latestSolarData.actualPanels;
        return;
    }

    const clamped = clampResidentialPanelQuantity(val, latestSolarData);
    event.target.value = clamped;
    requestPanelUpdate(clamped);
};

window.syncAndTrigger = function (id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.value = value;
        triggerSpontaneousUpdate(id);
    }
};

window.generateInvoiceLink = async function () {
    if (!currentTariffData) {
        showNotification('Please complete Bill Analysis first.', 'error');
        return;
    }

    try {
        clearTimeout(_spontaneousDebounceTimer);

        const requestSeq = ++_solarRequestSeq;
        const freshParams = collectLiveSolarParams({
            batterySize: latestSolarParams?.batterySize || 0,
            overridePanels: latestSolarParams?.overridePanels
        });
        latestSolarParams = freshParams;

        const freshResult = await fetchSolarCalculation(freshParams);
        if (requestSeq !== _solarRequestSeq) return;
        latestSolarData = freshResult;
        displaySolarCalculation(freshResult);
    } catch (err) {
        console.error('[generateInvoiceLink] Failed to refresh latest calculation:', err);
        showNotification('Failed to refresh latest saving before creating quotation.', 'error');
        return;
    }

    if (!latestSolarData || !latestSolarData.selectedPackage || !latestSolarData.selectedPackage.linked_package) {
        showNotification('No valid package selected for quotation. Please ensure a package is matched.', 'error');
        return;
    }

    const params = new URLSearchParams();

    // Required
    params.set('linked_package', latestSolarData.selectedPackage.linked_package);

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
    if (latestSolarData.config?.systemPhase) params.set('system_phase', latestSolarData.config.systemPhase);
    if (latestSolarData.config?.inverterType) params.set('inverter_type', latestSolarData.config.inverterType);
    const selectedBatterySize = normalizeBatterySize(latestSolarData.config?.batterySize || latestSolarParams?.batterySize || 0);
    if (selectedBatterySize > 0) params.set('battery_size', selectedBatterySize);

    const billCycleModes = buildBillCycleMetrics(latestSolarData);
    const selectedCycleMetrics = billCycleModes[normalizeBillCycleMode(selectedBillCycleMode)] || billCycleModes.fullMonth;
    const estimatedPayableAfterSolar = selectedCycleMetrics?.payableAfterSolar ?? null;

    // Persist calculator savings metrics for downstream quotation/proposal usage.
    if (latestSolarData.details?.billBefore !== null && latestSolarData.details?.billBefore !== undefined) {
        params.set('customer_average_tnb', latestSolarData.details.billBefore);
    }
    if (selectedCycleMetrics && Number.isFinite(selectedCycleMetrics.totalSavings)) {
        params.set('estimated_saving', selectedCycleMetrics.totalSavings.toFixed(2));
    } else if (latestSolarData.monthlySavings !== null && latestSolarData.monthlySavings !== undefined) {
        params.set('estimated_saving', latestSolarData.monthlySavings);
    }
    if (estimatedPayableAfterSolar !== null) {
        params.set('estimated_new_bill_amount', estimatedPayableAfterSolar.toFixed(2));
    }
    if (latestSolarData.config?.sunPeakHour !== null && latestSolarData.config?.sunPeakHour !== undefined) {
        params.set('solar_sun_peak_hour', latestSolarData.config.sunPeakHour);
    }
    if (latestSolarData.config?.morningUsage !== null && latestSolarData.config?.morningUsage !== undefined) {
        params.set('solar_morning_usage_percent', latestSolarData.config.morningUsage);
    }

    window.location.assign(`${invoiceBaseUrl}?${params.toString()}`);
};

// --- UI Rendering ---

function displayBillBreakdown(data) {
    const resultsDiv = document.getElementById('calculatorResults');
    const tariff = data.tariff;
    const afaRate = data.afaRate || 0;
    const afaCharge = tariff.usage_kwh * afaRate;
    const adjustedTotal = tariff.bill_total_normal + afaCharge;

    resultsDiv.innerHTML = `
        <div class="space-y-10 md:space-y-16">
            <section class="pt-2">
                <h2 class="text-xs md:text-sm font-bold uppercase tracking-wide mb-6 md:mb-8 tier-2 border-b-2 border-fact inline-block pb-1">02_BILL_ANALYSIS_LEDGER</h2>
                <div class="space-y-3 text-sm md:text-base">
                    <div class="flex justify-between tier-3 uppercase text-[10px] md:text-xs tracking-wide mb-4 border-b border-divider pb-1.5"><span>Component</span><span>Value_(RM)</span></div>
                    ${['usage_normal', 'network', 'capacity', 'retail', 'eei', 'sst_normal', 'kwtbb_normal'].map(key => `
                        <div class="flex justify-between py-1.5 gap-4 border-b border-divider/50">
                            <span class="tier-2 truncate text-sm">${key.replace('_normal', '').toUpperCase()}</span>
                            <span class="tier-1 font-semibold whitespace-nowrap text-sm">${formatCurrency(tariff[key])}</span>
                        </div>
                    `).join('')}
                    <div class="flex justify-between py-1.5 gap-4 border-b border-divider/50">
                        <span class="tier-2 truncate text-sm">AFA_ADJUSTMENT</span>
                        <span class="${afaCharge < 0 ? 'text-emerald-600' : 'tier-1'} font-semibold whitespace-nowrap text-sm">${formatCurrency(afaCharge)}</span>
                    </div>
                    <div class="ledger-double-line pt-4 mt-5 flex justify-between items-baseline gap-4">
                        <span class="text-xs md:text-sm font-bold uppercase tracking-wide">Total_Matched</span>
                        <span class="text-2xl md:text-3xl font-bold tracking-tight whitespace-nowrap">RM ${formatCurrency(adjustedTotal)}</span>
                    </div>
                    <div class="mt-6 flex justify-between items-center text-[10px] md:text-xs tier-3 uppercase tracking-wide gap-4 border-t border-divider pt-3">
                        <span class="bg-yellow-100 px-3 py-1.5 rounded font-bold text-xs md:text-sm border-2 border-yellow-400">Derived_Usage: ${tariff.usage_kwh} kWh</span>
                        <span class="text-right">Tolerance: +/- 0.01%</span>
                    </div>
                </div>
            </section>

            <section id="solar-config-section" class="pt-2">
                <h2 class="text-xs md:text-sm font-bold uppercase tracking-wide mb-6 md:mb-8 tier-2 border-b-2 border-fact inline-block pb-1">03_MODELING_PARAMS</h2>
                <div class="grid gap-6 md:grid-cols-2 md:gap-x-8 md:gap-y-6">
                    ${renderInput('sunPeakHour', 'Sun_Peak_Hours', 'number', '3.4', '0.1', '3.0', '4.5')}
                    ${renderInput('morningUsage', 'Day_Usage_Share (%)', 'number', '30', '1', '1', '100')}
                    ${renderInput('panelRating', 'Panel_Rating (W)', 'number', '650', '1', '450', '850')}
                    ${renderInput('afaRate', 'AFA_Projection (RM)', 'number', '0.0000', '0.0001')}
                    ${renderInput('smpPrice', 'Export_Rate (RM)', 'number', '0.2703', '0.0001', '0.19', '0.2703')}
                    <div class="md:col-span-2 mt-2">
                        <div class="p-5 md:p-6 border-2 border-divider bg-white/30">
                            <h4 class="text-[10px] md:text-xs font-bold uppercase tracking-wide tier-3 mb-5 md:mb-6 border-b border-divider pb-1.5 inline-block">Discount_Protocol</h4>
                            <div class="grid gap-5 md:grid-cols-2 md:gap-6">
                                ${renderInput('percentDiscount', 'Percentage (%)', 'number', '0', '0.01', '0', '100')}
                                ${renderInput('fixedDiscount', 'Fixed (RM)', 'number', '0', '0.01', '0')}
                            </div>
                        </div>
                    </div>
                    <div class="md:col-span-2 pt-2 flex flex-col sm:flex-row gap-3">
                        <button onclick="calculateSolarSavings()" class="text-xs md:text-sm font-bold uppercase tracking-wide border-2 border-fact px-8 py-3 md:px-10 md:py-3.5 hover:bg-black hover:text-white transition-all w-full sm:w-auto shadow-[3px_3px_0px_0px_rgba(0,0,0,0.1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]">Generate_ROI_Matrix -></button>
                    </div>
                </div>
            </section>
        </div>
    `;
    // Trigger initial EPP calculation to populate defaults
    setTimeout(() => {
        // Trigger change event on bank to populate tenure
        const bankSelect = document.getElementById('eppBank');
        if (bankSelect) {
            bankSelect.dispatchEvent(new Event('change'));
        }
    }, 0);
}

function renderInput(id, label, type, val, step, min, max) {
    return `
        <div class="space-y-2.5">
            <label class="block text-[10px] md:text-xs uppercase tracking-wide tier-3 font-semibold">${label}</label>
            <div class="border-b-2 border-divider focus-within:border-fact transition-colors pb-1.5">
                <input type="${type}" id="${id}" step="${step}" ${min ? `min="${min}"` : ''} ${max ? `max="${max}"` : ''} value="${val}" oninput="triggerSpontaneousUpdate('${id}')" onchange="triggerSpontaneousUpdate('${id}')" class="w-full text-lg md:text-xl font-bold bg-transparent border-none outline-none py-1">
            </div>
        </div>
    `;
}

function buildBatteryTuningControl({ id, label, value, min, max, sajValue, onInput, helper }) {
    const markerPercent = ((sajValue - min) / (max - min)) * 100;
    return `
        <div class="space-y-2">
            <div class="flex items-center justify-between gap-4">
                <span class="text-[10px] md:text-xs uppercase tracking-wide tier-3 font-semibold">${label}</span>
                <span class="text-sm md:text-base font-bold">${value}%</span>
            </div>
            <input
                type="range"
                id="${id}"
                min="${min}"
                max="${max}"
                step="1"
                value="${value}"
                oninput="${onInput}(this.value)"
                class="w-full accent-black"
            >
            <div class="relative pt-4">
                <span class="absolute top-0 -translate-x-1/2 text-[9px] md:text-[10px] font-semibold tier-3" style="left:${markerPercent}%;">SAJ's Battery</span>
                <div class="flex justify-between text-[9px] md:text-[10px] uppercase tracking-wide tier-3">
                    <span>${min}%</span>
                    <span>${max}%</span>
                </div>
            </div>
            <p class="text-[9px] md:text-[10px] opacity-70">${helper}</p>
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
    const batteryMiniReport = ds.battery.miniReport || ds.miniReport || {
        monthlySolarSentToChargeBatteryKwh: ds.battery?.monthlySolarToBatteryInputKwh || 0,
        monthlyBatteryStoredAndDischargedKwh: ds.battery?.monthlyStoredKwh || 0,
        newBillAfterSolarBattery: ds.billAfter || 0,
        newExportKwh: ds.exportKwh || 0,
        newActualEei: ds.actualEei || 0
    };
    const batteryLossPercent = normalizeBatteryLossPercent(data.config?.batteryLossPercent ?? latestSolarParams?.batteryLossPercent);
    const batteryDodPercent = normalizeBatteryDodPercent(data.config?.batteryDodPercent ?? latestSolarParams?.batteryDodPercent);
    const billCycleModes = buildBillCycleMetrics(data);
    const activeBillCycleMode = normalizeBillCycleMode(selectedBillCycleMode);
    const cycleMetrics = billCycleModes[activeBillCycleMode] || billCycleModes.fullMonth;
    const billBreakdownItems = buildBillBreakdownItemsForMode(data, cycleMetrics);

    solarDiv.innerHTML = `
        <div class="space-y-10 md:space-y-16">
            <section class="bg-black text-white p-6 md:p-8 -mx-4 md:-mx-6 shadow-xl">
                <h2 class="text-[10px] md:text-xs font-bold uppercase tracking-wide mb-6 md:mb-8 opacity-70 border-b border-white/20 pb-1.5 inline-block">ROI_EXECUTIVE_SUMMARY</h2>
                <div class="space-y-6 text-sm md:text-base">
                    <div class="flex flex-col sm:flex-row justify-between gap-3 text-right sm:text-left">
                        <div><p class="opacity-70 text-[10px] md:text-xs tracking-wide uppercase">Original_Bill</p><p class="font-bold text-base md:text-lg">RM ${formatCurrency(ds.billBefore)}</p></div>
                        <div class="sm:text-right"><p class="opacity-70 text-[10px] md:text-xs tracking-wide uppercase">System_Size</p><p class="font-bold text-base md:text-lg">${((data.actualPanels * data.config.panelType) / 1000).toFixed(2)} kWp</p></div>
                    </div>
                    <div class="h-px bg-white/20"></div>
                    <div class="flex flex-wrap justify-end gap-2">
                        <button onclick="setBillCycleMode('fullMonth')" class="border px-3 py-1.5 text-[10px] md:text-xs font-bold uppercase tracking-wide transition-colors ${activeBillCycleMode === 'fullMonth' ? 'bg-white text-black border-white' : 'bg-transparent text-white border-white/40 hover:border-white hover:bg-white/10'}">Full Month Bill Cycle</button>
                        <button onclick="setBillCycleMode('under28Days')" class="border px-3 py-1.5 text-[10px] md:text-xs font-bold uppercase tracking-wide transition-colors ${activeBillCycleMode === 'under28Days' ? 'bg-white text-black border-white' : 'bg-transparent text-white border-white/40 hover:border-white hover:bg-white/10'}">&lt;28 Days Bill Cycle</button>
                    </div>
                    <div class="space-y-4">
                        <div class="flex justify-between items-baseline text-sm md:text-base"><span>New_Monthly_Bill:</span><span class="font-bold">RM ${formatCurrency(cycleMetrics.billAfter)}</span></div>
                        <div class="text-sm md:text-base">
                            <div class="flex justify-between items-baseline"><span>Bill_Reduction:</span><span class="font-bold">RM ${formatCurrency(cycleMetrics.billReduction)}</span></div>
                            <div class="text-[10px] md:text-xs opacity-60 mt-0.5 text-right">excluding EEI subsidy, total import ${parseFloat(ds.netUsageKwh).toLocaleString('en-MY', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh</div>
                        </div>
                        <div class="text-sm md:text-base">
                            <div class="flex justify-between items-baseline"><span>Actual_EEI_Saving:</span><span class="font-bold">RM ${formatCurrency(ds.actualEeiSaving)}</span></div>
                            <div class="text-[10px] md:text-xs opacity-60 mt-0.5 text-right">actual usage ${parseFloat(ds.actualUsageForEeiKwh).toLocaleString('en-MY', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh -> EEI ${formatCurrency(ds.actualEei)}</div>
                        </div>
                        <div class="text-sm md:text-base">
                            <div class="flex justify-between items-baseline"><span>Export_Savings:</span><span class="font-bold">RM ${formatCurrency(ds.exportSaving)}</span></div>
                            <div class="text-[10px] md:text-xs opacity-60 mt-0.5 text-right space-y-1">
                                <div>exported ${parseFloat(ds.exportKwh).toLocaleString('en-MY', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh @ RM${parseFloat(ds.effectiveExportRate).toFixed(4)}</div>
                                ${parseFloat(ds.backupGenerationKwh) > 0 ? `
                                <div class="flex flex-col items-end">
                                    <div class="text-[#FFD700] font-bold">RM ${formatCurrency(ds.backupGenerationSaving)}</div>
                                    <div class="text-emerald-500 font-semibold text-[9px]">
                                        + ${parseFloat(ds.backupGenerationKwh).toLocaleString('en-MY', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh BACKUP_GENERATION
                                        <span class="block text-[8px] opacity-80 uppercase font-normal">(Weather Buffer: Protected against low sun peak days)</span>
                                    </div>
                                </div>` : ''}
                                ${parseFloat(ds.donatedKwh) > 0 ? `<div class="text-rose-400 font-semibold">⚠ ${parseFloat(ds.donatedKwh).toLocaleString('en-MY', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh Donated to Grid (Capped by limit)</div>` : ''}
                            </div>
                        </div>
                        
                        <div class="pt-4 mt-4 border-t border-white/10 space-y-3">
                            <div class="flex justify-between items-baseline text-sm md:text-base text-emerald-400"><span>Net_Monthly_Savings:</span><span class="font-bold">RM ${formatCurrency(cycleMetrics.totalSavings)}</span></div>
                            <div class="text-[9px] md:text-[10px] opacity-60 text-right italic">(Bill Reduction RM ${formatCurrency(cycleMetrics.billReduction)} + Actual EEI Saving RM ${formatCurrency(ds.actualEeiSaving)} + Export Income RM ${formatCurrency(ds.exportSaving)})</div>
                            <div class="flex justify-between items-baseline text-lg md:text-xl text-white pt-2 border-t border-white/20">
                                <span class="text-[10px] md:text-xs font-bold uppercase tracking-wide opacity-80">Estimated_Payable_After_Solar:</span>
                                <span class="font-bold">RM ${formatCurrency(cycleMetrics.payableAfterSolar)}</span>
                            </div>
                            <div class="text-[9px] md:text-[10px] opacity-60 text-right italic">(TNB Bill RM ${formatCurrency(cycleMetrics.billAfter)} - Export Income RM ${formatCurrency(ds.exportSaving)})</div>
                            ${activeBillCycleMode === 'under28Days' ? `<div class="text-[9px] md:text-[10px] opacity-60 text-right italic">(SST adjusted: current RM ${formatCurrency(cycleMetrics.currentSst)} -> new RM ${formatCurrency(cycleMetrics.recalculatedSst)} based on 8% of Usage + Network + Capacity)</div>` : ''}
                        </div>

                        <div class="flex justify-between items-baseline text-sm md:text-base text-orange-400"><span>Confidence_Level:</span><span class="font-bold">${data.confidenceLevel}%</span></div>
                        ${data.requiresSedaFee ? `
                        <div class="pt-3 mt-3 border-t border-white/20">
                            <div class="bg-yellow-500/20 border border-yellow-500/50 p-3 rounded">
                                <div class="text-[10px] md:text-xs font-bold uppercase tracking-wide text-yellow-300 mb-1">⚠ SEDA Registration Fee Required</div>
                                <div class="text-xs md:text-sm text-yellow-200">RM 1,000 Oversize Registration Fee by SEDA required for systems >= ${data.config.systemPhase == 1 ? 5.01 : 15.01}kW Inverter output (${data.config.systemPhase}-phase)</div>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                    <div class="pt-6 border-t border-white/40 flex justify-between items-baseline">
                        <span class="text-[10px] md:text-xs font-bold uppercase tracking-wide text-white/70">Total_Savings (Inc. Export) [${cycleMetrics.label}]:</span>
                        <span class="text-3xl md:text-4xl font-bold tracking-tight text-emerald-400">RM ${formatCurrency(cycleMetrics.totalSavings)}</span>
                    </div>
                </div>
            </section>

            <div class="flex justify-center -mt-6 mb-6 relative z-10">
                 <button onclick="generateInvoiceLink()" class="bg-white text-black font-bold uppercase tracking-wide text-xs md:text-sm px-6 py-3 md:px-8 md:py-3.5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all border-2 border-black flex items-center gap-2">
                    <span class="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                    Create_Quotation_Link
                 </button>
            </div>

            <section class="pt-2 border-y-2 border-fact py-6 md:py-8">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                    <div><span class="text-[10px] md:text-xs uppercase tracking-wide tier-3 font-semibold block mb-1">ROI_Percent</span><div class="text-2xl md:text-3xl font-bold text-emerald-600">${formatPercentage((data.monthlySavings * 12 / data.finalSystemCost) * 100, 2)}%</div></div>
                    <div><span class="text-[10px] md:text-xs uppercase tracking-wide tier-3 font-semibold block mb-1">Payback</span><div class="text-2xl md:text-3xl font-bold">${data.paybackPeriod} yr</div></div>
                    <div><span class="text-[10px] md:text-xs uppercase tracking-wide tier-3 font-semibold block mb-1">Net_Cost</span><div class="text-2xl md:text-3xl font-bold">RM ${formatCurrency(data.finalSystemCost)}</div></div>
                </div>

                <!-- EPP Calculator Section -->
                <div class="mt-8 pt-6 border-t border-divider bg-gray-50/50 p-4 -mx-4 md:rounded-lg md:mx-0">
                    <h4 class="text-[10px] md:text-xs font-bold uppercase tracking-wide tier-3 mb-4">Estimated_Monthly_Installment</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                        <div class="space-y-4">
                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-[9px] uppercase tracking-wide text-gray-500 mb-1">Bank</label>
                                    <select id="eppBank" onchange="updateEPPCalculation(event)" class="w-full text-sm font-semibold bg-white border border-gray-300 rounded px-2 py-1.5 focus:border-black outline-none">
                                        ${Object.keys(EPP_RATES).map(b => `<option value="${b}">${b}</option>`).join('')}
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-[9px] uppercase tracking-wide text-gray-500 mb-1">Tenure</label>
                                    <select id="eppTenure" onchange="updateEPPCalculation(event)" class="w-full text-sm font-semibold bg-white border border-gray-300 rounded px-2 py-1.5 focus:border-black outline-none">
                                        <!-- Populated by JS -->
                                    </select>
                                </div>
                            </div>
                            <div id="eppNote" class="text-[10px] bg-yellow-50 border border-yellow-200 p-2 rounded text-yellow-800 leading-tight"></div>
                        </div>
                        <div class="bg-white border border-gray-200 rounded p-3 flex flex-col justify-between h-full">
                            <div class="flex justify-between items-baseline mb-2 pb-2 border-b border-gray-100">
                                <span class="text-[10px] uppercase tracking-wide text-gray-500">Monthly_Payment</span>
                                <span id="eppResult" class="text-lg font-bold text-black">RM 0.00</span>
                            </div>
                            <div id="eppFee" class="text-[10px] space-y-1 mb-2"></div>
                            <div id="eppNet" class="text-[10px] pt-2 border-t border-gray-100 flex justify-between items-center"></div>
                        </div>
                    </div>
                </div>

                ${data.requiresSedaFee ? `
                <div class="mt-6 pt-6 border-t border-divider">
                    <div class="bg-yellow-50 border-2 border-yellow-500 p-4 rounded">
                        <div class="text-[10px] md:text-xs font-bold uppercase tracking-wide text-yellow-800 mb-2">⚠ SEDA Oversize Registration Fee</div>
                        <div class="text-xs md:text-sm text-yellow-900">RM 1,000 Oversize Registration Fee by SEDA required for systems >= ${data.config.systemPhase == 1 ? 5.01 : 15.01}kW Inverter output (System: ${data.systemSizeKwp} kWp, ${data.config.systemPhase}-Phase)</div>
                    </div>
                </div>
                ` : ''}
            </section>

            <section class="pt-2">
                <h2 class="text-xs md:text-sm font-bold uppercase tracking-wide mb-6 md:mb-8 tier-2 border-b-2 border-fact inline-block pb-1">07_SAVINGS_LEDGER</h2>
                ${activeBillCycleMode === 'under28Days' ? `<div class="mb-4 text-[10px] md:text-xs uppercase tracking-wide tier-3">SST row updated for &lt;28 Days Bill Cycle at 8% of Usage + Network + Capacity.</div>` : ''}
                <div class="space-y-3">
                    <div class="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-3 md:gap-4 tier-3 uppercase text-[10px] md:text-xs tracking-wide pb-3 border-b border-divider"><span>Component</span><span class="text-right">Before</span><span class="text-right">After</span><span class="text-right">Delta</span></div>
                    ${billBreakdownItems.map(i => `
                        <div class="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-3 md:gap-4 py-1.5 border-b border-divider/50 text-sm">
                            <span class="tier-2 uppercase tracking-tight">${i.label}</span>
                            <span class="text-right">${formatCurrency(i.before)}</span>
                            <span class="text-right">${formatCurrency(i.after)}</span>
                            <span class="text-right font-bold ${i.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}">${i.delta >= 0 ? '-' : '+'}${formatCurrency(Math.abs(i.delta))}</span>
                        </div>
                    `).join('')}
                </div>
            </section>

            ${normalizeBatterySize(data.config.batterySize) > 0 ? `
                <section class="pt-8 md:pt-10 border-t border-divider">
                    <h2 class="text-xs md:text-sm font-bold uppercase tracking-wide mb-6 md:mb-8 tier-2 border-b-2 border-fact inline-block pb-1">08_BATTERY_STORAGE</h2>
                    <div class="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 lg:gap-10 items-start">
                        <div class="space-y-3">
                            <div class="flex flex-wrap gap-2">
                                ${ALLOWED_BATTERY_SIZES.map((size) => `
                                    <button
                                        onclick="setBatterySize(${size})"
                                        class="min-w-[60px] border-2 px-3 py-2 text-xs md:text-sm font-bold transition-colors ${normalizeBatterySize(data.config.batterySize) === size ? 'border-black bg-black text-white' : 'border-fact bg-white hover:bg-black hover:text-white'}"
                                    >
                                        ${size} kWh
                                    </button>
                                `).join('')}
                            </div>
                            <p class="text-[10px] md:text-xs uppercase tier-3 font-semibold">Battery limited to 16 kWh modules, max 3 units.</p>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                ${buildBatteryTuningControl({
                                    id: 'batteryLossPercent',
                                    label: 'Charge_Discharge_Loss',
                                    value: batteryLossPercent,
                                    min: 0,
                                    max: 20,
                                    sajValue: 8,
                                    onInput: 'setBatteryLossPercent',
                                    helper: 'Loss reduces the usable battery energy before savings are calculated.'
                                })}
                                ${buildBatteryTuningControl({
                                    id: 'batteryDodPercent',
                                    label: 'Depth_of_Discharge_(DoD)',
                                    value: batteryDodPercent,
                                    min: 0,
                                    max: 10,
                                    sajValue: 5,
                                    onInput: 'setBatteryDodPercent',
                                    helper: 'DoD reserves part of the nominal battery size, so only the remaining capacity can be used.'
                                })}
                            </div>
                        </div>
                        <div class="space-y-2 text-sm md:text-base min-w-[240px]">
                            <div class="flex justify-between gap-4"><span class="uppercase tracking-wide tier-3">Non_Offset_Solar</span><span class="font-bold">${formatCurrency(parseFloat(data.details.battery?.nonOffsetSolarKwh || 0))} kWh/mo</span></div>
                            <div class="flex justify-between gap-4"><span class="uppercase tracking-wide tier-3">Daily Non_Offset_Solar</span><span class="font-bold">${formatCurrency(parseFloat(data.details.battery?.dailyNonOffsetSolarKwh || 0))} kWh/day</span></div>
                            <div class="flex justify-between gap-4"><span class="uppercase tracking-wide tier-3">Usable_Capacity</span><span class="font-bold">${formatCurrency(parseFloat(data.details.battery?.usableCapacityKwh || 0))} kWh/day</span></div>
                            <div class="flex justify-between gap-4"><span class="uppercase tracking-wide tier-3">Battery_Stored</span><span class="font-bold">${formatCurrency(parseFloat(data.details.battery?.monthlyStoredKwh || 0))} kWh/mo</span></div>
                            <div class="flex justify-between gap-4"><span class="uppercase tracking-wide tier-3">Excess_Export</span><span class="font-bold">${formatCurrency(parseFloat(data.details.battery?.monthlyExcessExportKwh || 0))} kWh/mo</span></div>
                            <div class="mt-4 p-3 border border-divider bg-white/70 rounded-sm space-y-2">
                                <div class="text-[10px] md:text-xs uppercase tracking-wide tier-3 font-semibold">Mini Battery Report</div>
                                <div class="space-y-1 text-[10px] md:text-xs">
                                    <div class="flex justify-between gap-4"><span>Monthly Solar sent to charge battery</span><span class="font-bold">${formatQuantity(batteryMiniReport.monthlySolarSentToChargeBatteryKwh)} kWh/mo</span></div>
                                    <div class="flex justify-between gap-4"><span>Monthly Battery stored and discharged</span><span class="font-bold">${formatQuantity(batteryMiniReport.monthlyBatteryStoredAndDischargedKwh)} kWh/mo</span></div>
                                    <div class="flex justify-between gap-4"><span>New Bill After Solar+Battery</span><span class="font-bold">RM ${formatCurrency(batteryMiniReport.newBillAfterSolarBattery)}</span></div>
                                    <div class="flex justify-between gap-4"><span>New Export</span><span class="font-bold">${formatQuantity(batteryMiniReport.newExportKwh)} kWh/mo</span></div>
                                    <div class="flex justify-between gap-4"><span>New Actual EEI</span><span class="font-bold">RM ${formatCurrency(batteryMiniReport.newActualEei)}</span></div>
                                </div>
                                <p class="text-[9px] md:text-[10px] opacity-70">Battery uses ${(Math.max(0, (data.details.battery?.chargeEfficiency ?? 0)) * 100).toFixed(1)}% charge efficiency and ${(Math.max(0, (data.details.battery?.dischargeEfficiency ?? 0)) * 100).toFixed(1)}% discharge efficiency from a ${batteryLossPercent}% round-trip loss.</p>
                            </div>
                            <div class="flex justify-between gap-4 pt-2 border-t border-divider">
                                <span class="uppercase tracking-wide tier-3 font-semibold">Value_Add</span>
                                <span class="text-xl md:text-2xl font-bold text-emerald-600">+RM ${formatCurrency(parseFloat(data.details.battery?.valueAddMonthly ?? (parseFloat(data.monthlySavings) - parseFloat(b.totalSavings))))} / mo</span>
                            </div>
                            <p class="text-[10px] md:text-xs opacity-70">This simulation treats ${batteryLossPercent}% as round-trip loss split symmetrically across charging and discharging, with ${batteryDodPercent}% reserved as DoD.</p>
                        </div>
                    </div>
                </section>
            ` : `<div class="text-center pt-4"><button onclick="setBatterySize(16)" class="text-[10px] md:text-xs uppercase tracking-wide underline font-semibold tier-3 hover:tier-1">[+] Simulate_Battery_Storage_16kWh</button></div>`}

            <section id="futureUsageSimulationSection" class="pt-8 md:pt-10 border-t border-divider"></section>
        </div>
    `;

    renderFloatingPanelModulation(data);
    renderFutureUsageSimulationSection(data);
    scheduleFutureUsageSimulation();
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
    const panelGate = getResidentialPanelQuantityGate(data);
    const panelMinReached = data.actualPanels <= panelGate.min;
    const panelMaxReached = data.actualPanels >= panelGate.max;

    // Minimalist "Pill" Design
    bar.innerHTML = `
        <div class="bg-paper border-2 border-fact shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] pointer-events-auto flex items-center gap-3 px-3 py-2">
            
            <!-- Sun Peak -->
            <div class="flex items-center gap-1">
                <span class="text-[8px] md:text-[9px] font-semibold uppercase tracking-wide tier-3">Sun</span>
                <div class="flex items-center bg-white border border-fact">
                    <button onclick="syncAndTrigger('sunPeakHour', (parseFloat(${data.config.sunPeakHour}) - 0.1).toFixed(1))" class="w-5 h-5 hover:bg-black hover:text-white transition-colors text-[10px] md:text-xs font-bold flex items-center justify-center">-</button>
                    <span class="w-7 md:w-8 text-center font-bold text-[10px] md:text-xs leading-none">${data.config.sunPeakHour}</span>
                    <button onclick="syncAndTrigger('sunPeakHour', (parseFloat(${data.config.sunPeakHour}) + 0.1).toFixed(1))" class="w-5 h-5 hover:bg-black hover:text-white transition-colors text-[10px] md:text-xs font-bold flex items-center justify-center">+</button>
                </div>
            </div>

            <div class="h-4 w-px bg-divider"></div>

            <!-- Morning Usage -->
            <div class="flex items-center gap-1">
                <span class="text-[8px] md:text-[9px] font-semibold uppercase tracking-wide tier-3">Use</span>
                <div class="flex items-center bg-white border border-fact">
                    <button onclick="syncAndTrigger('morningUsage', Math.max(1, ${data.config.morningUsage} - 5))" class="w-5 h-5 hover:bg-black hover:text-white transition-colors text-[10px] md:text-xs font-bold flex items-center justify-center">-</button>
                    <span class="w-7 md:w-8 text-center font-bold text-[10px] md:text-xs leading-none">${data.config.morningUsage}%</span>
                    <button onclick="syncAndTrigger('morningUsage', Math.min(100, ${data.config.morningUsage} + 5))" class="w-5 h-5 hover:bg-black hover:text-white transition-colors text-[10px] md:text-xs font-bold flex items-center justify-center">+</button>
                </div>
            </div>

            <div class="h-4 w-px bg-divider"></div>

            <!-- Panels -->
            <div class="flex items-center gap-1">
                <div class="flex flex-col items-end leading-none">
                    <span class="text-[8px] md:text-[9px] font-semibold uppercase tracking-wide tier-3">Panel</span>
                    <span class="text-[8px] md:text-[9px] font-semibold uppercase tracking-wide tier-3">Gate ${panelGate.min}-${panelGate.max}</span>
                    ${Math.abs(delta) > 1 ? `<span class="text-[8px] md:text-[9px] font-bold ${delta > 0 ? 'text-rose-600' : 'text-emerald-600'}">${delta > 0 ? '+' : '-'}RM${Math.round(Math.abs(delta)).toLocaleString('en-MY')}</span>` : ''}
                </div>
                <div class="flex items-center bg-white border border-fact">
                    <button onclick="adjustPanelCount(-1)" ${panelMinReached ? 'disabled' : ''} class="w-5 h-5 md:w-6 md:h-6 hover:bg-black hover:text-white transition-colors text-[10px] md:text-xs font-bold flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed">-</button>
                    <input type="number" min="${panelGate.min}" max="${panelGate.max}" step="1" value="${data.actualPanels}" onchange="commitPanelInputChange(event)" class="w-7 md:w-8 text-center font-bold text-[10px] md:text-xs border-none bg-transparent outline-none p-0 appearance-none leading-none">
                    <button onclick="adjustPanelCount(1)" ${panelMaxReached ? 'disabled' : ''} class="w-5 h-5 md:w-6 md:h-6 hover:bg-black hover:text-white transition-colors text-[10px] md:text-xs font-bold flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed">+</button>
                </div>
            </div>

        </div>
    `;
}

// --- Utils & Charts ---

function formatCurrency(v) { return Number(v || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatQuantity(v, d = 2) { return Number(v || 0).toLocaleString('en-MY', { minimumFractionDigits: d, maximumFractionDigits: d }); }
function formatPercentage(v, d = 1) { return Number(v || 0).toFixed(d); }
function showNotification(m, t = 'info') {
    const n = document.createElement('div');
    n.className = `fixed bottom-6 right-4 md:bottom-8 md:right-8 border p-3 md:p-4 z-[10001] text-[10px] md:text-xs uppercase font-semibold shadow-lg max-w-[calc(100vw-2rem)] ${t === 'error' ? 'border-rose-600 bg-rose-50' : 'border-fact bg-paper'}`;
    n.innerHTML = `<div class="flex items-center gap-4 md:gap-8"><span>[ ${m} ]</span><button onclick="this.parentElement.parentElement.remove()" class="font-bold hover:opacity-70">X</button></div>`;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 5000);
}

function showPanelRecommendationPopup(data) {
    const systemSizeKwp = (data.recommendedPanels * (data.config.panelType || 650)) / 1000;
    const systemPhase = data.config.systemPhase || 3;
    const sedaLimit = systemPhase == 1 ? 5 : 15;
    const requiresSedaFee = systemSizeKwp > sedaLimit;

    const p = document.createElement('div');
    p.className = 'fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm overflow-y-auto';
    p.innerHTML = `
        <div class="min-h-full flex items-center justify-center p-4">
            <div class="w-full max-w-lg border border-fact bg-paper p-6 md:p-8 shadow-xl space-y-6 md:space-y-8 text-center my-auto">
                <div class="text-[10px] md:text-xs font-bold uppercase tracking-wide">SYSTEM_RECOMMENDATION</div>
                <div class="text-4xl md:text-5xl font-bold tracking-tight">${data.recommendedPanels}</div>
                <div class="text-[10px] md:text-xs uppercase tier-3">Recommended_Panel_Units (${systemSizeKwp.toFixed(2)} kWp)</div>
                
                ${requiresSedaFee ? `
                <div class="bg-rose-50 border-2 border-rose-600 p-4 rounded text-left">
                    <div class="text-[10px] font-bold text-rose-600 uppercase mb-1">⚠ SEDA NOTICE</div>
                    <div class="text-xs font-bold text-rose-900 leading-tight">RM 1,000 Oversize Registration Fee Required.</div>
                    <div class="text-[10px] text-rose-800 mt-1">This recommended system (${systemSizeKwp.toFixed(1)} kWp) requires SEDA fee (${sedaLimit}kW Inverter output limit for ${systemPhase}-phase).</div>
                </div>
                ` : ''}

                <div class="text-[9px] md:text-[10px] tier-3 uppercase border-y border-divider py-3 md:py-4">Basis: ${data.details.monthlyUsageKwh}kWh/mo @ ${data.config.sunPeakHour}h Peak Sun</div>
                ${data.selectedPackage ? `<div class="p-3 md:p-4 bg-black text-white text-left"><div class="text-[9px] md:text-[10px] opacity-70">SELECTED_PACKAGE</div><div class="font-bold text-sm md:text-base">${data.selectedPackage.packageName}</div><div class="text-[9px] md:text-[10px] opacity-70">RM ${formatCurrency(data.selectedPackage.price)}</div></div>` : ''}
                <button onclick="this.closest('.fixed').remove()" class="w-full bg-black text-white py-3 md:py-4 text-[10px] md:text-xs font-bold uppercase tracking-wide">View_Full_Report</button>
            </div>
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
        data: { labels: d.electricityUsagePattern.map(p => p.hour + ':00'), datasets: [{ data: d.electricityUsagePattern.map(p => p.usage), borderColor: '#f59e0b', fill: true, tension: 0.4 }] },
        options: commonOpts
    });

    const net = d.electricityUsagePattern.map((u, i) => Math.max(0, u.usage - d.solarGenerationPattern[i].generation).toFixed(3));
    chartInstances.combined = new Chart(ctx2, {
        type: 'line',
        data: {
            labels: d.electricityUsagePattern.map(p => p.hour + ':00'),
            datasets: [
                { label: 'Original', data: d.electricityUsagePattern.map(p => p.usage), borderColor: '#f59e0b', tension: 0.4 },
                { label: 'Solar', data: d.solarGenerationPattern.map(p => p.generation), borderColor: '#10b981', tension: 0.4 },
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
