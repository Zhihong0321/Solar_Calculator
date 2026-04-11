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

function formatMoneyCell(value) {
  return `RM ${formatCurrency(value)}`;
}

function formatPanelRange(startPanelQty, endPanelQty) {
  if (!Number.isFinite(startPanelQty) || !Number.isFinite(endPanelQty)) {
    return '-';
  }

  return `${startPanelQty} to ${endPanelQty} panels`;
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
    suggestedQty.textContent = String(state.currentPanelQty);
  }

  const mobileDockQty = document.getElementById('mobileDockQty');
  if (mobileDockQty) {
    mobileDockQty.textContent = `Qty ${state.currentPanelQty}`;
  }
}

function renderPanelSweep(rows, selectedPanelQty) {
  const tbody = document.getElementById('panelSweepBody');
  const mobileList = document.getElementById('panelSweepMobile');
  if (!tbody) {
    return;
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="compact-cell text-slate-500">No panel sweep data available.</td>
      </tr>
    `;
    if (mobileList) {
      mobileList.innerHTML = `
        <div class="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
          No panel sweep data available.
        </div>
      `;
    }
    return;
  }

  tbody.innerHTML = rows.map((row) => {
    const isSelected = Number(row.panelQty) === Number(selectedPanelQty);
    const rowClass = isSelected
      ? 'bg-emerald-50/80'
      : 'bg-white';
    return `
      <tr class="${rowClass}">
        <td class="compact-cell border-b border-slate-100 text-left font-semibold text-slate-950">
          <div class="flex items-center gap-2">
            <span>${row.panelQty}</span>
            ${isSelected ? '<span class="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.2em] text-white">picked</span>' : ''}
          </div>
        </td>
        <td class="compact-cell border-b border-slate-100 text-right font-medium text-slate-700">${formatKwh(row.morningOffsetKwh)}</td>
        <td class="compact-cell border-b border-slate-100 text-right font-medium text-slate-700">${formatMoneyCell(row.billAfterSolarEei ?? row.billAfterSolar)}</td>
        <td class="compact-cell border-b border-slate-100 text-right font-medium text-slate-700">${formatMoneyCell(row.exportEarning)}</td>
        <td class="compact-cell border-b border-slate-100 text-right font-medium ${Number(row.actualEei || 0) > 0 ? 'text-slate-900' : 'text-rose-600'}">${formatMoneyCell(row.actualEei)}</td>
      </tr>
    `;
  }).join('');

  if (mobileList) {
    mobileList.innerHTML = rows.map((row) => {
      const isSelected = Number(row.panelQty) === Number(selectedPanelQty);
      return `
        <article class="rounded-2xl border ${isSelected ? 'border-emerald-300 bg-emerald-50/70' : 'border-slate-200 bg-slate-50'} px-3 py-2.5 shadow-sm">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="text-base font-extrabold text-slate-950">${row.panelQty} panels</span>
              ${isSelected ? '<span class="rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-white">picked</span>' : ''}
            </div>
            <span class="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500">row</span>
          </div>
          <div class="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] leading-tight">
            <div class="rounded-xl bg-white/70 px-2.5 py-2">
              <p class="text-[9px] uppercase tracking-[0.25em] text-slate-500 font-semibold">Morning offset</p>
              <p class="mt-1 font-bold text-slate-950">${formatKwh(row.morningOffsetKwh)} kWh</p>
            </div>
            <div class="rounded-xl bg-white/70 px-2.5 py-2">
              <p class="text-[9px] uppercase tracking-[0.25em] text-slate-500 font-semibold">Bill after solar</p>
              <p class="mt-1 font-bold text-slate-950">${formatMoneyCell(row.billAfterSolarEei ?? row.billAfterSolar)}</p>
            </div>
            <div class="rounded-xl bg-white/70 px-2.5 py-2">
              <p class="text-[9px] uppercase tracking-[0.25em] text-slate-500 font-semibold">Export income</p>
              <p class="mt-1 font-bold text-slate-950">${formatMoneyCell(row.exportEarning)}</p>
            </div>
            <div class="rounded-xl bg-white/70 px-2.5 py-2">
              <p class="text-[9px] uppercase tracking-[0.25em] text-slate-500 font-semibold">Actual EEI</p>
              <p class="mt-1 font-bold ${Number(row.actualEei || 0) > 0 ? 'text-slate-950' : 'text-rose-600'}">${formatMoneyCell(row.actualEei)}</p>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }
}

function renderReport(data) {
  const original = data?.original || {};
  const report = data?.report || {};
  const solar = data?.solar || {};
  const sweepRows = Array.isArray(data?.panelSweep) ? data.panelSweep : [];
  const reportRangeBadge = document.getElementById('reportRangeBadge');
  const reportLead = document.getElementById('reportLead');
  const systemChoiceChip = document.getElementById('systemChoiceChip');
  const comparisonChip = document.getElementById('comparisonChip');
  const billChip = document.getElementById('billChip');
  const eeiStatusValue = document.getElementById('eeiStatusValue');
  const netImportValue = document.getElementById('netImportValue');
  const sliderValue = document.getElementById('sliderValue');
  const mobileDockNetImport = document.getElementById('mobileDockNetImport');
  const mobileDockEei = document.getElementById('mobileDockEei');

  if (eeiStatusValue) {
    eeiStatusValue.textContent = Number(report.netImportKwh || 0) > 0 ? 'Still Active' : 'Stopped';
    eeiStatusValue.className = `mt-1.5 text-xl font-bold ${Number(report.netImportKwh || 0) > 0 ? 'text-emerald-400' : 'text-rose-400'}`;
  }
  if (netImportValue) {
    netImportValue.textContent = `${formatKwh(report.netImportKwh)} kWh`;
    netImportValue.className = `mt-1.5 text-xl font-bold ${Number(report.netImportKwh || 0) > 0 ? 'text-slate-950' : 'text-rose-600'}`;
  }
  if (sliderValue) {
    sliderValue.textContent = `Qty ${solar.panelQty || state.currentPanelQty}`;
  }
  if (reportRangeBadge) {
    reportRangeBadge.textContent = formatPanelRange(report.comparisonStartPanelQty, report.comparisonEndPanelQty);
  }
  if (reportLead) {
    reportLead.textContent = `The system picked ${report.selectedPanelQty || solar.panelQty || state.currentPanelQty} panels. Compare the rows below to see the trade-off from ${report.comparisonStartPanelQty || '-'} to ${report.comparisonEndPanelQty || '-'}.`;
  }
  if (systemChoiceChip) {
    systemChoiceChip.textContent = `System pick: ${report.selectedPanelQty || solar.panelQty || state.currentPanelQty} panels`;
  }
  if (comparisonChip) {
    comparisonChip.textContent = `Compare: ${formatPanelRange(report.comparisonStartPanelQty, report.comparisonEndPanelQty)}`;
  }
  if (billChip) {
    billChip.textContent = `Original bill: ${formatMoneyCell(report.originalBill ?? original.billAmount)}`;
  }
    renderPanelSweep(sweepRows, report.selectedPanelQty || solar.panelQty || state.currentPanelQty);
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
      document.getElementById('panelSweepCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      document.getElementById('panelSweepCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
