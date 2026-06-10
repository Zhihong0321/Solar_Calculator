// invoiceHtmlGeneratorV2InteractiveSupport.js

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
        <span>PRINTABLE</span>
      </button>
    </div>
    `;
}

function buildSignatureModalHtml() {
    return `
    <!-- Signature Modal -->
    <div id="signatureModal" class="sig-modal no-print" aria-hidden="true">
      <div class="sig-modal-card" id="signatureBox">
        <div class="sig-modal-head">
          <div>
            <h3 class="sig-modal-title">Customer Signature</h3>
            <p class="sig-modal-sub">Please sign within the box below</p>
          </div>
          <button onclick="closeSignatureModal()" class="sig-modal-close" aria-label="Close">✕</button>
        </div>
        <div class="sig-modal-body">
          <div class="sig-pad-wrap">
            <canvas id="signatureCanvas" class="sig-canvas"></canvas>
          </div>
          <div class="sig-modal-actions">
            <button onclick="clearSignature()" class="sig-action-link">Clear Space</button>
            <div class="sig-action-group">
              <button onclick="closeSignatureModal()" class="sig-action-cancel">Cancel</button>
              <button onclick="saveSignature()" id="saveSignBtn" class="sig-action-confirm">
                Confirm &amp; Sign
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
    estimatedMonthlySaving
}) {
    if (!hasSolarSavingsSection) {
        return 'null';
    }

    return `{
          customer_average_tnb: ${toFixedLiteral(beforeSolarBill, 2)},
          estimated_new_bill_amount: ${toFixedLiteral(afterSolarBill, 2)},
          estimated_saving: ${toFixedLiteral(estimatedMonthlySaving, 2)},
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
        estimatedMonthlySaving
    });

    return `
    <script>
      let signaturePad;
      const modal = document.getElementById('signatureModal');
      const box = document.getElementById('signatureBox');
      const canvas = document.getElementById('signatureCanvas');

      function openSignatureModal() {
        modal.classList.add('is-open');
        setTimeout(() => {
          box.classList.add('is-visible');
          resizeCanvas();
          if (!signaturePad) {
            signaturePad = new SignaturePad(canvas, {
              backgroundColor: 'rgba(255, 255, 255, 0)',
              penColor: '#0a0a0a'
            });
          }
        }, 10);
      }

      function closeSignatureModal() {
        box.classList.remove('is-visible');
        setTimeout(() => modal.classList.remove('is-open'), 180);
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
          return Swal.fire({ icon: 'warning', title: 'Empty Signature', text: 'Please provide your signature before confirming.', confirmButtonColor: '#0a0a0a' });
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
            }).then(() => window.location.reload());
          } else {
            throw new Error(result.error || 'Failed to save signature');
          }
        } catch (err) {
          Swal.fire({ icon: 'error', title: 'Error', text: err.message, confirmButtonColor: '#0a0a0a' });
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
        window.open('/view/' + shareToken + '?layout=a4&mono=1', '_blank', 'noopener');
      }

      async function quickShareInvoice(identifier, invoiceNumber, documentType) {
        const shareUrl = window.location.origin + '/view/' + identifier;
        const shareTitle = [documentType, invoiceNumber].filter(Boolean).join(' ').trim() || 'Invoice';

        try {
          if (navigator.share) {
            await navigator.share({ title: shareTitle, text: shareTitle, url: shareUrl });
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
          Swal.fire({ icon: 'error', title: 'Share Failed', text: 'Unable to share this invoice right now.', confirmButtonColor: '#0a0a0a' });
        }
      }

      // === Solar estimate (simplified) ===
      const solarEstimateEndpointBase = window.location.pathname.startsWith('/view2/') ? '/view2/' : '/view/';
      const solarEstimateState = {
        identifier: ${JSON.stringify(identifier)},
        hasSavedEstimate: ${hasSolarSavingsSection ? 'true' : 'false'},
        canEstimate: ${canEstimateSolarSavings ? 'true' : 'false'},
        currentAverageBill: ${toFixedLiteral(beforeSolarBill, 2)},
        currentAfaRate: 0,
        currentSunPeakHour: ${toFixedLiteral(storedSunPeakHour ?? 3.4, 2)},
        currentMorningUsage: ${toFixedLiteral(storedMorningUsagePercent ?? 30, 2)},
        currentBillCycleMode: 'fullMonth',
        latestPreview: null,
        savedEstimate: ${savedEstimateLiteral}
      };

      function formatSolarEstimateMoney(value) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? 'RM ' + numeric.toFixed(2) : 'RM —';
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
        if (!modes) return normalizeSolarBillCycleMode(solarEstimateState.currentBillCycleMode);

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

      function updateSolarBillCycleButtons() {
        ['fullMonth', 'under28Days'].forEach((modeKey) => {
          const button = document.getElementById('solarBillCycleBtn_' + modeKey);
          if (!button) return;
          const isActive = normalizeSolarBillCycleMode(solarEstimateState.currentBillCycleMode) === modeKey;
          button.classList.toggle('is-active', isActive);
        });
      }

      function applySolarEstimateToPage(data, options = {}) {
        const beforeValue = document.getElementById('solarEstimateBeforeValue');
        const afterValue = document.getElementById('solarEstimateAfterValue');
        const savingValue = document.getElementById('solarEstimateSavingValue');
        const savingPercentValue = document.getElementById('solarEstimateSavingPercentValue');
        const yearOneValue = document.getElementById('solarEstimateYearOneValue');
        const beforeBarLabel = document.getElementById('solarEstimateBeforeBarLabel');
        const afterBarLabel = document.getElementById('solarEstimateAfterBarLabel');
        const afterBarFill = document.getElementById('solarEstimateAfterBarFill');
        const sunPeakValue = document.getElementById('solarEstimateSunPeakValue');
        const assumptionHint = document.getElementById('solarEstimateAssumptionHint');
        const saveHint = document.getElementById('solarEstimateSaveHint');
        const matchedBillHint = document.getElementById('solarMatchedBillHint');
        const cycleHint = document.getElementById('solarBillCycleHint');
        const selectedCycleMetrics = getSelectedSolarBillCycleMetrics(data, solarEstimateState.currentBillCycleMode);
        const beforeAmount = Number(data.customer_average_tnb);
        const afterAmount = Number(selectedCycleMetrics ? selectedCycleMetrics.estimated_new_bill_amount : data.estimated_new_bill_amount);
        const savingAmount = Number(selectedCycleMetrics ? selectedCycleMetrics.estimated_saving : data.estimated_saving);

        if (beforeValue) beforeValue.textContent = formatSolarEstimateMoney(data.customer_average_tnb);
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
        if (savingPercentValue) {
          savingPercentValue.textContent = Number.isFinite(beforeAmount) && beforeAmount > 0 && Number.isFinite(savingAmount)
            ? '−' + Math.round((savingAmount / beforeAmount) * 100) + '%'
            : '—';
        }
        if (yearOneValue) {
          yearOneValue.textContent = Number.isFinite(savingAmount)
            ? 'RM ' + (savingAmount * 12).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : '—';
        }
        if (beforeBarLabel) {
          beforeBarLabel.textContent = Number.isFinite(beforeAmount) ? 'RM ' + beforeAmount.toFixed(2) : 'RM —';
        }
        if (afterBarLabel) {
          afterBarLabel.textContent = Number.isFinite(afterAmount) ? 'RM ' + afterAmount.toFixed(2) : 'RM —';
        }
        if (afterBarFill) {
          const percent = Number.isFinite(beforeAmount) && beforeAmount > 0 && Number.isFinite(afterAmount)
            ? Math.max(3, Math.min(100, Math.round((afterAmount / beforeAmount) * 100)))
            : 30;
          afterBarFill.style.width = percent + '%';
        }
        if (data.assumptions) {
          if (Number.isFinite(Number(data.assumptions.sunPeakHour))) {
            solarEstimateState.currentSunPeakHour = Number(data.assumptions.sunPeakHour);
          }
          if (Number.isFinite(Number(data.assumptions.offsetPercent))) {
            solarEstimateState.currentMorningUsage = Number(data.assumptions.offsetPercent);
          }
          if (Number.isFinite(Number(data.assumptions.afaRate))) {
            solarEstimateState.currentAfaRate = Number(data.assumptions.afaRate);
          }
        }
        if (sunPeakValue) {
          sunPeakValue.innerHTML = Number.isFinite(Number(solarEstimateState.currentSunPeakHour))
            ? Number(solarEstimateState.currentSunPeakHour).toFixed(2) + '<span class="u">h</span>'
            : '—';
        }
        if (assumptionHint) {
          assumptionHint.textContent = 'AFA ' + Number(solarEstimateState.currentAfaRate || 0).toFixed(4)
            + ' RM/kWh · Sun peak ' + Number(solarEstimateState.currentSunPeakHour || 0).toFixed(2)
            + 'h · Day usage ' + Number(solarEstimateState.currentMorningUsage || 0).toFixed(0) + '%.';
          assumptionHint.style.display = 'block';
        }

        if (matchedBillHint) {
          const requestedBill = Number(data.requested_bill_amount);
          const matchedBill = Number(data.customer_average_tnb);
          if (Number.isFinite(requestedBill) && Number.isFinite(matchedBill) && Math.abs(requestedBill - matchedBill) >= 0.01) {
            matchedBillHint.textContent = 'Requested bill RM ' + requestedBill.toFixed(2) + '. Closest matched TNB bill used: RM ' + matchedBill.toFixed(2) + '.';
            matchedBillHint.style.display = 'block';
          } else {
            matchedBillHint.textContent = '';
            matchedBillHint.style.display = 'none';
          }
        }

        if (cycleHint) {
          if (selectedCycleMetrics) {
            const cycleLabel = selectedCycleMetrics.label || (normalizeSolarBillCycleMode(solarEstimateState.currentBillCycleMode) === 'under28Days' ? '<28 Days cycle' : 'Full Month cycle');
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

        if (saveHint) {
          saveHint.textContent = options.saved ? 'Saved to this quotation.' : 'Preview updated.';
          saveHint.style.display = options.showSaveHint ? 'block' : 'none';
        }

        updateSolarEstimateStatus(
          options.saved
            ? 'This quotation now includes the latest solar estimate.'
            : 'Preview updated. Switch between Full Month / <28 Days to compare.',
          options.saved ? 'success' : 'neutral'
        );
      }

      async function requestSolarEstimate(averageBill, options = {}) {
        const billCycleMode = normalizeSolarBillCycleMode(
          options.billCycleMode !== undefined ? options.billCycleMode : solarEstimateState.currentBillCycleMode
        );
        const sunPeakHour = Number(options.sunPeakHour !== undefined ? options.sunPeakHour : solarEstimateState.currentSunPeakHour);
        const morningUsage = Number(options.morningUsage !== undefined ? options.morningUsage : solarEstimateState.currentMorningUsage);
        const afaRate = Number(options.afaRate !== undefined ? options.afaRate : solarEstimateState.currentAfaRate);

        const response = await fetch(solarEstimateEndpointBase + solarEstimateState.identifier + '/solar-estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ averageBill, afaRate, sunPeakHour, morningUsage, billCycleMode })
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to calculate solar estimate');
        }
        return result.data;
      }

      async function openSolarEstimatePrompt() {
        if (!solarEstimateState.canEstimate || !solarEstimateState.identifier) {
          return Swal.fire({
            icon: 'info',
            title: 'Estimate Unavailable',
            text: 'This quotation package does not have enough panel details for solar estimation.',
            confirmButtonColor: '#0a0a0a'
          });
        }

        const { value: formValues } = await Swal.fire({
          title: 'Recalculate Solar Saving',
          html: '<div style="display:grid;gap:10px;text-align:left">'
            + '<label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#374151">Avg Bill (RM)<input id="solarRecalcAverageBill" type="number" min="1" step="1" value="' + (solarEstimateState.currentAverageBill || '') + '" style="width:100%;margin-top:4px;padding:9px;border:1px solid #d1d5db;border-radius:4px"></label>'
            + '<label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#374151">AFA (RM/kWh)<input id="solarRecalcAfaRate" type="number" step="0.0001" min="-0.5000" max="0.5000" value="' + Number(solarEstimateState.currentAfaRate || 0).toFixed(4) + '" style="width:100%;margin-top:4px;padding:9px;border:1px solid #d1d5db;border-radius:4px"></label>'
            + '<label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#374151">Sun Peak Hour<input id="solarRecalcSunPeakHour" type="number" min="3.0" max="4.5" step="0.1" value="' + Number(solarEstimateState.currentSunPeakHour || 3.4).toFixed(1) + '" style="width:100%;margin-top:4px;padding:9px;border:1px solid #d1d5db;border-radius:4px"></label>'
            + '<label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#374151">Morning Usage %<input id="solarRecalcMorningUsage" type="number" min="1" max="100" step="1" value="' + Number(solarEstimateState.currentMorningUsage || 30).toFixed(0) + '" style="width:100%;margin-top:4px;padding:9px;border:1px solid #d1d5db;border-radius:4px"></label>'
            + '</div>',
          showCancelButton: true,
          confirmButtonText: 'Recalculate',
          confirmButtonColor: '#0c5e3f',
          cancelButtonText: 'Cancel',
          focusConfirm: false,
          preConfirm: () => {
            const averageBill = Number(document.getElementById('solarRecalcAverageBill')?.value);
            const afaRate = Number(document.getElementById('solarRecalcAfaRate')?.value);
            const sunPeakHour = Number(document.getElementById('solarRecalcSunPeakHour')?.value);
            const morningUsage = Number(document.getElementById('solarRecalcMorningUsage')?.value);
            if (!Number.isFinite(averageBill) || averageBill <= 0) {
              Swal.showValidationMessage('Please enter a valid average TNB bill amount.');
              return false;
            }
            if (!Number.isFinite(afaRate) || afaRate < -0.5 || afaRate > 0.5) {
              Swal.showValidationMessage('AFA must be between -0.5000 and 0.5000 RM/kWh.');
              return false;
            }
            if (!Number.isFinite(sunPeakHour) || sunPeakHour < 3.0 || sunPeakHour > 4.5) {
              Swal.showValidationMessage('Sun Peak Hour must be between 3.0 and 4.5.');
              return false;
            }
            if (!Number.isFinite(morningUsage) || morningUsage < 1 || morningUsage > 100) {
              Swal.showValidationMessage('Morning Usage must be between 1% and 100%.');
              return false;
            }
            return {
              averageBill: Number(averageBill.toFixed(2)),
              afaRate: Number(afaRate.toFixed(4)),
              sunPeakHour: Number(sunPeakHour.toFixed(2)),
              morningUsage: Number(morningUsage.toFixed(2))
            };
          }
        });

        if (!formValues) return;

        solarEstimateState.currentAverageBill = Number(formValues.averageBill);
        solarEstimateState.currentAfaRate = Number(formValues.afaRate);
        solarEstimateState.currentSunPeakHour = Number(formValues.sunPeakHour);
        solarEstimateState.currentMorningUsage = Number(formValues.morningUsage);

        try {
          updateSolarEstimateStatus('Calculating…', 'neutral');
          const data = await requestSolarEstimate(solarEstimateState.currentAverageBill, formValues);
          solarEstimateState.latestPreview = data;
          if (solarEstimateState.hasSavedEstimate) {
            solarEstimateState.currentBillCycleMode = inferSolarBillCycleModeFromSavedEstimate(data);
          } else if (data && data.selected_bill_cycle_mode) {
            solarEstimateState.currentBillCycleMode = normalizeSolarBillCycleMode(data.selected_bill_cycle_mode);
          }
          updateSolarBillCycleButtons();
          applySolarEstimateToPage(data, { showSaveHint: false, saved: solarEstimateState.hasSavedEstimate });
        } catch (err) {
          updateSolarEstimateStatus('Update failed: ' + err.message, 'warning');
        }
      }

      function setSolarBillCycleMode(mode) {
        solarEstimateState.currentBillCycleMode = normalizeSolarBillCycleMode(mode);
        updateSolarBillCycleButtons();

        if (solarEstimateState.latestPreview) {
          applySolarEstimateToPage(solarEstimateState.latestPreview, { showSaveHint: true, saved: false, preserveBillCycleMode: true });
          updateSolarEstimateStatus('Preview updated for ' + (solarEstimateState.currentBillCycleMode === 'under28Days' ? '<28 Days cycle.' : 'Full Month cycle.'), 'neutral');
          return;
        }

        if (solarEstimateState.savedEstimate) {
          updateSolarEstimateStatus('Saved estimate shown for ' + (solarEstimateState.currentBillCycleMode === 'under28Days' ? '<28 Days cycle.' : 'Full Month cycle.'), 'neutral');
        }
      }

      async function initializeSolarScenarioEstimate() {
        updateSolarBillCycleButtons();

        if (!solarEstimateState.canEstimate || !solarEstimateState.currentAverageBill) {
          return;
        }

        try {
          const billAmount = solarEstimateState.currentAverageBill;
          const initialData = await requestSolarEstimate(billAmount);
          if (solarEstimateState.hasSavedEstimate) {
            solarEstimateState.currentBillCycleMode = inferSolarBillCycleModeFromSavedEstimate(initialData);
          } else if (initialData && initialData.selected_bill_cycle_mode) {
            solarEstimateState.currentBillCycleMode = normalizeSolarBillCycleMode(initialData.selected_bill_cycle_mode);
          }
          solarEstimateState.latestPreview = initialData;
          updateSolarBillCycleButtons();
          applySolarEstimateToPage(initialData, { showSaveHint: false, saved: solarEstimateState.hasSavedEstimate });
        } catch (err) {
          updateSolarEstimateStatus('Saved estimate shown. Use Recalculate if you want to compare a different bill.', 'warning');
        }
      }

      document.addEventListener('DOMContentLoaded', initializeSolarScenarioEstimate);

      function resetSignature() {
        Swal.fire({
          title: 'Re-sign Document?',
          text: 'This will allow you to clear and replace the current signature.',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#0a0a0a',
          cancelButtonColor: '#f1f5f9',
          confirmButtonText: 'Yes, Re-sign',
          cancelButtonText: 'Cancel'
        }).then((result) => {
          if (result.isConfirmed) openSignatureModal();
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
