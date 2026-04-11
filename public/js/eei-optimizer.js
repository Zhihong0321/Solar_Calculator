const state = {
  suggestedMaxPanelQty: 1,
  sliderMax: 20,
  currentPanelQty: 1,
  latestPayload: null,
  debounceTimer: null
};

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatKwh(value) {
  return Number(value || 0).toLocaleString('en-MY', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
}

function setStatus(text, tone = 'neutral') {
  const statusChip = document.getElementById('statusChip');
  if (!statusChip) {
    return;
  }

  const classes = {
    neutral: 'bg-slate-100 text-slate-600',
    loading: 'bg-amber-100 text-amber-700',
    success: 'bg-emerald-100 text-emerald-700',
    error: 'bg-rose-100 text-rose-700'
  };

  statusChip.className = `rounded-full px-3 py-1 text-[10px] uppercase tracking-wide font-semibold ${classes[tone] || classes.neutral}`;
  statusChip.textContent = text;

  const mobileDockStatus = document.getElementById('mobileDockStatus');
  if (mobileDockStatus) {
    mobileDockStatus.textContent = text;
  }
}

async function fetchOptimizer(params) {
  const query = new URLSearchParams(params);
  const response = await fetch(`/api/eei-optimizer/calculate?${query.toString()}`);

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || err.details || `Server error ${response.status}`);
  }

  return response.json();
}

function syncSuggestion(data) {
  const suggestedMaxPanelQty = Number(data?.suggestion?.suggestedMaxPanelQty || 0);
  const sliderMax = Number(data?.suggestion?.sliderMax || 20);
  const startPanelQty = Number(data?.suggestion?.suggestedPanelQty || (suggestedMaxPanelQty > 0 ? suggestedMaxPanelQty : 1));

  state.suggestedMaxPanelQty = suggestedMaxPanelQty;
  state.sliderMax = sliderMax;
  state.currentPanelQty = Math.max(1, startPanelQty);

  const slider = document.getElementById('panelQtySlider');
  if (slider) {
    slider.min = '1';
    slider.max = String(sliderMax);
    slider.value = String(state.currentPanelQty);
  }

  const suggestedQty = document.getElementById('suggestedQty');
  if (suggestedQty) {
    suggestedQty.textContent = String(suggestedMaxPanelQty);
  }

  const suggestedMaxCopy = document.getElementById('suggestedMaxCopy');
  if (suggestedMaxCopy) {
    suggestedMaxCopy.textContent = String(suggestedMaxPanelQty);
  }

  const panelQtyHint = document.getElementById('panelQtyHint');
  if (panelQtyHint) {
    panelQtyHint.textContent = `Slider starts at ${state.currentPanelQty} and can test up to ${sliderMax}.`;
  }

  const mobileDockQty = document.getElementById('mobileDockQty');
  if (mobileDockQty) {
    mobileDockQty.textContent = `Qty ${state.currentPanelQty}`;
  }
}

function renderReport(data) {
  const report = data?.report || {};
  const solar = data?.solar || {};
  const original = data?.original || {};

  const originalBill = document.getElementById('originalBill');
  const originalEei = document.getElementById('originalEei');
  const billAfterSolarAmount = document.getElementById('billAfterSolarAmount');
  const billAfterSolarAmountHint = document.getElementById('billAfterSolarAmountHint');
  const billAfterSolarEei = document.getElementById('billAfterSolarEei');
  const billAfterSolarEeiHint = document.getElementById('billAfterSolarEeiHint');
  const totalExportKwhHint = document.getElementById('totalExportKwhHint');
  const exportEarning = document.getElementById('exportEarning');
  const actualEeiAfterDeductExport = document.getElementById('actualEeiAfterDeductExport');
  const netImportHint = document.getElementById('netImportHint');
  const currentPanelQtyValue = document.getElementById('currentPanelQtyValue');
  const solarGenerationValue = document.getElementById('solarGenerationValue');
  const morningOffsetValue = document.getElementById('morningOffsetValue');
  const eeiStatusValue = document.getElementById('eeiStatusValue');
  const netImportValue = document.getElementById('netImportValue');
  const sliderValue = document.getElementById('sliderValue');
  const mobileDockNetImport = document.getElementById('mobileDockNetImport');
  const mobileDockEei = document.getElementById('mobileDockEei');

  if (originalBill) originalBill.textContent = `RM ${formatCurrency(report.originalBill ?? original.billAmount)}`;
  if (originalEei) originalEei.textContent = `Original EEI: RM ${formatCurrency(report.originalEei ?? original.eei)}`;
  if (billAfterSolarAmount) billAfterSolarAmount.textContent = `RM ${formatCurrency(report.billAfterSolarAmount)}`;
  if (billAfterSolarAmountHint) billAfterSolarAmountHint.textContent = `Before EEI recheck, panel qty ${solar.panelQty}`;
  if (billAfterSolarEei) billAfterSolarEei.textContent = `RM ${formatCurrency(report.billAfterSolarEei)}`;
  if (billAfterSolarEeiHint) billAfterSolarEeiHint.textContent = `EEI re-evaluated at net import`;
  if (totalExportKwhHint) totalExportKwhHint.textContent = `${formatKwh(report.totalExportKwh)} kWh exported`;
  if (exportEarning) exportEarning.textContent = `RM ${formatCurrency(report.exportEarning)}`;
  if (actualEeiAfterDeductExport) actualEeiAfterDeductExport.textContent = `RM ${formatCurrency(report.actualEeiAfterDeductExport)}`;
  if (netImportHint) netImportHint.textContent = `${formatKwh(report.netImportKwh)} kWh net import after export`;
  if (currentPanelQtyValue) currentPanelQtyValue.textContent = String(solar.panelQty || state.currentPanelQty);
  if (solarGenerationValue) solarGenerationValue.textContent = `${formatKwh(solar.solarGenerationKwh)} kWh`;
  if (morningOffsetValue) morningOffsetValue.textContent = `${formatKwh(solar.morningOffsetKwh)} kWh`;
  if (eeiStatusValue) {
    eeiStatusValue.textContent = Number(report.netImportKwh || 0) > 0 ? 'Still Active' : 'Stopped';
    eeiStatusValue.className = `mt-2 text-2xl font-bold ${Number(report.netImportKwh || 0) > 0 ? 'text-emerald-400' : 'text-rose-400'}`;
  }
  if (netImportValue) {
    netImportValue.textContent = `${formatKwh(report.netImportKwh)} kWh`;
    netImportValue.className = `mt-2 text-2xl font-bold ${Number(report.netImportKwh || 0) > 0 ? 'text-slate-950' : 'text-rose-600'}`;
  }
  if (sliderValue) {
    sliderValue.textContent = `Qty ${solar.panelQty || state.currentPanelQty}`;
  }
  if (mobileDockNetImport) {
    mobileDockNetImport.textContent = `${formatKwh(report.netImportKwh)} kWh`;
  }
  if (mobileDockEei) {
    mobileDockEei.textContent = Number(report.netImportKwh || 0) > 0
      ? `RM ${formatCurrency(report.actualEeiAfterDeductExport)}`
      : 'RM 0.00';
    mobileDockEei.className = `mt-1 text-lg font-bold ${Number(report.netImportKwh || 0) > 0 ? 'text-slate-950' : 'text-rose-600'}`;
  }

  state.latestPayload = data;
}

async function recalculate(panelQty) {
  if (!state.latestPayload) {
    return;
  }

  const amount = document.getElementById('billAmount')?.value;
  const morningOffsetPercent = document.getElementById('morningOffsetPercent')?.value;
  const panelRating = document.getElementById('panelRating')?.value;
  const sunPeakHour = document.getElementById('sunPeakHour')?.value;

  setStatus('Calculating', 'loading');

  try {
    const data = await fetchOptimizer({
      amount,
      morningOffsetPercent,
      panelType: panelRating,
      sunPeakHour,
      panelQty
    });
    syncSuggestion(data);
    renderReport(data);
    setStatus('Ready', 'success');
    if (window.matchMedia('(max-width: 767px)').matches) {
      document.getElementById('reportCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch (err) {
    console.error(err);
    setStatus('Error', 'error');
  }
}

async function startSimulation(event) {
  event.preventDefault();

  const amount = document.getElementById('billAmount')?.value;
  const morningOffsetPercent = document.getElementById('morningOffsetPercent')?.value;
  const panelRating = document.getElementById('panelRating')?.value;
  const sunPeakHour = document.getElementById('sunPeakHour')?.value;

  setStatus('Calculating', 'loading');

  try {
    const data = await fetchOptimizer({
      amount,
      morningOffsetPercent,
      panelType: panelRating,
      sunPeakHour
    });
    syncSuggestion(data);
    renderReport(data);
    setStatus('Ready', 'success');
    if (window.matchMedia('(max-width: 767px)').matches) {
      document.getElementById('reportCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch (err) {
    console.error(err);
    setStatus('Error', 'error');
  }
}

function scheduleRecalculate(panelQty) {
  clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(() => {
    recalculate(panelQty);
  }, 120);
}

window.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('eeiForm');
  const slider = document.getElementById('panelQtySlider');

  if (form) {
    form.addEventListener('submit', startSimulation);
  }

  if (slider) {
    slider.addEventListener('input', (event) => {
      const nextQty = Math.max(1, parseInt(event.target.value, 10) || 1);
      state.currentPanelQty = nextQty;
      const sliderValue = document.getElementById('sliderValue');
      if (sliderValue) {
        sliderValue.textContent = `Qty ${nextQty}`;
      }
      if (state.latestPayload) {
        scheduleRecalculate(nextQty);
      }
    });
  }
});
