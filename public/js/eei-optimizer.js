const state = {
  suggestedMaxPanelQty: 1,
  sliderMax: 20,
  currentPanelQty: 1,
  latestPayload: null,
  debounceTimer: null,
  savingsChart: null,
  baseUsageKwh: null,
  futureUsagePercent: 100,
  futureSimulationOpen: false,
  futureTargetPanelQty: null,
  futureBasePanelQty: null
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
}

function formatMoneyCell(value) {
  return `RM ${formatCurrency(value)}`;
}

function formatSignedMoneyCell(value) {
  const numeric = Number(value || 0);
  const sign = numeric > 0 ? '+' : '';
  return `${sign}RM ${formatCurrency(numeric)}`;
}

function formatPanelRange(startPanelQty, endPanelQty) {
  if (!Number.isFinite(startPanelQty) || !Number.isFinite(endPanelQty)) {
    return '-';
  }

  return `${startPanelQty} to ${endPanelQty} panels`;
}

function getChartBounds(seriesGroups) {
  const values = seriesGroups.flat().filter((value) => Number.isFinite(value));
  if (!values.length) {
    return { min: 0, max: 100 };
  }

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  if (minValue === maxValue) {
    const padding = Math.max(6, Math.abs(minValue) * 0.1 || 6);
    return {
      min: Math.max(0, minValue - padding),
      max: maxValue + padding
    };
  }

  const padding = Math.max(4, (maxValue - minValue) * 0.08);
  return {
    min: Math.max(0, minValue - padding),
    max: maxValue + padding
  };
}

function getFutureUsageOverride() {
  if (!(state.baseUsageKwh > 0) || Number(state.futureUsagePercent) === 100) {
    return null;
  }

  return Number(((state.baseUsageKwh * state.futureUsagePercent) / 100).toFixed(2));
}

function getFuturePanelQty() {
  return Math.max(1, parseInt(state.futureTargetPanelQty ?? state.currentPanelQty, 10) || 1);
}

function getFutureBasePanelQty() {
  return Math.max(1, parseInt(state.futureBasePanelQty ?? state.currentPanelQty, 10) || 1);
}

function getFutureScenarioRow() {
  const rows = Array.isArray(state.latestPayload?.panelSweep) ? state.latestPayload.panelSweep : [];
  return rows.find((row) => Number(row.panelQty) === Number(getFuturePanelQty())) || null;
}

function updateFutureResultSummary() {
  const resultTitle = document.getElementById('futureResultTitle');
  const totalSaving = document.getElementById('futureTotalSaving');
  const billReduction = document.getElementById('futureBillReduction');
  const eeiBenefit = document.getElementById('futureEeiBenefit');
  const exportSaving = document.getElementById('futureExportSaving');
  const billAfterSolar = document.getElementById('futureBillAfterSolar');
  const morningOffset = document.getElementById('futureMorningOffset');
  const scenarioRow = getFutureScenarioRow();

  if (!scenarioRow) {
    if (resultTitle) {
      resultTitle.textContent = 'Run a simulation to see this row result';
    }
    if (totalSaving) {
      totalSaving.textContent = '-';
    }
    if (billReduction) {
      billReduction.textContent = '-';
    }
    if (eeiBenefit) {
      eeiBenefit.textContent = '-';
    }
    if (exportSaving) {
      exportSaving.textContent = '-';
    }
    if (billAfterSolar) {
      billAfterSolar.textContent = '-';
    }
    if (morningOffset) {
      morningOffset.textContent = '-';
    }
    return;
  }

  if (resultTitle) {
    resultTitle.textContent = `${scenarioRow.panelQty} panels at ${state.futureUsagePercent}% usage`;
  }
  if (totalSaving) {
    totalSaving.textContent = formatMoneyCell(scenarioRow.totalSavingAchieved);
  }
  if (billReduction) {
    billReduction.textContent = formatMoneyCell(scenarioRow.billReductionSaving ?? scenarioRow.billReduction);
  }
  if (eeiBenefit) {
    eeiBenefit.textContent = formatMoneyCell(scenarioRow.actualEeiBenefited ?? scenarioRow.eeiSaving ?? scenarioRow.eeiImpact);
  }
  if (exportSaving) {
    exportSaving.textContent = formatMoneyCell(scenarioRow.exportEarning);
  }
  if (billAfterSolar) {
    billAfterSolar.textContent = formatMoneyCell(scenarioRow.billAfterSolarAmount ?? scenarioRow.billAfterSolar);
  }
  if (morningOffset) {
    morningOffset.textContent = `${formatKwh(scenarioRow.morningOffsetKwh)} kWh`;
  }
}

function updateFutureUsageSummary() {
  const currentUsage = document.getElementById('futureCurrentUsage');
  const projectedUsage = document.getElementById('futureProjectedUsage');
  const percentValue = document.getElementById('futureUsagePercentValue');
  const futureModalTitle = document.getElementById('futureModalTitle');
  const basePanelQty = document.getElementById('futureBasePanelQty');
  const projectedPanelQty = document.getElementById('futureProjectedPanelQty');
  const panelQtyValue = document.getElementById('futurePanelQtyValue');
  const panelQtySlider = document.getElementById('futurePanelQtySlider');
  const panelQtyMinLabel = document.getElementById('futurePanelQtyMinLabel');
  const panelQtyMaxLabel = document.getElementById('futurePanelQtyMaxLabel');

  const baseUsage = Number(state.baseUsageKwh || state.latestPayload?.original?.usageKwh || 0);
  const projected = getFutureUsageOverride() ?? baseUsage;
  const delta = Math.round(Number(state.futureUsagePercent || 100) - 100);
  const deltaLabel = delta === 0
    ? 'Current'
    : `${delta > 0 ? '+' : ''}${delta}%`;
  const basePanels = getFutureBasePanelQty();
  const projectedPanels = getFuturePanelQty();

  if (currentUsage) {
    currentUsage.textContent = `${formatKwh(baseUsage)} kWh`;
  }
  if (projectedUsage) {
    projectedUsage.textContent = `${formatKwh(projected)} kWh`;
  }
  if (percentValue) {
    percentValue.textContent = delta === 0 ? '100% (Current)' : `${state.futureUsagePercent}% (${deltaLabel})`;
  }
  if (futureModalTitle) {
    futureModalTitle.textContent = `Change usage for ${projectedPanels} panels`;
  }
  if (basePanelQty) {
    basePanelQty.textContent = `${basePanels} panels`;
  }
  if (projectedPanelQty) {
    projectedPanelQty.textContent = `${projectedPanels} panels`;
  }
  if (panelQtyValue) {
    panelQtyValue.textContent = projectedPanels === basePanels
      ? `${projectedPanels} panels (Base)`
      : `${projectedPanels} panels (+${projectedPanels - basePanels})`;
  }
  if (panelQtySlider) {
    panelQtySlider.min = String(basePanels);
    panelQtySlider.max = String(basePanels + 10);
    panelQtySlider.value = String(projectedPanels);
  }
  if (panelQtyMinLabel) {
    panelQtyMinLabel.textContent = `${basePanels}`;
  }
  if (panelQtyMaxLabel) {
    panelQtyMaxLabel.textContent = `${basePanels + 10}`;
  }

  updateFutureResultSummary();
}

function openFutureModal(panelQty) {
  if (!(state.baseUsageKwh > 0)) {
    return;
  }

  const safeBasePanelQty = Math.max(1, parseInt(panelQty, 10) || state.currentPanelQty || 1);
  state.futureBasePanelQty = safeBasePanelQty;
  state.futureTargetPanelQty = safeBasePanelQty;
  const modal = document.getElementById('futureSimModal');
  const usageSlider = document.getElementById('futureUsageSlider');
  const panelQtySlider = document.getElementById('futurePanelQtySlider');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
  if (usageSlider) {
    usageSlider.value = String(state.futureUsagePercent);
  }
  if (panelQtySlider) {
    panelQtySlider.min = String(safeBasePanelQty);
    panelQtySlider.max = String(safeBasePanelQty + 10);
    panelQtySlider.value = String(safeBasePanelQty);
  }
  state.futureSimulationOpen = true;
  updateFutureUsageSummary();
}

function closeFutureModal() {
  const modal = document.getElementById('futureSimModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  state.futureSimulationOpen = false;
}

function destroySavingsChart() {
  if (state.savingsChart) {
    state.savingsChart.destroy();
    state.savingsChart = null;
  }
}

function renderSavingsChart(rows) {
  const canvas = document.getElementById('eeiSavingsChart');
  if (!canvas || !window.Chart) {
    return;
  }

  const labels = Array.isArray(rows) ? rows.map((row) => `${row.panelQty}`) : [];
  const billReductionSeries = Array.isArray(rows)
    ? rows.map((row) => Number(row.billReductionSaving ?? row.billReduction ?? 0))
    : [];
  const eeiSeries = Array.isArray(rows)
    ? rows.map((row) => Number(row.actualEeiBenefited ?? row.eeiSaving ?? row.eeiImpact ?? 0))
    : [];
  const exportSeries = Array.isArray(rows)
    ? rows.map((row) => Number(row.exportEarning ?? 0))
    : [];
  const totalSeries = Array.isArray(rows)
    ? rows.map((row) => Number(
      row.totalSavingAchieved
      ?? ((row.billReductionSaving ?? row.billReduction ?? 0)
        + (row.actualEeiBenefited ?? row.eeiSaving ?? row.eeiImpact ?? 0)
        + (row.exportEarning ?? 0))
    ))
    : [];
  const bounds = getChartBounds([billReductionSeries, eeiSeries, exportSeries, totalSeries]);

  if (state.savingsChart) {
    state.savingsChart.data.labels = labels;
    state.savingsChart.data.datasets[0].data = billReductionSeries;
    state.savingsChart.data.datasets[1].data = eeiSeries;
    state.savingsChart.data.datasets[2].data = exportSeries;
    state.savingsChart.data.datasets[3].data = totalSeries;
    state.savingsChart.options.scales.y.min = bounds.min;
    state.savingsChart.options.scales.y.max = bounds.max;
    state.savingsChart.update();
    return;
  }

  state.savingsChart = new window.Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Bill reduction saving',
          data: billReductionSeries,
          borderColor: '#0f172a',
          backgroundColor: 'rgba(15, 23, 42, 0.08)',
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.25
        },
        {
          label: 'Actual EEI benefited',
          data: eeiSeries,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.12)',
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.25
        },
        {
          label: 'Export saving',
          data: exportSeries,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.12)',
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.25
        },
        {
          label: 'Total saving',
          data: totalSeries,
          borderColor: '#dc2626',
          backgroundColor: 'rgba(220, 38, 38, 0.14)',
          borderWidth: 4,
          pointRadius: 4.5,
          pointHoverRadius: 6,
          tension: 0.25
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 10,
            usePointStyle: true,
            pointStyle: 'line',
            padding: 14,
            color: '#334155',
            font: {
              size: 10,
              weight: '600'
            }
          }
        },
        tooltip: {
          callbacks: {
            label(context) {
              return `${context.dataset.label}: RM ${formatCurrency(context.parsed.y)}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: '#64748b',
            font: {
              size: 10,
              weight: '600'
            }
          }
        },
        y: {
          min: bounds.min,
          max: bounds.max,
          grid: {
            color: 'rgba(148, 163, 184, 0.18)'
          },
          ticks: {
            color: '#64748b',
            font: {
              size: 10
            },
            callback(value) {
              return `RM ${formatCurrency(value)}`;
            }
          }
        }
      }
    }
  });
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

  updateFutureUsageSummary();
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
        <td colspan="7" class="compact-cell text-slate-500">No panel sweep data available.</td>
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
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-1.5">
              <span>${row.panelQty} panels</span>
              <span class="text-slate-400">|</span>
              <span class="font-black text-rose-600">${formatMoneyCell(row.totalSavingAchieved)} total saving</span>
              ${isSelected ? '<span class="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.2em] text-white">picked</span>' : ''}
            </div>
            <div>
              <button type="button" data-simulate-future-panel="${row.panelQty}" class="rounded-full bg-slate-950 px-2.5 py-0.5 text-[10px] font-semibold text-white hover:bg-slate-800">
                Simulate Future
              </button>
            </div>
          </div>
        </td>
        <td class="compact-cell border-b border-slate-100 text-right font-medium text-slate-700">${formatKwh(row.morningOffsetKwh)}</td>
        <td class="compact-cell border-b border-slate-100 text-right font-medium text-slate-700">${formatMoneyCell(row.packagePrice)}</td>
        <td class="compact-cell border-b border-slate-100 text-right font-medium text-slate-700">${formatMoneyCell(row.billAfterSolarAmount ?? row.billAfterSolar)}</td>
        <td class="compact-cell border-b border-slate-100 text-right font-medium text-slate-700">${formatMoneyCell(row.eeiAfterSolarAmount)}</td>
        <td class="compact-cell border-b border-slate-100 text-right font-medium ${Number(row.eeiAfterAdjustmentAmount || 0) <= 0 ? 'text-emerald-700' : 'text-rose-600'}">${formatSignedMoneyCell(row.eeiAfterAdjustmentAmount)}</td>
        <td class="compact-cell border-b border-slate-100 text-right font-medium text-slate-700">${formatMoneyCell(row.exportEarning)}</td>
      </tr>
    `;
  }).join('');

  if (mobileList) {
    mobileList.innerHTML = rows.map((row) => {
      const isSelected = Number(row.panelQty) === Number(selectedPanelQty);
      return `
        <article class="rounded-2xl border ${isSelected ? 'border-emerald-300 bg-emerald-50/70' : 'border-slate-200 bg-slate-50'} px-3 py-2.5 shadow-sm">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-base font-extrabold text-slate-950">${row.panelQty} panels</span>
            <span class="text-slate-400">|</span>
            <span class="font-black text-rose-600">${formatMoneyCell(row.totalSavingAchieved)} total saving</span>
            ${isSelected ? '<span class="rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-white">picked</span>' : ''}
          </div>
          <div class="mt-2">
            <button type="button" data-simulate-future-panel="${row.panelQty}" class="rounded-full bg-slate-950 px-2.5 py-0.5 text-[10px] font-semibold text-white hover:bg-slate-800">
              Simulate Future
            </button>
          </div>
          <div class="mt-2 grid grid-cols-2 gap-x-2.5 gap-y-2 text-[11px] leading-tight">
            <div class="rounded-xl bg-white/70 px-2.5 py-2">
              <p class="text-[9px] uppercase tracking-[0.25em] text-slate-500 font-semibold">Morning offset</p>
              <p class="mt-1 font-bold text-slate-950">${formatKwh(row.morningOffsetKwh)} kWh</p>
            </div>
            <div class="rounded-xl bg-white/70 px-2.5 py-2">
              <p class="text-[9px] uppercase tracking-[0.25em] text-slate-500 font-semibold">Package price</p>
              <p class="mt-1 font-bold text-slate-950">${formatMoneyCell(row.packagePrice)}</p>
            </div>
            <div class="rounded-xl bg-white/70 px-2.5 py-2">
              <p class="text-[9px] uppercase tracking-[0.25em] text-slate-500 font-semibold">Bill after solar</p>
              <p class="mt-1 font-bold text-slate-950">${formatMoneyCell(row.billAfterSolarAmount ?? row.billAfterSolar)}</p>
            </div>
            <div class="rounded-xl bg-white/70 px-2.5 py-2">
              <p class="text-[9px] uppercase tracking-[0.25em] text-slate-500 font-semibold">EEI after solar</p>
              <p class="mt-1 font-bold text-slate-950">${formatMoneyCell(row.eeiAfterSolarAmount)}</p>
            </div>
            <div class="rounded-xl bg-white/70 px-2.5 py-2">
              <p class="text-[9px] uppercase tracking-[0.25em] text-slate-500 font-semibold">EEI adjustment</p>
              <p class="mt-1 font-bold ${Number(row.eeiAfterAdjustmentAmount || 0) <= 0 ? 'text-emerald-700' : 'text-rose-600'}">${formatSignedMoneyCell(row.eeiAfterAdjustmentAmount)}</p>
            </div>
            <div class="rounded-xl bg-white/70 px-2.5 py-2">
              <p class="text-[9px] uppercase tracking-[0.25em] text-slate-500 font-semibold">Export saving</p>
              <p class="mt-1 font-bold text-slate-950">${formatMoneyCell(row.exportEarning)}</p>
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
    reportLead.textContent = state.futureUsagePercent === 100
      ? `The chart shows bill reduction + actual EEI benefited + export saving = total saving. Each row shows bill after solar with EEI untouched, then the EEI adjustment separately.`
      : `Future mode is active at ${state.futureUsagePercent}% of current usage. The chart still compares bill reduction + actual EEI benefited + export saving for the same panel sweep.`;
  }
  if (systemChoiceChip) {
    systemChoiceChip.textContent = `System pick: ${report.selectedPanelQty || solar.panelQty || state.currentPanelQty} panels`;
  }
  if (comparisonChip) {
    comparisonChip.textContent = state.futureUsagePercent === 100
      ? `Compare: ${formatPanelRange(report.comparisonStartPanelQty, report.comparisonEndPanelQty)}`
      : `Future usage: ${state.futureUsagePercent}%`;
  }
  if (billChip) {
    billChip.textContent = `Original bill: ${formatMoneyCell(report.originalBill ?? original.billAmount)}`;
  }
  updateFutureUsageSummary();
  renderSavingsChart(sweepRows);
  renderPanelSweep(sweepRows, report.selectedPanelQty || solar.panelQty || state.currentPanelQty);

  state.latestPayload = data;
}

function buildOptimizerParams(panelQty, usageKwhOverride = null) {
  const amount = document.getElementById('billAmount')?.value;
  const morningOffsetPercent = document.getElementById('morningOffsetPercent')?.value;
  const panelRating = document.getElementById('panelRating')?.value;
  const sunPeakHour = document.getElementById('sunPeakHour')?.value;

  const params = {
    amount,
    morningOffsetPercent,
    panelType: panelRating,
    sunPeakHour
  };

  if (panelQty !== undefined && panelQty !== null) {
    params.panelQty = panelQty;
  }
  if (usageKwhOverride !== undefined && usageKwhOverride !== null) {
    params.usageKwhOverride = usageKwhOverride;
  }

  return params;
}

async function runSimulation(params, options = {}) {
  const { resetFutureBase = false, scrollToReport = false } = options;
  setStatus('Calculating', 'loading');

  try {
    const data = await fetchOptimizer(params);
    if (resetFutureBase) {
      state.baseUsageKwh = Number(data?.original?.usageKwh || 0);
      state.futureUsagePercent = 100;
      updateFutureUsageSummary();
    }
    syncSuggestion(data);
    renderReport(data);
    setStatus('Ready', 'success');
    if (scrollToReport && window.matchMedia('(max-width: 767px)').matches) {
      document.getElementById('panelSweepCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return data;
  } catch (err) {
    console.error(err);
    setStatus('Error', 'error');
    return null;
  }
}

async function recalculate(panelQty) {
  if (!state.latestPayload) {
    return;
  }

  const usageKwhOverride = getFutureUsageOverride();
  await runSimulation(buildOptimizerParams(panelQty, usageKwhOverride), {
    scrollToReport: !state.futureSimulationOpen
  });
}

async function startSimulation(event) {
  event.preventDefault();
  closeFutureModal();
  await runSimulation(buildOptimizerParams(null, null), {
    resetFutureBase: true,
    scrollToReport: true
  });
}

function scheduleRecalculate(panelQty) {
  clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(() => {
    recalculate(panelQty);
  }, 120);
}

function scheduleFutureSimulation(percentValue) {
  clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(() => {
    recalculate(getFuturePanelQty());
  }, 120);
}

window.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('eeiForm');
  const slider = document.getElementById('panelQtySlider');
  const futureSlider = document.getElementById('futureUsageSlider');
  const futurePanelQtySlider = document.getElementById('futurePanelQtySlider');
  const futureResetButton = document.getElementById('futureResetButton');
  const modal = document.getElementById('futureSimModal');
  const panelSweepCard = document.getElementById('panelSweepCard');
  const closeTargets = document.querySelectorAll('[data-close-future-modal="true"]');

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

  if (futureSlider) {
    futureSlider.addEventListener('input', (event) => {
      state.futureUsagePercent = Math.max(80, Math.min(160, parseInt(event.target.value, 10) || 100));
      updateFutureUsageSummary();
      if (state.latestPayload) {
        scheduleFutureSimulation(state.futureUsagePercent);
      }
    });
  }

  if (futurePanelQtySlider) {
    futurePanelQtySlider.addEventListener('input', (event) => {
      const basePanels = getFutureBasePanelQty();
      state.futureTargetPanelQty = Math.max(basePanels, Math.min(basePanels + 10, parseInt(event.target.value, 10) || basePanels));
      updateFutureUsageSummary();
      if (state.latestPayload) {
        scheduleFutureSimulation(state.futureUsagePercent);
      }
    });
  }

  if (futureResetButton) {
    futureResetButton.addEventListener('click', async () => {
      state.futureUsagePercent = 100;
      if (futureSlider) {
        futureSlider.value = '100';
      }
      state.futureTargetPanelQty = getFutureBasePanelQty();
      if (futurePanelQtySlider) {
        futurePanelQtySlider.value = String(state.futureTargetPanelQty);
      }
      updateFutureUsageSummary();
      if (state.latestPayload) {
        await recalculate(getFuturePanelQty());
      }
    });
  }

  closeTargets.forEach((target) => {
    target.addEventListener('click', () => {
      closeFutureModal();
    });
  });

  if (modal) {
    modal.addEventListener('click', (event) => {
      if (event.target instanceof HTMLElement && event.target.dataset.closeFutureModal === 'true') {
        closeFutureModal();
      }
    });
  }

  if (panelSweepCard) {
    panelSweepCard.addEventListener('click', (event) => {
      const trigger = event.target instanceof HTMLElement
        ? event.target.closest('[data-simulate-future-panel]')
        : null;
      if (!trigger) {
        return;
      }

      const panelQty = parseInt(trigger.getAttribute('data-simulate-future-panel') || '', 10);
      openFutureModal(panelQty);
    });
  }

  updateFutureUsageSummary();
});
