function toFixedLiteral(value, digits = 2) {
    return value !== null && value !== undefined ? Number(value).toFixed(digits) : 'null';
}

function buildFloatingA4PreviewButton(identifier) {
    if (!identifier) {
        return '';
    }

    return `
    <div class="floating-a4-preview no-print">
      <button onclick='openA4Preview(${JSON.stringify(identifier)})'>
        <span>A4 Preview</span>
      </button>
    </div>
    `;
}

function buildSignatureModalHtml() {
    return `
    <!-- Signature Modal -->
    <div id="signatureModal" class="fixed inset-0 z-[100] hidden bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all scale-95 opacity-0" id="signatureBox">
        <div class="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 class="text-sm font-bold text-slate-800 uppercase tracking-wider">Customer Signature</h3>
            <p class="text-[10px] text-slate-500 font-medium">Please sign within the box below</p>
          </div>
          <button onclick="closeSignatureModal()" class="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-white transition-all">✕</button>
        </div>
        <div class="p-6">
          <div class="relative bg-slate-50 border-2 border-dashed border-slate-200 rounded-lg overflow-hidden touch-none" style="height: 240px;">
            <canvas id="signatureCanvas" class="absolute inset-0 w-full h-full cursor-crosshair"></canvas>
          </div>
          <div class="flex justify-between items-center mt-6 gap-3">
            <button onclick="clearSignature()" class="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 uppercase tracking-widest transition-colors">Clear Space</button>
            <div class="flex gap-2 flex-1">
              <button onclick="closeSignatureModal()" class="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50 transition-all uppercase tracking-widest">Cancel</button>
              <button onclick="saveSignature()" id="saveSignBtn" class="flex-[2] px-4 py-2.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 shadow-lg transition-all uppercase tracking-widest flex items-center justify-center gap-2">
                Confirm & Sign
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    `;
}

function buildSavedEstimateLiteral({
    hasSolarSavingsSection,
    beforeSolarBill,
    afterSolarBill,
    estimatedMonthlySaving,
    storedSunPeakHour,
    storedMorningUsagePercent
}) {
    if (!hasSolarSavingsSection) {
        return 'null';
    }

    return `{
          customer_average_tnb: ${toFixedLiteral(beforeSolarBill, 2)},
          estimated_new_bill_amount: ${toFixedLiteral(afterSolarBill, 2)},
          estimated_saving: ${toFixedLiteral(estimatedMonthlySaving, 2)},
          solar_sun_peak_hour: ${toFixedLiteral(storedSunPeakHour, 2)},
          solar_morning_usage_percent: ${toFixedLiteral(storedMorningUsagePercent, 2)},
          selected_bill_cycle_mode: 'fullMonth'
        }`;
}

function buildInvoiceInteractionScript({
    identifier,
    hasSolarSavingsSection,
    canEstimateSolarSavings,
    beforeSolarBill,
    afterSolarBill,
    estimatedMonthlySaving,
    storedSunPeakHour,
    storedMorningUsagePercent
}) {
    const savedEstimateLiteral = buildSavedEstimateLiteral({
        hasSolarSavingsSection,
        beforeSolarBill,
        afterSolarBill,
        estimatedMonthlySaving,
        storedSunPeakHour,
        storedMorningUsagePercent
    });

    return `
    <script>
      let signaturePad;
      const modal = document.getElementById('signatureModal');
      const box = document.getElementById('signatureBox');
      const canvas = document.getElementById('signatureCanvas');

      function openSignatureModal() {
        modal.classList.remove('hidden');
        setTimeout(() => {
          box.classList.remove('scale-95', 'opacity-0');
          resizeCanvas();
          if (!signaturePad) {
            signaturePad = new SignaturePad(canvas, {
              backgroundColor: 'rgba(255, 255, 255, 0)',
              penColor: '#0f172a'
            });
          }
        }, 10);
      }

      function closeSignatureModal() {
        box.classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
          modal.classList.add('hidden');
        }, 200);
      }

      function resizeCanvas() {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        canvas.getContext("2d").scale(ratio, ratio);
        if (signaturePad) signaturePad.clear();
      }

      window.onresize = resizeCanvas;

      function clearSignature() {
        if (signaturePad) signaturePad.clear();
      }

      async function saveSignature() {
        if (!signaturePad || signaturePad.isEmpty()) {
          return Swal.fire({ icon: 'warning', title: 'Empty Signature', text: 'Please provide your signature before confirming.', confirmButtonColor: '#0f172a' });
        }

        const btn = document.getElementById('saveSignBtn');
        const originalText = btn.innerHTML;
        
        try {
          btn.disabled = true;
          btn.innerHTML = 'Saving...';

          const dataUrl = signaturePad.toDataURL('image/png');
          const pathParts = window.location.pathname.split('/');
          const identifier = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];
          
          const response = await fetch('/view/' + identifier + '/signature', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ signature: dataUrl })
          });

          const result = await response.json();
          if (result.success) {
            Swal.fire({
              icon: 'success',
              title: 'Signed!',
              text: 'Your signature has been securely recorded.',
              timer: 2000,
              showConfirmButton: false
            }).then(() => {
              window.location.reload();
            });
          } else {
            throw new Error(result.error || 'Failed to save signature');
          }
        } catch (err) {
          Swal.fire({ icon: 'error', title: 'Error', text: err.message, confirmButtonColor: '#0f172a' });
          btn.disabled = false;
          btn.innerHTML = originalText;
        }
      }

      async function downloadInvoicePdf(shareToken) {
        const button = document.querySelector('button[onclick*="downloadInvoicePdf"]');
        const buttonText = document.getElementById('pdfButtonText');
        try {
          button.disabled = true;
          button.classList.add('opacity-75', 'cursor-not-allowed');
          buttonText.textContent = 'Preparing...';
          const response = await fetch('/view/' + shareToken + '/pdf');
          const data = await response.json();
          if (data.success && data.downloadUrl) {
            let downloadUrl = data.downloadUrl;
            if (!downloadUrl.startsWith('http')) downloadUrl = 'https://' + downloadUrl;
            window.open(downloadUrl, '_blank');
          } else {
            alert('Failed: ' + (data.error || 'Unknown error'));
          }
        } catch (err) {
          alert('Error: ' + err.message);
        } finally {
            button.disabled = false;
            button.classList.remove('opacity-75', 'cursor-not-allowed');
            buttonText.textContent = 'Download PDF';
        }
      }

      function viewProposal(shareToken) {
        window.open('/proposal/' + shareToken, '_blank');
      }

      function openA4Preview(shareToken) {
        window.open('/view/' + shareToken + '?layout=a4', '_blank', 'noopener');
      }

      async function quickShareInvoice(identifier, invoiceNumber, documentType) {
        const shareUrl = window.location.origin + '/view/' + identifier;
        const shareTitle = [documentType, invoiceNumber].filter(Boolean).join(' ').trim() || 'Invoice';

        try {
          if (navigator.share) {
            await navigator.share({
              title: shareTitle,
              text: shareTitle,
              url: shareUrl
            });
            return;
          }

          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(shareUrl);
            Swal.fire({
              icon: 'success',
              title: 'Link Copied',
              text: 'Invoice link copied to clipboard.',
              toast: true,
              position: 'top-end',
              showConfirmButton: false,
              timer: 2500
            });
            return;
          }

          window.prompt('Copy this invoice link:', shareUrl);
        } catch (err) {
          if (err && err.name === 'AbortError') return;

          Swal.fire({
            icon: 'error',
            title: 'Share Failed',
            text: 'Unable to share this invoice right now.',
            confirmButtonColor: '#0f172a'
          });
        }
      }

      const solarEstimateEndpointBase = window.location.pathname.startsWith('/view2/') ? '/view2/' : '/view/';
      const solarScenarioConfig = {
        low30: {
          key: 'low30',
          label: 'Low Day Usage',
          shortLabel: '30% Offset',
          morningUsage: 30,
          summary: 'Lower daytime usage sends more solar to grid export, which usually earns less per kWh than direct offset.'
        },
        high80: {
          key: 'high80',
          label: 'High Day Usage',
          shortLabel: '80% Offset',
          morningUsage: 80,
          summary: 'Higher daytime usage lets more solar offset your own bill directly, which usually gives stronger savings.'
        }
      };

      const solarEstimateState = {
        identifier: ${JSON.stringify(identifier)},
        hasSavedEstimate: ${hasSolarSavingsSection ? 'true' : 'false'},
        canEstimate: ${canEstimateSolarSavings ? 'true' : 'false'},
        currentAverageBill: ${toFixedLiteral(beforeSolarBill, 2)},
        currentScenarioKey: 'custom',
        currentBillCycleMode: 'fullMonth',
        currentSunPeakHour: ${toFixedLiteral(storedSunPeakHour, 2)},
        currentMorningUsage: ${toFixedLiteral(storedMorningUsagePercent, 2)},
        latestPreview: null,
        savedEstimate: ${savedEstimateLiteral},
        cache: {}
      };

      function formatSolarEstimateMoney(value) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? 'RM ' + numeric.toFixed(2) : 'RM --';
      }

      function normalizeSolarBillCycleMode(mode) {
        return mode === 'under28Days' ? 'under28Days' : 'fullMonth';
      }

      function nearlyEqualSolarEstimateMoney(a, b) {
        return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 0.05;
      }

      function getSolarBillCycleModes(data) {
        return data && data.bill_cycle_modes ? data.bill_cycle_modes : null;
      }

      function getSelectedSolarBillCycleMetrics(data, preferredMode) {
        const modes = getSolarBillCycleModes(data);
        if (!modes) return null;
        const normalizedMode = normalizeSolarBillCycleMode(preferredMode || data.selected_bill_cycle_mode);
        return modes[normalizedMode] || modes.fullMonth || null;
      }

      function inferSolarBillCycleModeFromSavedEstimate(data) {
        const modes = getSolarBillCycleModes(data);
        if (!modes) {
          return normalizeSolarBillCycleMode(solarEstimateState.currentBillCycleMode);
        }

        const savedAfter = Number(solarEstimateState.savedEstimate && solarEstimateState.savedEstimate.estimated_new_bill_amount);
        const savedSaving = Number(solarEstimateState.savedEstimate && solarEstimateState.savedEstimate.estimated_saving);
        if (nearlyEqualSolarEstimateMoney(savedAfter, Number(modes.under28Days && modes.under28Days.estimated_new_bill_amount))
          && nearlyEqualSolarEstimateMoney(savedSaving, Number(modes.under28Days && modes.under28Days.estimated_saving))) {
          return 'under28Days';
        }
        if (nearlyEqualSolarEstimateMoney(savedAfter, Number(modes.fullMonth && modes.fullMonth.estimated_new_bill_amount))
          && nearlyEqualSolarEstimateMoney(savedSaving, Number(modes.fullMonth && modes.fullMonth.estimated_saving))) {
          return 'fullMonth';
        }

        return normalizeSolarBillCycleMode(data.selected_bill_cycle_mode || solarEstimateState.currentBillCycleMode);
      }

      function updateSolarEstimateStatus(message, tone) {
        const statusEl = document.getElementById('solarEstimateStatus');
        if (!statusEl) return;

        const tones = {
          neutral: { bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' },
          success: { bg: '#ecfdf5', border: '#a7f3d0', color: '#047857' },
          warning: { bg: '#fffbeb', border: '#fde68a', color: '#92400e' }
        };
        const style = tones[tone] || tones.neutral;

        statusEl.textContent = message;
        statusEl.style.background = style.bg;
        statusEl.style.borderColor = style.border;
        statusEl.style.color = style.color;
      }

      function setSolarScenarioButtonsDisabled(disabled) {
        Object.keys(solarScenarioConfig).forEach((scenarioKey) => {
          const button = document.getElementById('solarScenarioBtn_' + scenarioKey);
          if (button) button.disabled = disabled;
        });
        ['fullMonth', 'under28Days'].forEach((modeKey) => {
          const button = document.getElementById('solarBillCycleBtn_' + modeKey);
          if (button) button.disabled = disabled;
        });
        const recalcBtn = document.getElementById('solarRecalculateBtn');
        const saveBtn = document.getElementById('saveSolarScenarioBtn');
        if (recalcBtn) recalcBtn.disabled = disabled;
        if (saveBtn) saveBtn.disabled = disabled;
      }

      function updateSolarScenarioButtons() {
        Object.keys(solarScenarioConfig).forEach((scenarioKey) => {
          const button = document.getElementById('solarScenarioBtn_' + scenarioKey);
          if (!button) return;

          const isActive = solarEstimateState.currentScenarioKey === scenarioKey;
          button.style.background = isActive ? '#0f172a' : '#ffffff';
          button.style.color = isActive ? '#ffffff' : '#0f172a';
          button.style.borderColor = isActive ? '#0f172a' : '#cbd5e1';
          button.style.boxShadow = isActive ? '0 10px 20px rgba(15, 23, 42, 0.16)' : 'none';
        });
      }

      function updateSolarBillCycleButtons() {
        ['fullMonth', 'under28Days'].forEach((modeKey) => {
          const button = document.getElementById('solarBillCycleBtn_' + modeKey);
          if (!button) return;

          const isActive = normalizeSolarBillCycleMode(solarEstimateState.currentBillCycleMode) === modeKey;
          button.style.background = isActive ? '#0f172a' : '#ffffff';
          button.style.color = isActive ? '#ffffff' : '#0f172a';
          button.style.borderColor = isActive ? '#0f172a' : '#cbd5e1';
          button.style.boxShadow = isActive ? '0 10px 20px rgba(15, 23, 42, 0.16)' : 'none';
        });
      }

      function syncSolarParameterInputs() {
        const sunPeakInput = document.getElementById('solarSunPeakHourInput');
        const morningUsageInput = document.getElementById('solarMorningUsageInput');
        if (sunPeakInput && Number.isFinite(Number(solarEstimateState.currentSunPeakHour))) {
          sunPeakInput.value = Number(solarEstimateState.currentSunPeakHour).toFixed(1);
        }
        if (morningUsageInput && Number.isFinite(Number(solarEstimateState.currentMorningUsage))) {
          morningUsageInput.value = Number(solarEstimateState.currentMorningUsage).toFixed(0);
        }
      }

      function readSolarParameterInputs() {
        const sunPeakInput = document.getElementById('solarSunPeakHourInput');
        const morningUsageInput = document.getElementById('solarMorningUsageInput');

        const sunPeakHour = Number(sunPeakInput ? sunPeakInput.value : solarEstimateState.currentSunPeakHour);
        const morningUsage = Number(morningUsageInput ? morningUsageInput.value : solarEstimateState.currentMorningUsage);

        if (!Number.isFinite(sunPeakHour) || sunPeakHour < 3.0 || sunPeakHour > 4.5) {
          throw new Error('Sun Peak Hour must be between 3.0 and 4.5.');
        }
        if (!Number.isFinite(morningUsage) || morningUsage < 1 || morningUsage > 100) {
          throw new Error('Morning offset must be between 1% and 100%.');
        }

        solarEstimateState.currentSunPeakHour = Number(sunPeakHour.toFixed(2));
        solarEstimateState.currentMorningUsage = Number(morningUsage.toFixed(2));

        const matchedScenario = Object.values(solarScenarioConfig).find((scenario) => Number(scenario.morningUsage) === Number(solarEstimateState.currentMorningUsage));
        solarEstimateState.currentScenarioKey = matchedScenario ? matchedScenario.key : 'custom';
        return {
          sunPeakHour: solarEstimateState.currentSunPeakHour,
          morningUsage: solarEstimateState.currentMorningUsage
        };
      }

      function updateScenarioSummary() {
        const summaryEl = document.getElementById('solarScenarioSummary');
        if (!summaryEl) return;

        const scenario = solarScenarioConfig[solarEstimateState.currentScenarioKey];
        if (!scenario) {
          summaryEl.textContent = 'Custom assumptions: ' + Number(solarEstimateState.currentMorningUsage).toFixed(0) + '% morning offset at ' + Number(solarEstimateState.currentSunPeakHour).toFixed(1) + ' sun peak hour.';
          return;
        }

        summaryEl.textContent = scenario.label + ' (' + scenario.shortLabel + ', ' + Number(solarEstimateState.currentSunPeakHour).toFixed(1) + 'h sun peak): ' + scenario.summary;
      }

      function renderSolarUsageChart(data) {
        const chartGrid = document.getElementById('solarEstimateChartGrid');
        const chartHours = document.getElementById('solarEstimateChartHours');
        const chartEmpty = document.getElementById('solarEstimateChartEmpty');

        if (!chartGrid || !chartHours) return;

        if (!data || !data.charts || !Array.isArray(data.charts.electricityUsagePattern) || !Array.isArray(data.charts.solarGenerationPattern)) {
          chartGrid.innerHTML = '';
          chartHours.innerHTML = '';
          if (chartEmpty) {
            chartEmpty.style.display = 'block';
            chartEmpty.textContent = 'Enter an average TNB bill and choose a scenario to see the 24-hour offset chart.';
          }
          return;
        }

        const usagePattern = data.charts.electricityUsagePattern.slice(0, 24).map((entry) => Number(entry.usage) || 0);
        const solarPattern = data.charts.solarGenerationPattern.slice(0, 24).map((entry) => Number(entry.generation) || 0);
        const maxValue = Math.max(1, ...usagePattern, ...solarPattern);
        const rows = 10;
        const isCompact = window.innerWidth <= 768;
        const blockHeight = isCompact ? 10 : 14;
        const blockRadius = isCompact ? 3 : 4;
        const columnGap = isCompact ? 2 : 4;
        const labelFontSize = isCompact ? 9 : 10;

        const columnsHtml = usagePattern.map((usage, hour) => {
          const solar = solarPattern[hour] || 0;
          const usageUnits = Math.min(rows, Math.ceil((usage / maxValue) * rows));
          const solarUnits = Math.min(rows, Math.ceil((solar / maxValue) * rows));
          const offsetUnits = Math.min(usageUnits, solarUnits);

          const blocks = Array.from({ length: rows }, (_, levelIndex) => {
            const level = levelIndex + 1;
            let blockColor = 'transparent';
            let borderColor = 'rgba(203, 213, 225, 0.5)';

            if (level <= offsetUnits) {
              blockColor = '#6d97df';
              borderColor = '#dc6a6a';
            } else if (solarUnits > usageUnits && level <= solarUnits) {
              blockColor = '#6cab4f';
              borderColor = '#6cab4f';
            } else if (usageUnits > solarUnits && level <= usageUnits) {
              blockColor = '#dc6363';
              borderColor = '#dc6363';
            }

            return '<div style="height: ' + blockHeight + 'px; border-radius: ' + blockRadius + 'px; background: ' + blockColor + '; border: 1px solid ' + borderColor + ';"></div>';
          }).join('');

          return '<div style="display:flex; flex-direction:column-reverse; gap:' + columnGap + 'px;">' + blocks + '</div>';
        }).join('');

        const hourLabelsHtml = Array.from({ length: 24 }, (_, hour) => {
          const label = hour % 2 === 0
            ? new Date(Date.UTC(2000, 0, 1, hour, 0, 0)).toLocaleTimeString('en-US', {
                hour: 'numeric',
                hour12: true,
                timeZone: 'UTC'
              }).replace(/\s/g, '')
            : '';
          return '<div style="text-align:center; font-size:' + labelFontSize + 'px; font-weight:700; color:#64748b;">' + label + '</div>';
        }).join('');

        chartGrid.style.gap = columnGap + 'px';
        chartGrid.style.minHeight = isCompact ? '126px' : '176px';
        chartHours.style.gap = columnGap + 'px';

        chartGrid.innerHTML = columnsHtml;
        chartHours.innerHTML = hourLabelsHtml;

        if (chartEmpty) {
          chartEmpty.style.display = 'none';
          chartEmpty.textContent = '';
        }
      }

      function updateSolarSaveButtonVisibility(hasPreview) {
        const saveBtn = document.getElementById('saveSolarScenarioBtn');
        if (!saveBtn) return;
        saveBtn.style.display = hasPreview ? 'inline-flex' : 'none';
      }

      function applySolarEstimateToPage(data, options = {}) {
        const beforeValue = document.getElementById('solarEstimateBeforeValue');
        const afterValue = document.getElementById('solarEstimateAfterValue');
        const savingValue = document.getElementById('solarEstimateSavingValue');
        const saveHint = document.getElementById('solarEstimateSaveHint');
        const matchedBillHint = document.getElementById('solarMatchedBillHint');
        const cycleHint = document.getElementById('solarBillCycleHint');
        const requestedBill = Number(data.requested_bill_amount);
        const matchedBill = Number(data.customer_average_tnb);
        const selectedCycleMetrics = getSelectedSolarBillCycleMetrics(data, solarEstimateState.currentBillCycleMode);

        if (beforeValue) beforeValue.textContent = formatSolarEstimateMoney(data.customer_average_tnb);
        if (data && data.assumptions) {
          const assumptionSunPeak = Number(data.assumptions.sunPeakHour);
          const assumptionOffset = Number(data.assumptions.offsetPercent);
          const assumptionBillCycleMode = normalizeSolarBillCycleMode(data.assumptions.billCycleMode);
          if (Number.isFinite(assumptionSunPeak)) {
            solarEstimateState.currentSunPeakHour = Number(assumptionSunPeak.toFixed(2));
          }
          if (Number.isFinite(assumptionOffset)) {
            solarEstimateState.currentMorningUsage = Number(assumptionOffset.toFixed(2));
          }
          if (!options.preserveBillCycleMode) {
            solarEstimateState.currentBillCycleMode = assumptionBillCycleMode;
          }
          syncSolarParameterInputs();
        }

        if (afterValue) {
          afterValue.textContent = formatSolarEstimateMoney(
            selectedCycleMetrics ? selectedCycleMetrics.estimated_new_bill_amount : data.estimated_new_bill_amount
          );
        }
        if (savingValue) {
          savingValue.textContent = formatSolarEstimateMoney(
            selectedCycleMetrics ? selectedCycleMetrics.estimated_saving : data.estimated_saving
          );
        }

        if (matchedBillHint) {
          if (Number.isFinite(requestedBill) && Number.isFinite(matchedBill) && Math.abs(requestedBill - matchedBill) >= 0.01) {
            matchedBillHint.textContent = 'Requested bill RM ' + requestedBill.toFixed(2) + '. Closest matched TNB bill used for calculation: RM ' + matchedBill.toFixed(2) + '.';
            matchedBillHint.style.display = 'block';
          } else {
            matchedBillHint.textContent = '';
            matchedBillHint.style.display = 'none';
          }
        }

        if (cycleHint) {
          if (selectedCycleMetrics) {
            const cycleLabel = selectedCycleMetrics.label || (normalizeSolarBillCycleMode(solarEstimateState.currentBillCycleMode) === 'under28Days' ? '<28 Days Bill Cycle' : 'Full Month Bill Cycle');
            let hintText = cycleLabel + ' applied.';
            if (normalizeSolarBillCycleMode(solarEstimateState.currentBillCycleMode) === 'under28Days') {
              hintText += ' SST recalculated to RM ' + Number(selectedCycleMetrics.recalculatedSst || 0).toFixed(2) + ' based on 8% of usage + network + capacity.';
            }
            cycleHint.textContent = hintText;
            cycleHint.style.display = 'block';
          } else {
            cycleHint.textContent = '';
            cycleHint.style.display = 'none';
          }
        }

        renderSolarUsageChart(data);
        updateSolarScenarioButtons();
        updateSolarBillCycleButtons();
        updateScenarioSummary();
        updateSolarSaveButtonVisibility(Boolean(data && solarEstimateState.currentAverageBill));

        if (saveHint) {
          saveHint.textContent = options.saved
            ? 'Saved to this quotation.'
            : 'Preview updated. Save this scenario if you want these numbers stored in the quotation.';
          saveHint.style.display = options.showSaveHint ? 'block' : 'none';
        }

        updateSolarEstimateStatus(
          options.saved
            ? 'This quotation now includes the latest solar estimate for the selected day-usage scenario.'
            : 'Preview updated. Switch between scenarios to compare direct offset versus grid export.',
          options.saved ? 'success' : 'neutral'
        );
      }

      async function requestSolarEstimate(averageBill, options = {}) {
        const sunPeakHour = Number.isFinite(Number(options.sunPeakHour))
          ? Number(options.sunPeakHour)
          : Number(solarEstimateState.currentSunPeakHour);
        const morningUsage = Number.isFinite(Number(options.morningUsage))
          ? Number(options.morningUsage)
          : Number(solarEstimateState.currentMorningUsage);
        const billCycleMode = normalizeSolarBillCycleMode(
          options.billCycleMode !== undefined ? options.billCycleMode : solarEstimateState.currentBillCycleMode
        );

        const response = await fetch(solarEstimateEndpointBase + solarEstimateState.identifier + '/solar-estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            averageBill,
            save: Boolean(options.save),
            sunPeakHour,
            morningUsage,
            billCycleMode
          })
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to calculate solar estimate');
        }

        return result.data;
      }

      async function loadSolarScenarioPreview(scenarioKey, options = {}) {
        if (!solarEstimateState.currentAverageBill) {
          return openSolarEstimatePrompt(scenarioKey);
        }

        if (scenarioKey && solarScenarioConfig[scenarioKey]) {
          solarEstimateState.currentScenarioKey = scenarioKey;
          solarEstimateState.currentMorningUsage = Number(solarScenarioConfig[scenarioKey].morningUsage);
          syncSolarParameterInputs();
        }

        const params = readSolarParameterInputs();
        updateSolarScenarioButtons();
        updateScenarioSummary();

        const cacheKey = [
          String(solarEstimateState.currentAverageBill),
          Number(params.sunPeakHour).toFixed(2),
          Number(params.morningUsage).toFixed(2)
        ].join('::');
        if (!options.force && !options.save && solarEstimateState.cache[cacheKey]) {
          const cached = solarEstimateState.cache[cacheKey];
          solarEstimateState.latestPreview = cached;
          applySolarEstimateToPage(cached, { showSaveHint: true, saved: false, preserveBillCycleMode: true });
          return cached;
        }

        try {
          setSolarScenarioButtonsDisabled(true);
          if (options.loadingMessage) {
            updateSolarEstimateStatus(options.loadingMessage, 'neutral');
          }

          const data = await requestSolarEstimate(solarEstimateState.currentAverageBill, {
            save: options.save,
            sunPeakHour: params.sunPeakHour,
            morningUsage: params.morningUsage,
            billCycleMode: solarEstimateState.currentBillCycleMode
          });

          solarEstimateState.cache[cacheKey] = data;
          solarEstimateState.latestPreview = data;

          if (options.save) {
            solarEstimateState.savedEstimate = {
              customer_average_tnb: data.customer_average_tnb,
              estimated_new_bill_amount: data.estimated_new_bill_amount,
              estimated_saving: data.estimated_saving,
              solar_sun_peak_hour: Number(params.sunPeakHour),
              solar_morning_usage_percent: Number(params.morningUsage),
              selected_bill_cycle_mode: normalizeSolarBillCycleMode(solarEstimateState.currentBillCycleMode)
            };
            solarEstimateState.hasSavedEstimate = true;
          }

          applySolarEstimateToPage(data, {
            showSaveHint: true,
            saved: Boolean(options.save),
            preserveBillCycleMode: true
          });

          return data;
        } finally {
          setSolarScenarioButtonsDisabled(false);
        }
      }

      async function openSolarEstimatePrompt(preferredScenarioKey = solarEstimateState.currentScenarioKey) {
        if (!solarEstimateState.canEstimate || !solarEstimateState.identifier) {
          return Swal.fire({
            icon: 'info',
            title: 'Estimate Unavailable',
            text: 'This quotation package does not have enough panel details for solar estimation.',
            confirmButtonColor: '#0f172a'
          });
        }

        const { value: inputValue } = await Swal.fire({
          title: 'Recalculate Solar Saving',
          input: 'number',
          inputLabel: 'Average Monthly TNB Bill (RM)',
          inputPlaceholder: 'Enter your average bill amount',
          inputValue: solarEstimateState.currentAverageBill || '',
          inputAttributes: {
            min: '1',
            step: '1'
          },
          showCancelButton: true,
          confirmButtonText: 'Use This Bill',
          confirmButtonColor: '#059669',
          cancelButtonText: 'Cancel',
          preConfirm: (value) => {
            const numeric = Number(value);
            if (!Number.isFinite(numeric) || numeric <= 0) {
              Swal.showValidationMessage('Please enter a valid average TNB bill amount.');
              return false;
            }
            return Number(numeric.toFixed(2));
          }
        });

        if (!inputValue) {
          return null;
        }

        const billChanged = Number(inputValue) !== Number(solarEstimateState.currentAverageBill);
        solarEstimateState.currentAverageBill = Number(inputValue);
        solarEstimateState.currentScenarioKey = preferredScenarioKey;

        if (billChanged) {
          solarEstimateState.cache = {};
          solarEstimateState.latestPreview = null;
        }

        await loadSolarScenarioPreview(preferredScenarioKey, {
          force: true,
          loadingMessage: 'Calculating the selected day-usage scenario...'
        });

        return true;
      }

      async function switchSolarScenario(scenarioKey) {
        if (!solarEstimateState.currentAverageBill) {
          return openSolarEstimatePrompt(scenarioKey);
        }

        try {
          await loadSolarScenarioPreview(scenarioKey, {
            loadingMessage: 'Updating the solar offset comparison...'
          });
        } catch (err) {
          await Swal.fire({
            icon: 'error',
            title: 'Scenario Update Failed',
            text: err.message,
            confirmButtonColor: '#0f172a'
          });
        }
      }

      async function refreshSolarEstimateWithCurrentInputs() {
        if (!solarEstimateState.currentAverageBill) {
          return openSolarEstimatePrompt();
        }

        try {
          await loadSolarScenarioPreview(null, {
            force: true,
            loadingMessage: 'Updating the solar assumptions...'
          });
        } catch (err) {
          await Swal.fire({
            icon: 'error',
            title: 'Update Failed',
            text: err.message,
            confirmButtonColor: '#0f172a'
          });
        }
      }

      function setSolarBillCycleMode(mode) {
        solarEstimateState.currentBillCycleMode = normalizeSolarBillCycleMode(mode);
        updateSolarBillCycleButtons();

        if (solarEstimateState.latestPreview) {
          applySolarEstimateToPage(solarEstimateState.latestPreview, {
            showSaveHint: true,
            saved: false,
            preserveBillCycleMode: true
          });
          updateSolarEstimateStatus('Preview updated for ' + (solarEstimateState.currentBillCycleMode === 'under28Days' ? '<28 Days Bill Cycle.' : 'Full Month Bill Cycle.'), 'neutral');
          return;
        }

        if (solarEstimateState.savedEstimate) {
          updateSolarEstimateStatus('Saved estimate shown for ' + (solarEstimateState.currentBillCycleMode === 'under28Days' ? '<28 Days Bill Cycle.' : 'Full Month Bill Cycle.'), 'neutral');
        }
      }

      async function saveCurrentSolarScenario() {
        if (!solarEstimateState.currentAverageBill) {
          return openSolarEstimatePrompt(solarEstimateState.currentScenarioKey);
        }

        try {
          Swal.fire({
            title: 'Saving...',
            text: 'Updating this quotation with the selected scenario.',
            allowOutsideClick: false,
            allowEscapeKey: false,
            didOpen: () => Swal.showLoading()
          });

          await loadSolarScenarioPreview(solarEstimateState.currentScenarioKey, {
            force: true,
            save: true
          });

          await Swal.fire({
            icon: 'success',
            title: 'Scenario Saved',
            text: 'The quotation now stores the currently selected day-usage scenario.',
            confirmButtonColor: '#059669'
          });
        } catch (err) {
          await Swal.fire({
            icon: 'error',
            title: 'Save Failed',
            text: err.message,
            confirmButtonColor: '#0f172a'
          });
        }
      }

      async function initializeSolarScenarioEstimate() {
        syncSolarParameterInputs();
        updateSolarScenarioButtons();
        updateSolarBillCycleButtons();
        updateScenarioSummary();

        if (!solarEstimateState.canEstimate || !solarEstimateState.currentAverageBill) {
          renderSolarUsageChart(null);
          updateSolarSaveButtonVisibility(false);
          return;
        }

        try {
          const billAmount = solarEstimateState.currentAverageBill;
          const initialData = await requestSolarEstimate(billAmount, {
            sunPeakHour: solarEstimateState.currentSunPeakHour,
            morningUsage: solarEstimateState.currentMorningUsage,
            billCycleMode: solarEstimateState.currentBillCycleMode
          });
          if (solarEstimateState.hasSavedEstimate) {
            solarEstimateState.currentBillCycleMode = inferSolarBillCycleModeFromSavedEstimate(initialData);
          } else if (initialData && initialData.selected_bill_cycle_mode) {
            solarEstimateState.currentBillCycleMode = normalizeSolarBillCycleMode(initialData.selected_bill_cycle_mode);
          }
          solarEstimateState.cache[
            [
              String(billAmount),
              Number(solarEstimateState.currentSunPeakHour).toFixed(2),
              Number(solarEstimateState.currentMorningUsage).toFixed(2)
            ].join('::')
          ] = initialData;
          solarEstimateState.latestPreview = initialData;
          applySolarEstimateToPage(initialData, {
            showSaveHint: false,
            saved: solarEstimateState.hasSavedEstimate,
            preserveBillCycleMode: true
          });
        } catch (err) {
          renderSolarUsageChart(null);
          updateSolarEstimateStatus('Saved estimate shown. Use Recalculate if you want to compare day-usage scenarios again.', 'warning');
        }
      }

      document.addEventListener('DOMContentLoaded', initializeSolarScenarioEstimate);

      function resetSignature() {
        Swal.fire({
          title: 'Re-sign Document?',
          text: "This will allow you to clear and replace the current signature.",
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#0f172a',
          cancelButtonColor: '#f1f5f9',
          confirmButtonText: 'Yes, Re-sign',
          cancelButtonText: 'Cancel'
        }).then((result) => {
          if (result.isConfirmed) {
            openSignatureModal();
          }
        });
      }
    </script>
    `;
}

function buildInvoiceInteractiveSupport(options) {
    return [
        buildFloatingA4PreviewButton(options.identifier),
        buildSignatureModalHtml(),
        buildInvoiceInteractionScript(options)
    ].join('\n');
}

module.exports = {
    buildInvoiceInteractiveSupport
};
