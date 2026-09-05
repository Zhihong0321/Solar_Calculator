// EPP Rate Configuration
/**
 * @ai_context
 * SOURCE OF TRUTH WARNING:
 * This EPP_RATES object is currently the MASTER definition for bank rates.
 * It is NOT synced with the backend. Any changes to rates must be updated here manually.
 * Future Refactor: Move to database/system_parameters.
 */
const EPP_RATES = {
    "Maybank": { 6: 2.50, 12: 3.50, 24: 5.50, 36: 6.00, 48: 8.00, 60: 10.00 },
    "Public Bank": { 6: 2.50, 12: 3.50, 18: 4.00, 24: 5.50, 36: 6.00, 48: 8.00, 60: 10.00 },
    "Hong Leong Bank": { 12: 3.50, 24: 5.50, 36: 6.00, 48: 8.00, 60: 10.00 },
    "CIMB": { 6: 2.50, 12: 3.50 },
    "AM Bank": { 24: 7.00, 36: 9.00 },
    "UOB": { 6: 2.50, 12: 3.50, 24: 5.50, 48: 8.50, 68: 11.50 },
    "OCBC": { 6: 4.00, 12: 5.00, 18: 6.00, 24: 7.00, 36: 8.00, 48: 9.00 }
};

// ============================================
// CUSTOMER MANAGER INTEGRATION
// ============================================
// CustomerManager is loaded from /js/components/customerManager.js
// Initialize it in DOMContentLoaded for inline mode

const BANKS = Object.keys(EPP_RATES);
let paymentMethodCounter = 0;
let assignedReferralLeads = [];
let referralInvoiceFilterId = null;
let inlineVoucherStep = null;
let selectedDraftVouchers = [];
let loadedInvoiceItems = [];
let loadedPromotionSelections = {
    earnNowApplied: false,
    earthMonthApplied: false,
    parentsDayApplied: false
};
const MICRO_INVERTER_MODELS = [
    { id: 'mi_s2', name: 'SAJ M2-1.0K S2 Micro Inverter', price: 700, originalPrice: 1000 },
    { id: 'mi_s4', name: 'SAJ M2-1.8K S4 Micro Inverter', price: 1300, originalPrice: 1500 }
];
const BALLAST_UNIT_PRICE = 160;
const ATS_ADDON_PRICE = 1200;
const ATS_ADDON_DESCRIPTION = 'ADD ON ATS';
const ATS_DEFAULT_QTY = 1;
const LEGACY_INVOICE_PROMOTIONS_ENABLED = false; // PROMOS DISABLED — do not re-enable
const PARENTS_DAY_2026_ENABLED = true;
const APRIL_2026_PROMO_END = new Date('2026-07-01T00:00:00');

function isApril2026PromotionActive() {
    return LEGACY_INVOICE_PROMOTIONS_ENABLED && new Date() < APRIL_2026_PROMO_END;
}

function isParentsDay2026Active() {
    return PARENTS_DAY_2026_ENABLED && new Date() < APRIL_2026_PROMO_END;
}

const EXTRA_ITEMS_MAX_DISCOUNT_PERCENT = 5; // Max negative extra items = 5% of package price
// ── Discount Manager (2026-06-03 redesign) ────────────────────────────────────
// Guardrail: invoice total cannot go below nett_price.
//   - If nett_price is set: cap = price - nett_price (max allowable discount)
//   - If not set: cap = price * 0.07 (7% of package price)
// Everything that reduces the invoice counts toward the cap:
//   custom discounts + promotions + visible voucher discount
//   + hidden commission deductions + abs(negative extra items).
// CEO discount bypasses the cap entirely.

/**
 * Returns the maximum allowable discount (cap) for the current package.
 * Uses nett_price if set, otherwise falls back to 7% of package price.
 */
function getDiscountCap() {
    const packagePrice = parseFloat(document.getElementById('packagePrice')?.value || 0);
    const nettPrice = parseFloat(window.packageNettPrice) || 0;
    if (packagePrice <= 0) return 0;
    if (nettPrice > 0) {
        return Math.max(0, packagePrice - nettPrice);
    }
    return packagePrice * 0.07;
}

// Structured custom discounts: [{ id, type:'fixed'|'percent', value, description, amount }]
let customDiscounts = [];

function getVoucherHiddenDiscount() {
    return selectedDraftVouchers.reduce((sum, v) => {
        return sum + (parseFloat(v?.deductableFromCommission ?? v?.deductable_from_commission) || 0);
    }, 0);
}

function getCustomDiscountTotal() {
    return customDiscounts.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
}

// Vouchers that have `bypassMaxDiscount = true` have their visible discount
// AND their hidden commission cost excluded from the package discount cap.
// The voucher amount is still applied to the invoice total, it just does not
// consume the budget. See voucher.bypass_max_discount column in DB.
function getBypassingVoucherDiscount() {
    if (!Array.isArray(selectedDraftVouchers) || !selectedDraftVouchers.length) return 0;
    const packagePrice = parseFloat(document.getElementById('packagePrice')?.value || 0);
    return selectedDraftVouchers.reduce((sum, v) => {
        if (!v?.bypassMaxDiscount) return sum;
        let amount = 0;
        if (v?.discountAmount) amount = parseFloat(v.discountAmount) || 0;
        else if (v?.discountPercent) amount = (packagePrice * (parseFloat(v.discountPercent) || 0)) / 100;
        const hidden = parseFloat(v?.deductableFromCommission ?? v?.deductable_from_commission) || 0;
        return sum + amount + hidden;
    }, 0);
}

function getNonManualDiscountTotal() {
    const packagePrice = parseFloat(document.getElementById('packagePrice')?.value || 0);
    return getAppliedPromotionAmounts().totalAppliedAmount
        + getSelectedDraftVoucherTotal(packagePrice)
        + getVoucherHiddenDiscount()
        + Math.abs(getExtraItemsNegativeTotal());
}

// Total that actually counts against the cap. Vouchers with bypassMaxDiscount
// have their amounts removed so they can be applied even when the bound
// portion would otherwise exceed the budget. Manual discount / promo /
// negative extra items are never reduced by a bypass voucher.
function getTotalTowardMax() {
    return getCustomDiscountTotal() + getNonManualDiscountTotal() - getBypassingVoucherDiscount();
}

function getAvailableDiscount() {
    const cap = getDiscountCap();
    if (cap <= 0) return 0;
    return Math.max(0, cap - getTotalTowardMax());
}

function validateDiscountLimit() {
    const ceoDiscountActive = (document.getElementById('ceoDiscount')?.value?.trim() || '').length > 0;
    if (ceoDiscountActive) {
        window._maxDiscountExceeded = false;
        return true;
    }
    const cap = getDiscountCap();
    if (cap <= 0) {
        window._maxDiscountExceeded = false;
        return true;
    }
    if (getTotalTowardMax() > cap + 0.01) {
        window._maxDiscountExceeded = true;
        return false;
    }
    window._maxDiscountExceeded = false;
    return true;
}

function addCustomDiscount(type, value, description) {
    const packagePrice = parseFloat(document.getElementById('packagePrice')?.value || 0);
    const cap = getDiscountCap();
    let amount = 0;

    if (type === 'fixed') {
        amount = parseFloat(value) || 0;
    } else if (type === 'percent') {
        amount = packagePrice * ((parseFloat(value) || 0) / 100);
    } else if (type === 'max_minus_percent') {
        if (cap <= 0) return { ok: false, reason: 'No discount budget is configured for this package.' };
        const pct = parseFloat(value) || 0;
        if (pct < 0) return { ok: false, reason: 'Enter a percentage of 0 or above.' };
        const alreadyApplied = getTotalTowardMax() - getReplacedAmount(type);
        const reserve = packagePrice * (pct / 100);
        amount = cap - alreadyApplied - reserve;
        if (amount <= 0) return { ok: false, reason: `No room left after keeping ${pct}% quota (reserve RM ${reserve.toFixed(2)}, already used RM ${alreadyApplied.toFixed(2)}, budget RM ${cap.toFixed(2)}).` };
    } else if (type === 'max_minus_fixed') {
        // "Keep RM X Quota" — reserve a fixed RM amount from the discount budget.
        // Formula: cap - already_applied - fixedReserveAmount
        if (cap <= 0) return { ok: false, reason: 'No discount budget is configured for this package.' };
        const fixedReserve = parseFloat(value) || 0;
        if (fixedReserve < 0) return { ok: false, reason: 'Enter an amount of 0 or above.' };
        const alreadyApplied = getTotalTowardMax() - getReplacedAmount(type);
        amount = cap - alreadyApplied - fixedReserve;
        if (amount <= 0) return { ok: false, reason: `No room left after keeping RM ${fixedReserve.toFixed(2)} quota (already used RM ${alreadyApplied.toFixed(2)}, budget RM ${cap.toFixed(2)}).` };
    }

    amount = Math.max(0, amount);
    if (amount <= 0) return { ok: false, reason: 'Enter a discount amount greater than zero.' };

    if (cap > 0) {
        const replacedAmount = getReplacedAmount(type);
        const budgetAfterReplace = getAvailableDiscount() + replacedAmount;
        if (amount > budgetAfterReplace + 0.01) {
            return { ok: false, reason: `Only RM ${Math.max(0, budgetAfterReplace).toFixed(2)} of discount budget remains.` };
        }
    }

    const effectiveType = (type === 'max_minus_percent' || type === 'max_minus_fixed') ? 'fixed' : type;
    customDiscounts = customDiscounts.filter(d => {
        const dEffective = (d.type === 'max_minus_percent' || d.type === 'max_minus_fixed') ? 'fixed' : d.type;
        return dEffective !== effectiveType;
    });

    customDiscounts.push({ id: Date.now(), type, value, description: description || '', amount });
    syncDiscountGivenBridge();
    updateInvoicePreview();
    return { ok: true };
}

function getReplacedAmount(type) {
    const effectiveType = (type === 'max_minus_percent' || type === 'max_minus_fixed') ? 'fixed' : type;
    return customDiscounts
        .filter(d => ((d.type === 'max_minus_percent' || d.type === 'max_minus_fixed') ? 'fixed' : d.type) === effectiveType)
        .reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
}

function removeCustomDiscount(id) {
    customDiscounts = customDiscounts.filter(d => String(d.id) !== String(id));
    syncDiscountGivenBridge();
    updateInvoicePreview();
}

function syncDiscountGivenBridge() {
    const field = document.getElementById('discountGiven');
    if (!field) return;
    const ceoDiscountActive = (document.getElementById('ceoDiscount')?.value?.trim() || '').length > 0;
    if (ceoDiscountActive) return;

    const packagePrice = parseFloat(document.getElementById('packagePrice')?.value || 0);
    let fixedTotal = 0;
    customDiscounts.forEach(d => {
        if (d.type === 'fixed' || d.type === 'max_minus_percent' || d.type === 'max_minus_fixed') fixedTotal += parseFloat(d.amount) || 0;
        else if (d.type === 'percent') fixedTotal += packagePrice * ((parseFloat(d.value) || 0) / 100);
    });
    field.value = fixedTotal > 0 ? String(Number(fixedTotal.toFixed(2))) : '';
}

function renderAppliedDiscounts() {
    const list = document.getElementById('appliedDiscountsList');
    if (!list) return;
    list.innerHTML = '';
    customDiscounts.forEach(d => {
        const label = d.type === 'percent' ? `${d.value}%` : d.type === 'max_minus_percent' ? `Keep ${d.value}% Quota` : d.type === 'max_minus_fixed' ? `Keep RM ${(parseFloat(d.value) || 0).toFixed(2)} Quota` : `RM ${(parseFloat(d.value) || 0).toFixed(2)}`;
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-white p-3';
        row.innerHTML = `
            <div class="min-w-0 flex-1">
                <div class="text-sm font-semibold text-slate-900">Custom Discount (${label})</div>
                ${d.description ? `<div class="truncate text-xs text-slate-500">${d.description}</div>` : ''}
            </div>
            <div class="flex items-center gap-3">
                <span class="text-sm font-bold text-red-600">-RM ${(parseFloat(d.amount) || 0).toFixed(2)}</span>
                <button type="button" data-remove-discount="${d.id}" class="rounded-lg border border-red-200 px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50">Remove</button>
            </div>
        `;
        list.appendChild(row);
    });
    list.querySelectorAll('[data-remove-discount]').forEach(btn => {
        btn.addEventListener('click', () => removeCustomDiscount(btn.getAttribute('data-remove-discount')));
    });
}

function autoTrimCustomDiscounts() {
    const cap = getDiscountCap();
    if (cap <= 0 || customDiscounts.length === 0) return;

    const removed = [];
    while (getTotalTowardMax() > cap + 0.01 && customDiscounts.length > 0) {
        let biggestIdx = 0;
        for (let i = 1; i < customDiscounts.length; i++) {
            if ((parseFloat(customDiscounts[i].amount) || 0) > (parseFloat(customDiscounts[biggestIdx].amount) || 0)) {
                biggestIdx = i;
            }
        }
        removed.push(customDiscounts[biggestIdx]);
        customDiscounts.splice(biggestIdx, 1);
    }

    if (removed.length > 0) {
        syncDiscountGivenBridge();
        const lines = removed.map(d => {
            const label = d.type === 'percent' ? `${d.value}%` : d.type === 'max_minus_percent' ? `Keep ${d.value}% Quota` : d.type === 'max_minus_fixed' ? `Keep RM ${(parseFloat(d.value) || 0).toFixed(2)} Quota` : `RM ${(parseFloat(d.value) || 0).toFixed(2)}`;
            return `• ${label} (RM ${(parseFloat(d.amount) || 0).toFixed(2)})`;
        }).join('<br>');
        Swal.fire({
            icon: 'warning',
            title: 'Custom Discount Removed',
            html: `The following custom discount was removed because vouchers/promotions pushed the total over the maximum discount budget:<br><br>${lines}`,
            confirmButtonText: 'OK'
        });
    }
}

function updateDiscountSummaryBar() {
    const cap = getDiscountCap();
    const maxEl = document.getElementById('maxDiscountValue');
    const appliedEl = document.getElementById('appliedDiscountTotal');
    const hiddenEl = document.getElementById('hiddenDiscountConsumed');
    const bypassEl = document.getElementById('bypassedDiscountValue');
    const availEl = document.getElementById('availableDiscountValue');
    const note = document.getElementById('discountBudgetNote');
    const totalApplied = getTotalTowardMax();
    const bypassing = getBypassingVoucherDiscount();
    if (maxEl) maxEl.textContent = cap > 0 ? `RM ${cap.toFixed(2)}` : 'No cap';
    if (appliedEl) appliedEl.textContent = `RM ${totalApplied.toFixed(2)}`;
    if (hiddenEl) hiddenEl.textContent = `RM ${getVoucherHiddenDiscount().toFixed(2)}`;
    if (bypassEl) {
        bypassEl.textContent = `RM ${Math.max(0, bypassing).toFixed(2)}`;
        bypassEl.classList.toggle('text-purple-900', bypassing > 0);
    }
    if (availEl) availEl.textContent = cap > 0 ? `RM ${Math.max(0, cap - totalApplied).toFixed(2)}` : '—';
    if (note) {
        const packagePrice = parseFloat(document.getElementById('packagePrice')?.value || 0);
        const nettPrice = parseFloat(window.packageNettPrice) || 0;
        const pctNote = nettPrice > 0
            ? 'Discount budget = package price − nett price.'
            : 'No nett price set — fallback is 7% of package price.';
        note.textContent = cap > 0
            ? `Available = budget RM ${cap.toFixed(2)} − applied discounts. ${pctNote}`
            : 'No discount budget is configured for this package, so no cap is enforced.';
    }
}

function getCustomDiscountFixedTotal() {
    return customDiscounts
        .filter(d => d.type === 'fixed' || d.type === 'max_minus_percent' || d.type === 'max_minus_fixed')
        .reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
}

function getCustomDiscountPercentAmount() {
    const packagePrice = parseFloat(document.getElementById('packagePrice')?.value || 0);
    return customDiscounts
        .filter(d => d.type === 'percent')
        .reduce((sum, d) => sum + packagePrice * ((parseFloat(d.value) || 0) / 100), 0);
}

// ── Preset Discounts & Countdown (config-based — no DB columns) ───────────────
const DISCOUNT_PRESETS = [
    // { id: 'first5', description: 'Company first 5 customer of current month', amount: 500 },
    // { id: 'cd1', description: 'Countdown discount, confirm before {TIME} = Discount RM1000', amount: 1000, countdownExpiresAt: '2026-05-31T15:30:00+08:00' }
];

function formatCountdown(ms) {
    if (ms <= 0) return '00:00:00';
    const totalSec = Math.floor(ms / 1000);
    const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

function getCountdownRemaining(expiresAt) {
    if (!expiresAt) return null;
    const expiry = new Date(expiresAt).getTime();
    if (Number.isNaN(expiry)) return null;
    return expiry - Date.now();
}

function renderPresetDiscountCards() {
    const container = document.getElementById('presetDiscountsContainer');
    if (!container) return;
    container.innerHTML = '';

    DISCOUNT_PRESETS.forEach((preset) => {
        const remaining = getCountdownRemaining(preset.countdownExpiresAt);
        const expired = remaining !== null && remaining <= 0;
        const amount = parseFloat(preset.amount) || 0;
        const card = document.createElement('div');
        card.className = 'rounded-xl border border-rose-200 bg-rose-50 p-3';

        const descText = (preset.description || '').replace('{TIME}',
            preset.countdownExpiresAt ? new Date(preset.countdownExpiresAt).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kuala_Lumpur' }) : '');

        if (expired) {
            card.innerHTML = `
                <div class="text-xs font-bold uppercase text-red-600">Expired</div>
                <div class="text-sm text-slate-500 line-through">${descText}</div>
                <div class="mt-1 text-sm font-bold text-slate-500">Discount: RM 0.00</div>
            `;
        } else {
            const countdownHtml = remaining !== null
                ? `<div class="mt-1 text-sm font-bold text-amber-600">Countdown: ${formatCountdown(remaining)}</div>`
                : '';
            card.innerHTML = `
                <div class="text-sm font-semibold text-slate-900">${descText}</div>
                ${countdownHtml}
                <div class="mt-1 flex items-center justify-between gap-3">
                    <span class="text-sm font-bold text-rose-700">Discount: RM ${amount.toFixed(2)}</span>
                    <button type="button" data-apply-preset="${preset.id}" class="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-white hover:bg-rose-700">Apply</button>
                </div>
            `;
        }
        container.appendChild(card);
    });

    container.querySelectorAll('[data-apply-preset]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const preset = DISCOUNT_PRESETS.find(p => String(p.id) === btn.getAttribute('data-apply-preset'));
            if (!preset) return;
            const rem = getCountdownRemaining(preset.countdownExpiresAt);
            if (rem !== null && rem <= 0) return;
            const result = addCustomDiscount('fixed', preset.amount, preset.description?.replace('{TIME}', '') || 'Preset discount');
            if (!result.ok) showCustomDiscountError(result.reason);
        });
    });
}

function tickPresetCountdowns() {
    if (!DISCOUNT_PRESETS.some(p => p.countdownExpiresAt)) return;
    renderPresetDiscountCards();
}

function renderDiscountVoucherSummary() {
    const container = document.getElementById('discountVoucherSummary');
    if (!container) return;
    container.innerHTML = '';
    if (!selectedDraftVouchers.length) return;

    const packagePrice = parseFloat(document.getElementById('packagePrice')?.value || 0);
    const heading = document.createElement('h3');
    heading.className = 'text-sm font-bold uppercase tracking-wide text-slate-500';
    heading.textContent = 'Selected Vouchers';
    container.appendChild(heading);

    selectedDraftVouchers.forEach((v) => {
        const fixedAmount = parseFloat(v?.discountAmount || 0) || 0;
        const percentValue = parseFloat(v?.discountPercent || 0) || 0;
        const visible = fixedAmount > 0 ? fixedAmount : packagePrice * (percentValue / 100);
        const hidden = parseFloat(v?.deductableFromCommission ?? v?.deductable_from_commission) || 0;
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3';
        row.innerHTML = `
            <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-semibold text-slate-900">${v?.title || 'Voucher'}</div>
                <div class="text-xs text-slate-500">${v?.code || ''}${hidden > 0 ? ` • Commission Deduct: RM ${hidden.toFixed(2)}` : ''}</div>
            </div>
            <span class="text-sm font-bold text-amber-700">-RM ${visible.toFixed(2)}</span>
        `;
        container.appendChild(row);
    });
}

function showCustomDiscountError(message) {
    const el = document.getElementById('customDiscountError');
    if (!el) return;
    if (!message) {
        el.classList.add('hidden');
        el.textContent = '';
        return;
    }
    el.textContent = message;
    el.classList.remove('hidden');
}

// Seed custom discounts from existing invoice discount items when editing.
function hydrateCustomDiscountsFromInvoice(items) {
    customDiscounts = [];
    const ceoActive = (document.getElementById('ceoDiscount')?.value?.trim() || '').length > 0;
    if (ceoActive) return; // CEO discount owns the discount line; don't duplicate.
    (Array.isArray(items) ? items : []).forEach((item) => {
        const type = String(item?.inv_item_type || item?.item_type || '').toLowerCase();
        if (type !== 'discount') return;
        const amount = Math.abs(parseFloat(item?.amount) || 0);
        if (amount <= 0) return;
        const rawDesc = item?.description || '';
        // Skip promotion-generated discount lines (those are managed by promo toggles).
        if (/earn now|earth month|parents'? day|cny|holiday boost/i.test(rawDesc)) return;
        // Strip the trailing amount suffix the backend appends ("(RM 111)" or
        // "(15%)") so the stored description stays clean and re-saving does not
        // double-wrap it. Bare legacy "Discount" collapses to empty (fallback).
        const strippedDesc = rawDesc.replace(/\s*\((?:RM\s*[\d.,]+|[\d.]+%)\)\s*$/i, '').trim();
        const desc = strippedDesc.toLowerCase() === 'discount' ? '' : strippedDesc;
        customDiscounts.push({ id: Date.now() + Math.floor(Math.random() * 100000), type: 'fixed', value: amount, description: desc, amount });
    });
    syncDiscountGivenBridge();
}

function initDiscountSection() {
    const promo = document.getElementById('promotionOptionsSection');
    const slot = document.getElementById('promotionOptionsSlot');
    if (promo && slot && promo.parentElement !== slot) {
        slot.appendChild(promo);
    }

    // Wire preset description selector toggle
    const presetSelect = document.getElementById('discountDescriptionPreset');
    const customDescInput = document.getElementById('customDiscountDescription');
    if (presetSelect && !presetSelect.dataset.wired) {
        presetSelect.dataset.wired = '1';
        presetSelect.addEventListener('change', () => {
            if (presetSelect.value === '__custom__') {
                customDescInput?.classList.remove('hidden');
                presetSelect.classList.add('hidden');
                customDescInput?.focus();
            }
        });
        if (customDescInput) {
            customDescInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    customDescInput.classList.add('hidden');
                    presetSelect.classList.remove('hidden');
                    presetSelect.value = '';
                    customDescInput.value = '';
                }
            });
        }
    }

    const addBtn = document.getElementById('addCustomDiscountBtn');
    if (addBtn && !addBtn.dataset.wired) {
        addBtn.dataset.wired = '1';
        addBtn.addEventListener('click', () => {
            const type = document.getElementById('customDiscountType')?.value || 'fixed';
            const value = document.getElementById('customDiscountValue')?.value || '';

            // Resolve preset description with substitutions
            let description = '';
            const presetVal = document.getElementById('discountDescriptionPreset')?.value || '';
            if (presetVal && presetVal !== '__custom__') {
                const customerName = document.getElementById('customerName')?.value || 'Customer';
                const now = new Date();
                const monthNames = ['January','February','March','April','May','June',
                                    'July','August','September','October','November','December'];
                const currentMonth = monthNames[now.getMonth()];
                description = presetVal
                    .replace(/\{customer_name\}/gi, customerName)
                    .replace(/\{current_month\}/gi, currentMonth);
            } else {
                description = customDescInput?.value || '';
            }

            const result = addCustomDiscount(type, value, description);
            if (!result.ok) {
                showCustomDiscountError(result.reason);
            } else {
                showCustomDiscountError(null);
                const valueInput = document.getElementById('customDiscountValue');
                if (valueInput) valueInput.value = '';
                if (customDescInput) customDescInput.value = '';
                const preset = document.getElementById('discountDescriptionPreset');
                if (preset) {
                    preset.value = '';
                    preset.classList.remove('hidden');
                    customDescInput?.classList.add('hidden');
                }
            }
        });
    }

    renderPresetDiscountCards();
    if (!window._presetCountdownTimer) {
        window._presetCountdownTimer = window.setInterval(tickPresetCountdowns, 1000);
    }
}

function getMicroInverterItems() {
    const items = [];
    MICRO_INVERTER_MODELS.forEach(model => {
        const qtyInput = document.getElementById(`${model.id}_qty`);
        const qty = parseInt(qtyInput?.value, 10) || 0;
        if (qty > 0) {
            items.push({
                description: `${model.name} (RM${model.originalPrice.toLocaleString()} → RM${model.price.toLocaleString()})`,
                qty,
                unit_price: model.price,
                total_price: qty * model.price,
                item_kind: 'micro_inverter'
            });
        }
    });
    return items;
}

function isMicroInverterItem(item) {
    if (!item) return false;
    const normalizedDescription = String(item.description || '').toUpperCase();
    return normalizedDescription.includes('MICRO INVERTER')
        || normalizedDescription.includes('M2-1.0K-S2')
        || normalizedDescription.includes('M2-1.8K-S4');
}

function hydrateMicroInverterFromItems(items = []) {
    MICRO_INVERTER_MODELS.forEach((model) => {
        const input = document.getElementById(`${model.id}_qty`);
        if (input) input.value = '0';
    });

    items.forEach((item) => {
        const description = String(item.description || '').toUpperCase();
        const qty = parseInt(item.qty, 10) || 0;

        if (description.includes('M2-1.0K') && description.includes('S2')) {
            const input = document.getElementById('mi_s2_qty');
            if (input) input.value = String(Math.max(0, qty));
        }

        if ((description.includes('M2-1.8K') || description.includes('M4-1.8K')) && description.includes('S4')) {
            const input = document.getElementById('mi_s4_qty');
            if (input) input.value = String(Math.max(0, qty));
        }
    });
}

function getCurrentPanelQty() {
    return Math.max(0, parseInt(window.currentPanelQty, 10) || 0);
}

function updateBallastLimitText() {
    const limitText = document.getElementById('ballastLimitText');
    const ballastInput = document.getElementById('ballastQty');
    const maxBallast = getCurrentPanelQty();

    if (ballastInput) {
        ballastInput.max = String(maxBallast);
    }

    if (limitText) {
        limitText.textContent = `Default: 0 ballast. Max: ${maxBallast} ballast.`;
    }
}

function setBallastQty(value) {
    const ballastInput = document.getElementById('ballastQty');
    if (!ballastInput) return 0;

    const normalizedQty = Math.max(0, Math.min(parseInt(value, 10) || 0, getCurrentPanelQty()));
    ballastInput.value = String(normalizedQty);
    updateBallastLimitText();
    return normalizedQty;
}

function getBallastQty() {
    const ballastInput = document.getElementById('ballastQty');
    if (!ballastInput) return 0;

    return setBallastQty(ballastInput.value);
}

function getBallastItem() {
    const qty = getBallastQty();
    if (qty <= 0) return null;

    return {
        description: `Upgrade ${qty} panel with Ballast System.`,
        qty: qty,
        unit_price: BALLAST_UNIT_PRICE,
        total_price: qty * BALLAST_UNIT_PRICE,
        item_kind: 'ballast'
    };
}

function updateAtsHelpText() {
    const helpText = document.getElementById('atsHelpText');
    const atsToggle = document.getElementById('atsEnabled');
    const qty = Math.max(0, parseInt(document.getElementById('atsQty')?.value, 10) || 0);

    if (atsToggle) {
        atsToggle.checked = qty > 0;
    }

    if (helpText) {
        helpText.textContent = qty > 0
            ? `${qty} unit${qty === 1 ? '' : 's'} × RM ${ATS_ADDON_PRICE} = RM ${(qty * ATS_ADDON_PRICE).toLocaleString()}.`
            : `Not added. Tick to add ${ATS_DEFAULT_QTY} unit.`;
    }
}

function setAtsQty(value) {
    const atsInput = document.getElementById('atsQty');
    if (!atsInput) return 0;

    const normalizedQty = Math.max(0, parseInt(value, 10) || 0);
    atsInput.value = String(normalizedQty);
    updateAtsHelpText();
    return normalizedQty;
}

function getAtsQty() {
    const atsInput = document.getElementById('atsQty');
    if (!atsInput) return 0;

    return setAtsQty(atsInput.value);
}

function getAtsItem() {
    const qty = getAtsQty();
    if (qty <= 0) return null;

    return {
        description: ATS_ADDON_DESCRIPTION,
        qty: qty,
        unit_price: ATS_ADDON_PRICE,
        total_price: qty * ATS_ADDON_PRICE,
        item_kind: 'ats'
    };
}

function wireAtsSection() {
    const atsToggle = document.getElementById('atsEnabled');
    const atsInput = document.getElementById('atsQty');

    const afterAtsChange = () => {
        // The ATS card and the hybrid ATS banner must never both emit an ATS line.
        if (getAtsQty() > 0 && hasATSInManualItems()) {
            manualItems = manualItems.filter(item => !isATSItem(item));
            renderManualItems();
        }
        syncATSAddonBanner();
        updateInvoicePreview();
    };

    if (atsToggle) {
        atsToggle.addEventListener('change', () => {
            setAtsQty(atsToggle.checked ? ATS_DEFAULT_QTY : 0);
            afterAtsChange();
        });
    }

    if (atsInput) {
        atsInput.addEventListener('input', afterAtsChange);
        atsInput.addEventListener('change', afterAtsChange);
    }

    updateAtsHelpText();
}

function isBallastItem(item) {
    if (!item) return false;

    const description = String(item.description || '').trim();
    const qty = parseInt(item.qty, 10) || 0;
    const unitPrice = parseFloat(item.unit_price) || 0;
    const totalPrice = parseFloat(item.total_price) || parseFloat(item.amount) || 0;

    return /Upgrade\s+\d+\s+panel\s+with\s+Ballast\s+System\.?/i.test(description)
        && qty > 0
        && (Math.abs(unitPrice - BALLAST_UNIT_PRICE) < 0.01 || Math.abs(totalPrice - (qty * BALLAST_UNIT_PRICE)) < 0.01);
}

function isATSItem(item) {
    if (!item) return false;
    return String(item.description || '').trim().toUpperCase().includes('ADD ON ATS')
        || String(item.description || '').trim().toUpperCase() === 'ATS';
}

function isHybridPackage(packageName) {
    const name = String(packageName || '').toUpperCase();
    return name.includes('HYBRID') || name.includes('HYBIRD');
}

function hasATSInManualItems() {
    return manualItems.some(item => isATSItem(item));
}

function hasATSInLoadedItems() {
    return Array.isArray(loadedInvoiceItems) && loadedInvoiceItems.some(item => isATSItem(item));
}

function syncATSAddonBanner() {
    const banner = document.getElementById('atsAddonBanner');
    const checkbox = document.getElementById('atsAddonCheckbox');
    if (!banner || !checkbox) return;

    const packageName = document.getElementById('packageName')?.value || '';
    const isHybrid = isHybridPackage(packageName);
    const alreadyHasATS = hasATSInManualItems() || hasATSInLoadedItems() || getAtsQty() > 0;

    if (isHybrid && !alreadyHasATS) {
        banner.classList.remove('hidden');
        checkbox.checked = false;
    } else {
        banner.classList.add('hidden');
        checkbox.checked = false;
    }
}

function onATSAddonToggle(checked) {
    // Remove any existing ATS item first
    manualItems = manualItems.filter(item => !isATSItem(item));

    if (checked) {
        setAtsQty(0);
        manualItems.push({
            id: 'item_ats_addon',
            description: ATS_ADDON_DESCRIPTION,
            qty: 1,
            unit_price: ATS_ADDON_PRICE,
            linked_product: null
        });
    }

    renderManualItems();
    updateInvoicePreview();
}

function getAdditionalInvoiceItems() {
    const items = manualItems
        .filter(item => (parseFloat(item.qty) || 0) > 0)
        .map(item => {
            const qty = parseFloat(item.qty) || 0;
            const unitPrice = parseFloat(item.unit_price) || 0;
            return {
                description: item.description,
                qty: qty,
                unit_price: unitPrice,
                total_price: qty * unitPrice,
                linked_product: item.linked_product || null,
                item_kind: 'manual'
            };
        });

    const ballastItem = getBallastItem();
    if (ballastItem) {
        items.push(ballastItem);
    }

    const atsItem = getAtsItem();
    if (atsItem) {
        items.push(atsItem);
    }

    getMicroInverterItems().forEach(item => items.push(item));

    return items;
}

function hideRetiredHybridUpgradeControls() {
    const section = document.getElementById('hybrid-upgrade-section');
    const select = document.getElementById('hybridUpgradeSelect');
    const helper = document.getElementById('hybridUpgradeHelper');
    const currentLabel = document.getElementById('hybridUpgradeCurrentLabel');
    const targetLabel = document.getElementById('hybridUpgradeTargetLabel');
    const amountLabel = document.getElementById('hybridUpgradeAmountLabel');
    const hiddenRuleInput = document.getElementById('hybridUpgradeRuleId');
    const warning = document.getElementById('hybridStockWarning');

    window.currentPackageHybridUpgradeData = null;

    if (hiddenRuleInput) hiddenRuleInput.value = '';
    if (select) {
        select.innerHTML = '<option value="">Hybrid upgrade retired</option>';
        select.value = '';
        select.disabled = true;
        select.onchange = null;
    }
    if (helper) helper.textContent = 'Hybrid upgrade has been retired. Change package directly instead.';
    if (currentLabel) currentLabel.textContent = 'Retired';
    if (targetLabel) targetLabel.textContent = 'Retired';
    if (amountLabel) amountLabel.textContent = 'RM 0.00';
    if (warning) warning.classList.add('hidden');
    if (section) section.classList.add('hidden');
}

async function loadHybridUpgradeOptions() {
    hideRetiredHybridUpgradeControls();
}

function getEarnNowRebateAmount(panelQty) {
    if (!isApril2026PromotionActive()) return 0;

    const qty = parseInt(panelQty, 10) || 0;
    if (qty >= 11 && qty <= 18) return 1000;
    if (qty >= 19 && qty <= 25) return 1500;
    if (qty >= 26 && qty <= 30) return 2000;
    if (qty >= 31 && qty <= 36) return 2500;
    return 0;
}

function getEarthMonthGoGreenBonusAmount(panelQty) {
    if (!isApril2026PromotionActive()) return 0;

    const qty = parseInt(panelQty, 10) || 0;
    if (qty >= 11 && qty <= 17) return 600;
    if (qty >= 18 && qty <= 24) return 1200;
    if (qty >= 25 && qty <= 36) return 1500;
    return 0;
}

function getParentsDayPromoAmount(panelQty) {
    if (!isParentsDay2026Active()) return 0;

    const qty = parseInt(panelQty, 10) || 0;
    if (qty >= 10 && qty <= 15) return 800;
    if (qty >= 16 && qty <= 19) return 1000;
    if (qty >= 20 && qty <= 29) return 1300;
    if (qty >= 30) return 1800;
    return 0;
}

function getAppliedPromotionAmounts(panelQty = window.currentPanelQty) {
    const normalizedPanelQty = parseInt(panelQty, 10) || 0;
    const earnNowEligibleAmount = getEarnNowRebateAmount(normalizedPanelQty);
    const earthMonthEligibleAmount = getEarthMonthGoGreenBonusAmount(normalizedPanelQty);
    const parentsDayEligibleAmount = getParentsDayPromoAmount(normalizedPanelQty);
    const earnNowToggle = document.getElementById('applyEarnNowRebate');
    const earthMonthToggle = document.getElementById('applyEarthMonthGoGreenBonus');
    const parentsDayToggle = document.getElementById('applyParentsDayPromo');
    const suriaRebateToggle = document.getElementById('applySuriaRebate');
    const promotionsEnabled = isApril2026PromotionActive();
    const isLoadedPromoEdit = Boolean(window.isEditMode);

    const earnNowAppliedAmount = (
        promotionsEnabled
            ? Boolean(earnNowToggle?.checked)
            : isLoadedPromoEdit && Boolean(loadedPromotionSelections.earnNowApplied)
    ) ? earnNowEligibleAmount : 0;

    const earthMonthAppliedAmount = (
        promotionsEnabled
            ? Boolean(earthMonthToggle?.checked)
            : isLoadedPromoEdit && Boolean(loadedPromotionSelections.earthMonthApplied)
    ) ? earthMonthEligibleAmount : 0;

    const parentsDayAppliedAmount = (
        isParentsDay2026Active()
            ? Boolean(parentsDayToggle?.checked)
            : isLoadedPromoEdit && Boolean(loadedPromotionSelections.parentsDayApplied)
    ) ? parentsDayEligibleAmount : 0;

    const suriaRebateAppliedAmount = 0;

    return {
        panelQty: normalizedPanelQty,
        earnNowEligibleAmount,
        earthMonthEligibleAmount,
        parentsDayEligibleAmount,
        earnNowAppliedAmount,
        earthMonthAppliedAmount,
        parentsDayAppliedAmount,
        suriaRebateAppliedAmount,
        totalAppliedAmount: earnNowAppliedAmount + earthMonthAppliedAmount + parentsDayAppliedAmount + suriaRebateAppliedAmount
    };
}

function updatePromotionOptionsUI() {
    const section = document.getElementById('promotionOptionsSection');
    const earnNowToggle = document.getElementById('applyEarnNowRebate');
    const earthMonthToggle = document.getElementById('applyEarthMonthGoGreenBonus');
    const parentsDayToggle = document.getElementById('applyParentsDayPromo');
    const earnNowAmountDisplay = document.getElementById('earnNowAmountDisplay');
    const earthMonthAmountDisplay = document.getElementById('earthMonthBonusAmountDisplay');
    const parentsDayAmountDisplay = document.getElementById('parentsDayAmountDisplay');
    const earnNowHint = document.getElementById('earnNowHint');
    const earthMonthHint = document.getElementById('earthMonthBonusHint');
    const parentsDayHint = document.getElementById('parentsDayHint');
    const promotionsEnabled = isApril2026PromotionActive();
    const parentsDayEnabled = isParentsDay2026Active();
    const hasPersistedPromo = false;
    const { panelQty, earnNowEligibleAmount, earthMonthEligibleAmount, parentsDayEligibleAmount } = getAppliedPromotionAmounts();

    // Promo card <label> elements (parent of each checkbox)
    const earnNowCard = earnNowToggle?.closest('label');
    const earthMonthCard = earthMonthToggle?.closest('label');
    const parentsDayCard = parentsDayToggle?.closest('label');

    // Show section if any promo is active
    if (section) {
        section.classList.toggle('hidden', !promotionsEnabled && !parentsDayEnabled && !hasPersistedPromo);
    }

    // Case 1: Both promos disabled — show persisted selections as read-only
    if (!promotionsEnabled && !parentsDayEnabled) {
        const hasLoadedEarnNow = Boolean(loadedPromotionSelections.earnNowApplied);
        const hasLoadedEarthMonth = Boolean(loadedPromotionSelections.earthMonthApplied);
        const hasLoadedParentsDay = Boolean(loadedPromotionSelections.parentsDayApplied);

        if (earnNowToggle) { earnNowToggle.checked = hasLoadedEarnNow; earnNowToggle.disabled = true; }
        if (earthMonthToggle) { earthMonthToggle.checked = hasLoadedEarthMonth; earthMonthToggle.disabled = true; }
        if (parentsDayToggle) { parentsDayToggle.checked = hasLoadedParentsDay; parentsDayToggle.disabled = true; }

        if (earnNowCard) earnNowCard.classList.toggle('hidden', !hasLoadedEarnNow);
        if (earthMonthCard) earthMonthCard.classList.toggle('hidden', !hasLoadedEarthMonth);
        if (parentsDayCard) parentsDayCard.classList.toggle('hidden', !hasLoadedParentsDay);

        if (!hasLoadedEarnNow && !hasLoadedEarthMonth && !hasLoadedParentsDay) return;

        if (earnNowAmountDisplay) earnNowAmountDisplay.textContent = `RM ${earnNowEligibleAmount.toFixed(2)}`;
        if (earthMonthAmountDisplay) earthMonthAmountDisplay.textContent = `RM ${earthMonthEligibleAmount.toFixed(2)}`;
        if (parentsDayAmountDisplay) parentsDayAmountDisplay.textContent = `RM ${parentsDayEligibleAmount.toFixed(2)}`;

        if (earnNowHint) earnNowHint.textContent = hasLoadedEarnNow
            ? 'This rebate was already applied to the quotation and will be preserved on save.'
            : 'Eligible for 11 to 36 solar panels only.';
        if (earthMonthHint) earthMonthHint.textContent = hasLoadedEarthMonth
            ? 'This bonus was already applied to the quotation and will be preserved on save.'
            : 'Eligible for 11 to 36 solar panels only.';
        if (parentsDayHint) parentsDayHint.textContent = hasLoadedParentsDay
            ? 'This discount was already applied to the quotation and will be preserved on save.'
            : 'Eligible for 11+ solar panels.';
        return;
    }

    // Case 2: Parents Day only (Earn Now / Earth Month disabled) — mixed state
    if (!promotionsEnabled && parentsDayEnabled) {
        const hasLoadedEarnNow = Boolean(loadedPromotionSelections.earnNowApplied);
        const hasLoadedEarthMonth = Boolean(loadedPromotionSelections.earthMonthApplied);

        if (earnNowToggle) { earnNowToggle.checked = hasLoadedEarnNow; earnNowToggle.disabled = true; }
        if (earthMonthToggle) { earthMonthToggle.checked = hasLoadedEarthMonth; earthMonthToggle.disabled = true; }

        if (earnNowCard) earnNowCard.classList.toggle('hidden', !hasLoadedEarnNow);
        if (earthMonthCard) earthMonthCard.classList.toggle('hidden', !hasLoadedEarthMonth);
        if (parentsDayCard) parentsDayCard.classList.remove('hidden');

        if (parentsDayToggle) {
            parentsDayToggle.disabled = parentsDayEligibleAmount <= 0;
            if (parentsDayToggle.disabled) parentsDayToggle.checked = false;
        }

        if (earnNowAmountDisplay) earnNowAmountDisplay.textContent = `RM ${earnNowEligibleAmount.toFixed(2)}`;
        if (earthMonthAmountDisplay) earthMonthAmountDisplay.textContent = `RM ${earthMonthEligibleAmount.toFixed(2)}`;
        if (parentsDayAmountDisplay) parentsDayAmountDisplay.textContent = `RM ${parentsDayEligibleAmount.toFixed(2)}`;

        if (earnNowHint) earnNowHint.textContent = hasLoadedEarnNow
            ? 'This rebate was already applied to the quotation and will be preserved on save.'
            : 'Eligible for 11 to 36 solar panels only.';
        if (earthMonthHint) earthMonthHint.textContent = hasLoadedEarthMonth
            ? 'This bonus was already applied to the quotation and will be preserved on save.'
            : 'Eligible for 11 to 36 solar panels only.';
        if (parentsDayHint) {
            if (parentsDayEligibleAmount > 0) {
                parentsDayHint.textContent = `${panelQty} panels detected. Toggle to apply this discount.`;
            } else {
                parentsDayHint.textContent = 'Eligible for 11+ solar panels.';
            }
        }
        return;
    }

    // Case 3: All promos active — fully interactive
    if (earnNowCard) earnNowCard.classList.remove('hidden');
    if (earthMonthCard) earthMonthCard.classList.remove('hidden');
    if (parentsDayCard) parentsDayCard.classList.remove('hidden');

    if (earnNowAmountDisplay) earnNowAmountDisplay.textContent = `RM ${earnNowEligibleAmount.toFixed(2)}`;
    if (earthMonthAmountDisplay) earthMonthAmountDisplay.textContent = `RM ${earthMonthEligibleAmount.toFixed(2)}`;
    if (parentsDayAmountDisplay) parentsDayAmountDisplay.textContent = `RM ${parentsDayEligibleAmount.toFixed(2)}`;

    if (earnNowToggle) {
        earnNowToggle.disabled = earnNowEligibleAmount <= 0;
        if (earnNowToggle.disabled) earnNowToggle.checked = false;
    }
    if (earthMonthToggle) {
        earthMonthToggle.disabled = earthMonthEligibleAmount <= 0;
        if (earthMonthToggle.disabled) earthMonthToggle.checked = false;
    }
    if (parentsDayToggle) {
        parentsDayToggle.disabled = parentsDayEligibleAmount <= 0;
        if (parentsDayToggle.disabled) parentsDayToggle.checked = false;
    }

    if (earnNowHint) {
        earnNowHint.textContent = earnNowEligibleAmount > 0
            ? `${panelQty} panels detected. Toggle to apply this rebate.`
            : 'Eligible for 11 to 36 solar panels only.';
    }

    if (earthMonthHint) {
        earthMonthHint.textContent = earthMonthEligibleAmount > 0
            ? `${panelQty} panels detected. Toggle to apply this bonus.`
            : 'Eligible for 11 to 36 solar panels only.';
    }

    if (parentsDayHint) {
        parentsDayHint.textContent = parentsDayEligibleAmount > 0
            ? `${panelQty} panels detected. Toggle to apply this discount.`
            : 'Eligible for 11+ solar panels.';
    }
}

function hydratePromotionSelections(items = []) {
    const earnNowToggle = document.getElementById('applyEarnNowRebate');
    const earthMonthToggle = document.getElementById('applyEarthMonthGoGreenBonus');
    const parentsDayToggle = document.getElementById('applyParentsDayPromo');
    const earnNowApplied = items.some((item) => String(item?.description || '').toLowerCase().includes('earn now rebate'));
    const earthMonthApplied = items.some((item) => String(item?.description || '').toLowerCase().includes('earth month go green bonus'));
    const parentsDayApplied = items.some((item) => String(item?.description || '').toLowerCase().includes('parents\' day promo') || String(item?.description || '').includes('双亲节'));

    loadedPromotionSelections = {
        earnNowApplied,
        earthMonthApplied,
        parentsDayApplied
    };

    if (earnNowToggle) {
        earnNowToggle.checked = earnNowApplied;
    }

    if (earthMonthToggle) {
        earthMonthToggle.checked = earthMonthApplied;
    }

    if (parentsDayToggle) {
        parentsDayToggle.checked = parentsDayApplied;
    }
}

// Calculate total negative amount from all extra items (manual)
function getExtraItemsNegativeTotal() {
    let negativeTotal = 0;
    getAdditionalInvoiceItems().forEach(item => {
        if (item.total_price < 0) negativeTotal += item.total_price;
    });
    return negativeTotal; // Will be <= 0
}

// Dynamic Additional Items State
let manualItems = [];

// Always in edit mode for this page
window.isEditMode = true;
window.editInvoiceId = null;
window.currentAgentMarkup = 0;
window.currentPanelRating = 0;
window.currentPackageType = '';
window.invoiceHasAnyPayment = false;
window.canChangePackage = false;

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getVisibleReferralLeads() {
    return assignedReferralLeads;
}

function formatReferralOptionLabel(referral) {
    const parts = [
        referral.name || 'Unnamed lead',
        referral.mobile_number || 'No phone',
        referral.status || 'Pending'
    ];
    return parts.join(' | ');
}

function renderAssignedReferralOptions(selectedReferralId = '') {
    const select = document.getElementById('assignedReferralSelect');
    if (!select) return;

    const options = ['<option value="">Manual customer entry</option>'];
    getVisibleReferralLeads().forEach((referral) => {
        const selected = String(selectedReferralId || '') === String(referral.bubble_id) ? 'selected' : '';
        options.push(
            `<option value="${referral.bubble_id}" ${selected}>${formatReferralOptionLabel(referral)}</option>`
        );
    });

    select.innerHTML = options.join('');
    select.value = selectedReferralId || '';
    document.getElementById('linkedReferral').value = selectedReferralId || '';
}

function applyAssignedReferralSelection(referralId, { autofill = true } = {}) {
    const normalizedId = referralId || '';
    const hiddenInput = document.getElementById('linkedReferral');
    if (hiddenInput) hiddenInput.value = normalizedId;

    const select = document.getElementById('assignedReferralSelect');
    if (select && select.value !== normalizedId) {
        select.value = normalizedId;
    }

    const referral = getVisibleReferralLeads().find((item) => item.bubble_id === normalizedId);
    if (!referral || !autofill) {
        return;
    }

    const customerName = document.getElementById('customerName');
    const customerPhone = document.getElementById('customerPhone');
    const customerAddress = document.getElementById('customerAddress');
    const leadSource = document.getElementById('customerLeadSource');
    const remark = document.getElementById('customerRemark');

    if (customerName) customerName.value = referral.name || '';
    if (customerPhone) customerPhone.value = referral.mobile_number || '';
    if (customerAddress) customerAddress.value = referral.address || referral.lead_address || '';
    if (leadSource) leadSource.value = 'referral';
    if (remark && !remark.value.trim()) {
        remark.value = `Assigned referral lead selected: ${referral.name || referral.bubble_id}`;
    }
}

async function fetchAssignedReferralLeads(selectedReferralId = '') {
    try {
        const response = await fetch('/api/v1/referrals/my-referrals', { credentials: 'same-origin' });
        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Failed to load assigned referral leads');
        }

        assignedReferralLeads = Array.isArray(result.data) ? result.data : [];
        renderAssignedReferralOptions(selectedReferralId);
    } catch (error) {
        console.error('Error loading assigned referral leads:', error);
    }
}

// Add a new manual item row
function addManualItem(data = { description: '', qty: 1, unit_price: 0, linked_product: null }) {
    const id = 'item_' + Math.random().toString(36).substr(2, 9);
    manualItems.push({ id, ...data });
    renderManualItems();
    updateInvoicePreview();
}

// Remove a manual item row
function removeManualItem(id) {
    manualItems = manualItems.filter(item => item.id !== id);
    renderManualItems();
    updateInvoicePreview();
}

// Update a manual item value
function updateManualItem(id, field, value) {
    const item = manualItems.find(i => i.id === id);
    if (item) {
        if (field === 'qty' || field === 'unit_price') {
            item[field] = parseFloat(value) || 0;
        } else {
            item[field] = value;
        }
        updateInvoicePreview();
    }
}

// Render the manual items list in UI
function renderManualItems() {
    const container = document.getElementById('manualItemsContainer');
    if (!container) return;

    if (manualItems.length === 0) {
        container.innerHTML = '<p class="text-xs text-indigo-400 italic py-2 text-center">No additional items added.</p>';
        return;
    }

    container.innerHTML = manualItems.map(item => `
                <div class="bg-white p-3 rounded border border-indigo-100 shadow-sm space-y-2" data-id="${item.id}">
                    <div class="flex gap-2">
                        <input 
                            type="text" 
                            placeholder="Description (e.g. Inverter Change)" 
                            class="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-indigo-500"
                            value="${item.description}"
                            onchange="updateManualItem('${item.id}', 'description', this.value)"
                        >
                        <button type="button" class="text-red-500 hover:text-red-700" onclick="removeManualItem('${item.id}')">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                    <div class="flex gap-4">
                        <div class="flex-1">
                            <label class="block text-[10px] font-bold text-gray-400 uppercase">Qty</label>
                            <input 
                                type="number" 
                                class="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-indigo-500"
                                value="${item.qty}"
                                onchange="updateManualItem('${item.id}', 'qty', this.value)"
                            >
                        </div>
                        <div class="flex-[2]">
                            <label class="block text-[10px] font-bold text-gray-400 uppercase">Unit Price (RM)</label>
                            <input 
                                type="number" 
                                step="0.01"
                                class="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-indigo-500"
                                value="${item.unit_price}"
                                onchange="updateManualItem('${item.id}', 'unit_price', this.value)"
                            >
                        </div>
                    </div>
                </div>
            `).join('');
}

// Parse discount string (same logic as backend)
function parseDiscount(discountStr) {
    if (!discountStr || !discountStr.trim()) {
        return { fixed: 0, percent: 0 };
    }

    let discountFixed = 0;
    let discountPercent = 0;

    const parts = discountStr.trim().replace('+', ' ').split(/\s+/);

    for (let part of parts) {
        part = part.trim();
        if (part.includes('%')) {
            discountPercent = parseFloat(part.replace('%', '')) || 0;
        } else {
            const value = parseFloat(part.replace(/RM|,/g, '')) || 0;
            if (value > 0) {
                discountFixed = value;
            }
        }
    }

    return { fixed: discountFixed, percent: discountPercent };
}

// Get available tenures for a bank
function getAvailableTenures(bank) {
    if (!bank || !EPP_RATES[bank]) return [];
    return Object.keys(EPP_RATES[bank])
        .filter(t => t !== 'foreign_card')
        .map(t => parseInt(t))
        .sort((a, b) => a - b);
}

// Get EPP rate for bank and tenure
function getEPPRate(bank, tenure) {
    if (!bank || !tenure || !EPP_RATES[bank]) return null;
    return EPP_RATES[bank][tenure] || null;
}

// Calculate EPP fee
function calculateEPPFee(amount, bank, tenure) {
    const rate = getEPPRate(bank, tenure);
    if (!rate) return 0;
    return amount * (rate / 100);
}

// Format amount with commas
function formatAmount(amount) {
    return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function updateWorkspaceStatuses() {
    window.InvoicePageShared.applyCommonWorkspaceStatuses({
        selectedDraftVoucherCount: selectedDraftVouchers.length,
        setSectionStatus: window.InvoicePageShared.setSectionStatus,
        refreshActiveWorkspaceSection: window.InvoicePageShared.refreshActiveWorkspaceSection
    });
}

function getSelectedDraftVoucherIds() {
    return selectedDraftVouchers
        .map((voucher) => String(voucher?.id || voucher?.bubble_id || ''))
        .filter(Boolean);
}

function getSelectedDraftVoucherTotal(packagePrice = parseFloat(document.getElementById('packagePrice')?.value || 0)) {
    return selectedDraftVouchers.reduce((sum, voucher) => {
        const fixedAmount = parseFloat(voucher?.discountAmount || 0) || 0;
        const percentAmount = (parseFloat(voucher?.discountPercent || 0) || 0) > 0
            ? packagePrice * ((parseFloat(voucher.discountPercent) || 0) / 100)
            : 0;
        return sum + fixedAmount + percentAmount;
    }, 0);
}

function buildDraftVoucherRows(packagePrice = parseFloat(document.getElementById('packagePrice')?.value || 0)) {
    return selectedDraftVouchers
        .map((voucher) => {
            const fixedAmount = parseFloat(voucher?.discountAmount || 0) || 0;
            const percentValue = parseFloat(voucher?.discountPercent || 0) || 0;
            const amount = fixedAmount > 0 ? fixedAmount : packagePrice * (percentValue / 100);
            if (amount <= 0) return null;
            return {
                id: String(voucher?.id || voucher?.bubble_id || ''),
                title: voucher?.title || voucher?.code || 'Voucher',
                code: voucher?.code || '',
                amount,
                label: fixedAmount > 0 ? `RM ${fixedAmount.toFixed(2)}` : `${percentValue}%`
            };
        })
        .filter(Boolean);
}

async function loadDraftVoucherStepForPackage(packageId, { selectedIds = [], scrollToSection = false } = {}) {
    const hint = document.getElementById('voucherInlineHint');
    const root = document.getElementById('voucherStepRoot');
    if (!root || !window.InvoiceVoucherStep) return;
    if (!packageId) {
        selectedDraftVouchers = [];
        root.classList.add('hidden');
        if (hint) {
            hint.textContent = 'Select a package to load available vouchers.';
            hint.classList.remove('hidden');
        }
        updateInvoicePreview();
        updateWorkspaceStatuses();
        return;
    }

    if (!inlineVoucherStep) {
        inlineVoucherStep = window.InvoiceVoucherStep.create(root, {
            title: 'Voucher Selection',
            subtitle: 'Adjust vouchers before saving so the new version already contains the right pricing.',
            showHeader: false,
            embedded: true,
            showFooter: false,
            onChange: ({ selectedVouchers = [] }) => {
                selectedDraftVouchers = selectedVouchers;
                updateInvoicePreview();
                updateWorkspaceStatuses();
            }
        });
    }

    try {
        const payload = await window.InvoicePageShared.fetchVoucherPreviewData(packageId);
        hint?.classList.add('hidden');
        root.classList.remove('hidden');
        await inlineVoucherStep.loadPayload(payload, {
            selectedIds
        });
        updateWorkspaceStatuses();
        if (scrollToSection) {
            window.InvoicePageShared.scrollToWorkspaceSection('voucher-selection');
        }
    } catch (error) {
        root.classList.add('hidden');
        selectedDraftVouchers = [];
        if (hint) {
            hint.textContent = error.message || 'Unable to load vouchers for this package.';
            hint.classList.remove('hidden');
        }
        updateInvoicePreview();
        updateWorkspaceStatuses();
    }
}

function updatePackageChangeControls() {
    const changeBtn = document.getElementById('changePackageBtn');
    const status = document.getElementById('packageChangeStatus');

    if (!changeBtn || !status) return;

    changeBtn.disabled = !window.canChangePackage;

    if (window.canChangePackage) {
        status.textContent = 'This invoice has no payment yet. You can search and replace the package before saving.';
        status.className = 'text-xs font-medium text-emerald-700 mt-1';
        return;
    }

    status.textContent = 'Package change is locked because this invoice already has payment records. Only invoices without any payment can change package.';
    status.className = 'text-xs font-medium text-red-600 mt-1';
}

function renderPackageSearchResults(resultsContainer, packages) {
    if (!resultsContainer) return;

    if (!Array.isArray(packages) || packages.length === 0) {
        resultsContainer.innerHTML = `
            <div class="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                No active package found for that panel rating and quantity.
            </div>
        `;
        return;
    }

    resultsContainer.innerHTML = packages.map(pkg => `
        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div class="min-w-0">
                    <div class="text-base font-semibold text-slate-900">${escapeHtml(pkg.package_name || 'Package')}</div>
                    <div class="mt-1 flex flex-wrap gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                        <span>${escapeHtml(pkg.panel_qty)} Panels</span>
                        <span>${escapeHtml(pkg.solar_output_rating || '-')}W</span>
                        <span>${escapeHtml(pkg.type || 'Package')}</span>
                    </div>
                    ${pkg.invoice_desc ? `<p class="mt-3 text-sm text-slate-600">${escapeHtml(pkg.invoice_desc)}</p>` : ''}
                </div>
                <div class="flex shrink-0 flex-col items-start gap-2 md:items-end">
                    <div class="text-lg font-bold text-slate-900">RM ${formatAmount(parseFloat(pkg.price) || 0)}</div>
                    <button
                        type="button"
                        class="select-package-result rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                        data-package-id="${escapeHtml(pkg.bubble_id)}"
                        data-package-name="${escapeHtml(pkg.package_name || 'Package')}"
                        data-panel-rating="${escapeHtml(pkg.solar_output_rating || '')}"
                    >
                        Use This Package
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

async function searchPackagesForReplacement({ panelQty, panelRating, resultsContainer, searchButton }) {
    if (!resultsContainer || !searchButton) return;

    searchButton.disabled = true;
    const originalText = searchButton.textContent;
    searchButton.textContent = 'Searching...';

    resultsContainer.innerHTML = `
        <div class="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            Searching available packages...
        </div>
    `;

    try {
        const params = new URLSearchParams({
            panelQty: String(panelQty),
            panelRating: String(panelRating)
        });

        if (window.currentPackageType) {
            params.set('type', window.currentPackageType);
        }

        const response = await fetch(`/api/packages/search?${params.toString()}`);
        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Failed to search packages');
        }

        renderPackageSearchResults(resultsContainer, result.packages || []);
    } catch (error) {
        resultsContainer.innerHTML = `
            <div class="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-600">
                ${escapeHtml(error.message || 'Failed to search packages')}
            </div>
        `;
    } finally {
        searchButton.disabled = false;
        searchButton.textContent = originalText;
    }
}

function openChangePackageModal() {
    if (!window.canChangePackage) {
        Swal.fire({
            icon: 'info',
            title: 'Package Change Locked',
            text: 'This invoice already has payment records, so the package cannot be changed.'
        });
        return;
    }

    Swal.fire({
        title: 'Change Package',
        width: '56rem',
        showConfirmButton: false,
        showCloseButton: true,
        html: `
            <div class="space-y-4 text-left">
                <p class="text-sm text-slate-600">
                    Search by panel rating and panel quantity, then choose the replacement package for this invoice.
                </p>
                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                        <label for="packageSearchPanelRating" class="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-600">Panel Rating (W)</label>
                        <input id="packageSearchPanelRating" type="number" min="1" step="1" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none" value="${escapeHtml(window.currentPanelRating || '')}" placeholder="e.g. 650">
                    </div>
                    <div>
                        <label for="packageSearchPanelQty" class="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-600">Panel Qty</label>
                        <input id="packageSearchPanelQty" type="number" min="1" step="1" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none" value="${escapeHtml(window.currentPanelQty || '')}" placeholder="e.g. 12">
                    </div>
                </div>
                <div class="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3">
                    <div class="text-xs text-slate-500">Current package: <span class="font-semibold text-slate-700">${escapeHtml(document.getElementById('packageName')?.value || 'Not selected')}</span></div>
                    <button id="packageSearchBtn" type="button" class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800">Search</button>
                </div>
                <div id="packageSearchResults" class="space-y-3">
                    <div class="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                        Enter a panel rating and quantity, then click Search.
                    </div>
                </div>
            </div>
        `,
        didOpen: () => {
            const popup = Swal.getPopup();
            if (!popup) return;

            const ratingInput = popup.querySelector('#packageSearchPanelRating');
            const qtyInput = popup.querySelector('#packageSearchPanelQty');
            const searchButton = popup.querySelector('#packageSearchBtn');
            const resultsContainer = popup.querySelector('#packageSearchResults');

            const runSearch = async () => {
                const panelRating = parseInt(ratingInput?.value, 10);
                const panelQty = parseInt(qtyInput?.value, 10);

                if (!Number.isInteger(panelRating) || panelRating <= 0 || !Number.isInteger(panelQty) || panelQty <= 0) {
                    resultsContainer.innerHTML = `
                        <div class="rounded-lg border border-red-200 bg-red-50 px-4 py-4 text-center text-sm text-red-600">
                            Please enter a valid panel rating and panel quantity.
                        </div>
                    `;
                    return;
                }

                await searchPackagesForReplacement({
                    panelQty,
                    panelRating,
                    resultsContainer,
                    searchButton
                });
            };

            searchButton?.addEventListener('click', runSearch);
            ratingInput?.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    runSearch();
                }
            });
            qtyInput?.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    runSearch();
                }
            });

            resultsContainer?.addEventListener('click', async (event) => {
                const selectButton = event.target.closest('.select-package-result');
                if (!selectButton) return;

                const selectedPackageId = selectButton.dataset.packageId;
                const selectedPackageName = selectButton.dataset.packageName || 'Selected package';
                const selectedPanelRating = parseInt(selectButton.dataset.panelRating, 10) || 0;
                const currentPackageId = document.getElementById('packageIdHidden')?.value;

                if (!selectedPackageId) return;

                if (selectedPackageId === currentPackageId) {
                    Swal.fire({
                        icon: 'info',
                        title: 'Already Selected',
                        text: 'This package is already linked to the invoice.'
                    });
                    return;
                }

                try {
                    selectButton.disabled = true;
                    selectButton.textContent = 'Applying...';
                    const selectedPackage = await fetchPackageDetails(selectedPackageId);
                    if (!selectedPackage) {
                        throw new Error('Failed to load the selected package.');
                    }
                    if (selectedPanelRating > 0) {
                        window.currentPanelRating = selectedPanelRating;
                    }
                    Swal.close();
                    Swal.fire({
                        icon: 'success',
                        title: 'Package Replaced',
                        text: `${selectedPackageName} is now selected. Save the invoice to keep this package.`
                    });
                } catch (error) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Unable to Replace Package',
                        text: error.message || 'Failed to load the selected package.'
                    });
                }
            });
        }
    });
}

// Create payment method row HTML
function createPaymentMethodRow(index) {
    return `
                <div class="payment-method-row bg-white p-4 rounded border border-purple-200" data-index="${index}">
                    <div class="flex justify-between items-start mb-3">
                        <span class="font-semibold text-gray-900">Payment Method ${index + 1}:</span>
                        ${index > 0 ? `<button type="button" class="remove-payment-method text-red-600 hover:text-red-800 text-sm font-medium" data-index="${index}">Remove</button>` : ''}
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                        <div>
                            <label class="block text-xs font-semibold mb-1 text-gray-700">Method</label>
                            <select class="payment-method w-full border-2 border-gray-300 rounded px-3 py-2 text-gray-900 bg-white focus:border-blue-500 focus:outline-none text-sm" data-index="${index}">
                                <option value="cash">Cash</option>
                                <option value="credit_card">Credit Card</option>
                                <option value="credit_card_epp">Credit Card EPP</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-semibold mb-1 text-gray-700">Amount Type</label>
                            <select class="amount-type w-full border-2 border-gray-300 rounded px-3 py-2 text-gray-900 bg-white focus:border-blue-500 focus:outline-none text-sm" data-index="${index}">
                                <option value="percent">%</option>
                                <option value="amount">RM</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-semibold mb-1 text-gray-700">Amount/Percentage</label>
                            <input 
                                type="number" 
                                step="0.01" 
                                min="0"
                                class="amount-value w-full border-2 border-gray-300 rounded px-3 py-2 text-gray-900 bg-white focus:border-blue-500 focus:outline-none text-sm" 
                                data-index="${index}"
                                placeholder="0.00"
                            >
                        </div>
                    </div>
                    <div class="epp-details hidden" data-index="${index}">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                            <div>
                                <label class="block text-xs font-semibold mb-1 text-gray-700">Bank</label>
                                <select class="epp-bank w-full border-2 border-gray-300 rounded px-3 py-2 text-gray-900 bg-white focus:border-blue-500 focus:outline-none text-sm" data-index="${index}">
                                    ${BANKS.map(bank => `<option value="${bank}">${bank}</option>`).join('')}
                                </select>
                            </div>
                            <div>
                                <label class="block text-xs font-semibold mb-1 text-gray-700">Tenure (Months)</label>
                                <select class="epp-tenure w-full border-2 border-gray-300 rounded px-3 py-2 text-gray-900 bg-white focus:border-blue-500 focus:outline-none text-sm" data-index="${index}">
                                    <!-- Options will be populated dynamically -->
                                </select>
                            </div>
                        </div>
                        <div class="epp-info text-sm text-gray-700 space-y-1">
                            <div class="epp-amount-info"></div>
                            <div class="epp-rate-info"></div>
                            <div class="epp-fee-info font-semibold text-purple-700"></div>
                        </div>
                    </div>
                </div>
            `;
}

// Update tenure options based on selected bank
function updateTenureOptions(index) {
    const row = document.querySelector(`.payment-method-row[data-index="${index}"]`);
    if (!row) return;

    const bankSelect = row.querySelector('.epp-bank');
    const tenureSelect = row.querySelector('.epp-tenure');

    if (!bankSelect || !tenureSelect) return;

    const bank = bankSelect.value;
    const tenures = getAvailableTenures(bank);

    tenureSelect.innerHTML = tenures.map(t => `<option value="${t}">${t} months</option>`).join('');

    // Trigger update
    updatePaymentMethodInfo(index);
}

// Update payment method info display
function updatePaymentMethodInfo(index) {
    const row = document.querySelector(`.payment-method-row[data-index="${index}"]`);
    if (!row) return;

    const methodSelect = row.querySelector('.payment-method');
    const amountTypeSelect = row.querySelector('.amount-type');
    const amountValueInput = row.querySelector('.amount-value');
    const eppDetails = row.querySelector('.epp-details');
    const bankSelect = row.querySelector('.epp-bank');
    const tenureSelect = row.querySelector('.epp-tenure');
    const amountInfo = row.querySelector('.epp-amount-info');
    const rateInfo = row.querySelector('.epp-rate-info');
    const feeInfo = row.querySelector('.epp-fee-info');

    const method = methodSelect.value;
    const isEPP = method === 'credit_card_epp';

    // Show/hide EPP details
    if (eppDetails) {
        eppDetails.classList.toggle('hidden', !isEPP);
    }

    if (!isEPP) return;

    const bank = bankSelect?.value;
    const tenure = tenureSelect ? parseInt(tenureSelect.value) : null;
    const amountType = amountTypeSelect?.value;
    const amountValue = parseFloat(amountValueInput?.value || 0);

    // Calculate package price after discount
    const packagePrice = parseFloat(document.getElementById('packagePrice')?.value || 0);
    const ceoDiscountValue = document.getElementById('ceoDiscount')?.value?.trim() || '';

    // Calculate extra items total
    const extraItemsTotal = getAdditionalInvoiceItems()
        .reduce((sum, item) => sum + item.total_price, 0);

    let subtotalAfterDiscount = packagePrice + extraItemsTotal;
    if (ceoDiscountValue) {
        const ceoDiscount = parseDiscount(ceoDiscountValue);
        if (ceoDiscount.fixed > 0) subtotalAfterDiscount -= ceoDiscount.fixed;
        if (ceoDiscount.percent > 0) subtotalAfterDiscount -= (packagePrice * ceoDiscount.percent / 100);
    } else {
        subtotalAfterDiscount -= getCustomDiscountFixedTotal();
        subtotalAfterDiscount -= getCustomDiscountPercentAmount();
    }
    subtotalAfterDiscount -= getSelectedDraftVoucherTotal(packagePrice);

    if (subtotalAfterDiscount < 0) subtotalAfterDiscount = 0;

    // Calculate EPP amount
    let eppAmount = 0;
    if (amountType === 'percent') {
        eppAmount = subtotalAfterDiscount * (amountValue / 100);
    } else {
        eppAmount = amountValue;
    }

    // Get rate and calculate fee
    const rate = getEPPRate(bank, tenure);
    const fee = rate ? calculateEPPFee(eppAmount, bank, tenure) : 0;

    // Update info display
    if (amountInfo) {
        amountInfo.textContent = `Amount: RM ${formatAmount(eppAmount)}`;
    }
    if (rateInfo && rate) {
        rateInfo.textContent = `Rate: ${rate}%`;
    } else if (rateInfo) {
        rateInfo.textContent = `Rate: Not available`;
    }
    if (feeInfo) {
        feeInfo.textContent = `Estimated Fee: RM ${formatAmount(fee)}`;
    }
}

// Calculate all EPP fees and create description
function calculateAllEPPFees() {
    // Calculate package price after discount
    const packagePrice = parseFloat(document.getElementById('packagePrice')?.value || 0);
    const ceoDiscountValue = document.getElementById('ceoDiscount')?.value?.trim() || '';

    // Calculate extra items total
    const extraItemsTotal = getAdditionalInvoiceItems()
        .reduce((sum, item) => sum + item.total_price, 0);

    let subtotalAfterDiscount = packagePrice + extraItemsTotal;
    if (ceoDiscountValue) {
        const ceoDiscount = parseDiscount(ceoDiscountValue);
        if (ceoDiscount.fixed > 0) subtotalAfterDiscount -= ceoDiscount.fixed;
        if (ceoDiscount.percent > 0) subtotalAfterDiscount -= (packagePrice * ceoDiscount.percent / 100);
    } else {
        subtotalAfterDiscount -= getCustomDiscountFixedTotal();
        subtotalAfterDiscount -= getCustomDiscountPercentAmount();
    }
    subtotalAfterDiscount -= getSelectedDraftVoucherTotal(packagePrice);

    if (subtotalAfterDiscount < 0) subtotalAfterDiscount = 0;

    const rows = document.querySelectorAll('.payment-method-row');
    const eppTransactions = [];
    const allPayments = [];
    let totalEPPFee = 0;
    let totalPayment = 0;

    rows.forEach((row, index) => {
        const methodSelect = row.querySelector('.payment-method');
        const amountTypeSelect = row.querySelector('.amount-type');
        const amountValueInput = row.querySelector('.amount-value');
        const bankSelect = row.querySelector('.epp-bank');
        const tenureSelect = row.querySelector('.epp-tenure');

        if (!methodSelect || !amountTypeSelect || !amountValueInput) return;

        const method = methodSelect.value;
        const amountType = amountTypeSelect.value;
        const amountValue = parseFloat(amountValueInput.value || 0);

        if (amountValue <= 0) return;

        // Calculate payment amount
        let paymentAmount = 0;
        if (amountType === 'percent') {
            paymentAmount = subtotalAfterDiscount * (amountValue / 100);
        } else {
            paymentAmount = amountValue;
        }

        totalPayment += paymentAmount;

        // Store payment info for structure notice
        let methodLabel = method === 'cash' ? 'Cash' : (method === 'credit_card' ? 'Credit Card' : 'Credit Card EPP');
        if (method === 'credit_card_epp' && bankSelect && tenureSelect) {
            methodLabel = `${bankSelect.value} ${tenureSelect.value}mths`;
        }
        allPayments.push(`Payment ${allPayments.length + 1}: RM ${formatAmount(paymentAmount)} (${methodLabel})`);

        // If EPP, calculate fee
        if (method === 'credit_card_epp' && bankSelect && tenureSelect) {
            const bank = bankSelect.value;
            const tenure = parseInt(tenureSelect.value);
            const rate = getEPPRate(bank, tenure);

            if (rate) {
                const fee = calculateEPPFee(paymentAmount, bank, tenure);
                totalEPPFee += fee;
                eppTransactions.push({
                    bank: bank,
                    tenure: tenure,
                    amount: paymentAmount
                });
            }
        }
    });

    // Format EPP fee description for the "Bank Processing Fee" item
    let description = '';
    if (eppTransactions.length > 0) {
        description = eppTransactions.map(t =>
            `${t.bank} EPP ${t.tenure} Months - RM${Math.round(t.amount)}`
        ).join(', ');
    }

    return {
        total_fee: totalEPPFee,
        description: description,
        total_payment: totalPayment,
        payment_structure: allPayments.join(' | ')
    };
}

// Add payment method row
function addPaymentMethodRow() {
    const container = document.getElementById('paymentMethodsContainer');
    if (!container) return;

    const index = paymentMethodCounter++;
    const rowHTML = createPaymentMethodRow(index);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = rowHTML;
    const row = tempDiv.firstElementChild;

    container.appendChild(row);

    // Initialize tenure options for EPP
    if (index === 0) {
        // Set default for first row: Cash, 100%
        const methodSelect = row.querySelector('.payment-method');
        const amountTypeSelect = row.querySelector('.amount-type');
        const amountValueInput = row.querySelector('.amount-value');
        if (methodSelect) methodSelect.value = 'cash';
        if (amountTypeSelect) amountTypeSelect.value = 'percent';
        if (amountValueInput) amountValueInput.value = '100';
    } else {
        // For new rows, initialize tenure if EPP
        updateTenureOptions(index);
    }

    // Attach event listeners
    attachPaymentMethodListeners(row, index);
    updateInvoicePreview();
}

// Remove payment method row
function removePaymentMethodRow(index) {
    const row = document.querySelector(`.payment-method-row[data-index="${index}"]`);
    if (row) {
        row.remove();
        updateInvoicePreview();
    }
}

// Attach event listeners to payment method row
function attachPaymentMethodListeners(row, index) {
    const methodSelect = row.querySelector('.payment-method');
    const amountTypeSelect = row.querySelector('.amount-type');
    const amountValueInput = row.querySelector('.amount-value');
    const bankSelect = row.querySelector('.epp-bank');
    const tenureSelect = row.querySelector('.epp-tenure');
    const removeBtn = row.querySelector('.remove-payment-method');

    if (methodSelect) {
        methodSelect.addEventListener('change', () => {
            updatePaymentMethodInfo(index);
            updateInvoicePreview();
        });
    }

    if (amountTypeSelect) {
        amountTypeSelect.addEventListener('change', () => {
            updatePaymentMethodInfo(index);
            updateInvoicePreview();
        });
    }

    if (amountValueInput) {
        amountValueInput.addEventListener('input', () => {
            updatePaymentMethodInfo(index);
            updateInvoicePreview();
        });
    }

    if (bankSelect) {
        bankSelect.addEventListener('change', () => {
            updateTenureOptions(index);
            updatePaymentMethodInfo(index);
            updateInvoicePreview();
        });
    }

    if (tenureSelect) {
        tenureSelect.addEventListener('change', () => {
            updatePaymentMethodInfo(index);
            updateInvoicePreview();
        });
    }

    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            removePaymentMethodRow(index);
        });
    }
}

// Update invoice items preview
function updateInvoicePreview() {
    const packagePrice = parseFloat(document.getElementById('packagePrice')?.value || 0);
    // CEO discount takes priority over custom discounts when entered.
    const ceoDiscountValue = document.getElementById('ceoDiscount')?.value?.trim() || '';
    const ceoDiscount = parseDiscount(ceoDiscountValue);
    updatePromotionOptionsUI();
    const promotionAmounts = getAppliedPromotionAmounts();

    const itemsList = document.getElementById('quotationItemsList');
    if (!itemsList) return;

    // Clear existing items
    itemsList.innerHTML = '';

    // Add package item
    const packageName = document.getElementById('packageName')?.value || 'Package Item';
    const packageItem = document.createElement('div');
    packageItem.className = 'flex justify-between items-center py-2 border-b border-gray-200';
    packageItem.innerHTML = `
                <div class="flex-1">
                    <div class="font-medium text-gray-900">${packageName}</div>
                    <div class="text-sm text-gray-600">1 × RM ${packagePrice.toFixed(2)}</div>
                </div>
                <div class="font-semibold text-gray-900">RM ${packagePrice.toFixed(2)}</div>
    `;
    itemsList.appendChild(packageItem);

    if (promotionAmounts.earnNowAppliedAmount > 0) {
        const earnNowItem = document.createElement('div');
        earnNowItem.className = 'flex justify-between items-center py-2 border-b border-gray-200';
        earnNowItem.innerHTML = `
                    <div class="flex-1">
                        <div class="font-medium text-amber-600">Earn Now Rebate</div>
                        <div class="text-[10px] text-amber-500 font-bold uppercase tracking-tight">Agent-selected rebate (Panel Qty: ${promotionAmounts.panelQty})</div>
                    </div>
                    <div class="font-semibold text-amber-600">-RM ${promotionAmounts.earnNowAppliedAmount.toFixed(2)}</div>
                `;
        itemsList.appendChild(earnNowItem);
    }

    if (promotionAmounts.earthMonthAppliedAmount > 0) {
        const earthMonthItem = document.createElement('div');
        earthMonthItem.className = 'flex justify-between items-center py-2 border-b border-gray-200';
        earthMonthItem.innerHTML = `
                    <div class="flex-1">
                        <div class="font-medium text-emerald-600">Earth Month Go Green Bonus</div>
                        <div class="text-[10px] text-emerald-500 font-bold uppercase tracking-tight">Agent-selected bonus (Panel Qty: ${promotionAmounts.panelQty})</div>
                    </div>
                    <div class="font-semibold text-emerald-600">-RM ${promotionAmounts.earthMonthAppliedAmount.toFixed(2)}</div>
                `;
        itemsList.appendChild(earthMonthItem);
    }

    if (promotionAmounts.parentsDayAppliedAmount > 0) {
        const parentsDayItem = document.createElement('div');
        parentsDayItem.className = 'flex justify-between items-center py-2 border-b border-gray-200';
        parentsDayItem.innerHTML = `
                    <div class="flex-1">
                        <div class="font-medium text-pink-600">Parents' Day PROMO 双亲节优惠</div>
                        <div class="text-[10px] text-pink-500 font-bold uppercase tracking-tight">Auto-applied discount (Panel Qty: ${promotionAmounts.panelQty})</div>
                    </div>
                    <div class="font-semibold text-pink-600">-RM ${promotionAmounts.parentsDayAppliedAmount.toFixed(2)}</div>
                `;
        itemsList.appendChild(parentsDayItem);
    }

    // Calculate subtotal (starting with package price)
    let subtotal = packagePrice - promotionAmounts.totalAppliedAmount;

    // Add Extra Items
    getAdditionalInvoiceItems().forEach(item => {
        const itemToneClass = item.item_kind === 'ballast'
            ? 'text-cyan-800'
            : item.item_kind === 'ats'
                ? 'text-orange-800'
                : 'text-gray-900';
        const el = document.createElement('div');
        el.className = 'flex justify-between items-center py-2 border-b border-gray-200';
        el.innerHTML = `
                    <div class="flex-1">
                        <div class="font-medium ${itemToneClass}">${item.description || 'Unnamed Item'}</div>
                        <div class="text-sm text-gray-600">${item.qty} × RM ${item.unit_price.toFixed(2)}</div>
                    </div>
                    <div class="font-semibold ${itemToneClass}">RM ${item.total_price.toFixed(2)}</div>
                `;
        itemsList.appendChild(el);
        subtotal += item.total_price;
    });

    // Validate extra items discount cap (5% of package price)
    const extraItemsNegative = getExtraItemsNegativeTotal(); // <= 0
    const maxAllowedNegative = -(packagePrice * EXTRA_ITEMS_MAX_DISCOUNT_PERCENT / 100);
    const extraItemsDiscountWarning = document.getElementById('extraItemsDiscountWarning');
    if (extraItemsNegative < maxAllowedNegative && packagePrice > 0) {
        window._extraItemsDiscountExceeded = true;
        if (extraItemsDiscountWarning) {
            extraItemsDiscountWarning.classList.remove('hidden');
            extraItemsDiscountWarning.textContent = `Additional items discount exceeds the maximum allowed (${EXTRA_ITEMS_MAX_DISCOUNT_PERCENT}% of package price = RM ${Math.abs(maxAllowedNegative).toFixed(2)}).`;
        }
    } else {
        window._extraItemsDiscountExceeded = false;
        if (extraItemsDiscountWarning) extraItemsDiscountWarning.classList.add('hidden');
    }

    // Add discount line items.
    // When CEO discount is active, it replaces all custom discounts (no cap applies).
    // Otherwise render each structured custom discount.
    const discountLabel = ceoDiscountValue ? "CEO's SPECIAL DISCOUNT" : 'Discount';
    if (ceoDiscountValue) {
        if (ceoDiscount.fixed > 0) {
            const fixedDiscountItem = document.createElement('div');
            fixedDiscountItem.className = 'flex justify-between items-center py-2 border-b border-gray-200';
            fixedDiscountItem.innerHTML = `
                    <div class="flex-1">
                        <div class="font-medium text-red-600">${discountLabel} (RM ${ceoDiscount.fixed.toFixed(2)})</div>
                    </div>
                    <div class="font-semibold text-red-600">-RM ${ceoDiscount.fixed.toFixed(2)}</div>
                `;
            itemsList.appendChild(fixedDiscountItem);
            subtotal -= ceoDiscount.fixed;
        }
        if (ceoDiscount.percent > 0) {
            const percentAmount = packagePrice * (ceoDiscount.percent / 100);
            const percentDiscountItem = document.createElement('div');
            percentDiscountItem.className = 'flex justify-between items-center py-2 border-b border-gray-200';
            percentDiscountItem.innerHTML = `
                    <div class="flex-1">
                        <div class="font-medium text-red-600">${discountLabel} (${ceoDiscount.percent}%)</div>
                    </div>
                    <div class="font-semibold text-red-600">-RM ${percentAmount.toFixed(2)}</div>
                `;
            itemsList.appendChild(percentDiscountItem);
            subtotal -= percentAmount;
        }
    } else {
        customDiscounts.forEach((d) => {
            const amount = parseFloat(d.amount) || 0;
            if (amount <= 0) return;
            const label = d.type === 'percent' ? `${d.value}%` : d.type === 'max_minus_percent' ? `Keep ${d.value}% Quota` : d.type === 'max_minus_fixed' ? `Keep RM ${(parseFloat(d.value) || 0).toFixed(2)} Quota` : `RM ${(parseFloat(d.value) || 0).toFixed(2)}`;
            const item = document.createElement('div');
            item.className = 'flex justify-between items-center py-2 border-b border-gray-200';
            item.innerHTML = `
                    <div class="flex-1">
                        <div class="font-medium text-red-600">Discount (${label})</div>
                        ${d.description ? `<div class="text-xs text-gray-500">${d.description}</div>` : ''}
                    </div>
                    <div class="font-semibold text-red-600">-RM ${amount.toFixed(2)}</div>
                `;
            itemsList.appendChild(item);
            subtotal -= amount;
        });
    }

    const voucherRows = buildDraftVoucherRows(packagePrice);
    voucherRows.forEach((voucher) => {
        const voucherItem = document.createElement('div');
        voucherItem.className = 'flex justify-between items-center py-2 border-b border-gray-200';
        voucherItem.innerHTML = `
                    <div class="flex-1">
                        <div class="font-medium text-amber-700">${voucher.title}</div>
                        <div class="text-sm text-amber-600">${voucher.code || 'Voucher'} • ${voucher.label}</div>
                    </div>
                    <div class="font-semibold text-amber-700">-RM ${voucher.amount.toFixed(2)}</div>
                `;
        itemsList.appendChild(voucherItem);
        subtotal -= voucher.amount;
    });

    // Auto-trim custom discounts if vouchers/promos pushed over budget.
    autoTrimCustomDiscounts();
    // Validation for package discount budget.
    // CEO discount bypasses; missing nett_price falls back to 7% of package price.
    syncDiscountGivenBridge();
    validateDiscountLimit();
    renderAppliedDiscounts();
    updateDiscountSummaryBar();
    renderDiscountVoucherSummary();

    const trueSubtotal = subtotal;
    if (trueSubtotal <= 0) {
        window._subtotalIsZeroOrNegative = true;
    } else {
        window._subtotalIsZeroOrNegative = false;
    }

    // Ensure subtotal doesn't go negative
    if (subtotal < 0) subtotal = 0;

    // Store subtotal after discount for payment calculation
    const subtotalAfterDiscount = subtotal;

    // Calculate EPP fees
    const eppData = calculateAllEPPFees();

    // Add EPP fee item if exists
    if (eppData.total_fee > 0 && eppData.description) {
        const eppFeeItem = document.createElement('div');
        eppFeeItem.className = 'flex justify-between items-center py-2 border-b border-gray-200';
        eppFeeItem.innerHTML = `
                    <div class="flex-1">
                        <div class="font-medium text-purple-700">Bank Processing Fee</div>
                        <div class="text-sm text-gray-600">${eppData.description}</div>
                    </div>
                    <div class="font-semibold text-purple-700">RM ${eppData.total_fee.toFixed(2)}</div>
                `;
        itemsList.appendChild(eppFeeItem);
        subtotal += eppData.total_fee;
    }

    // Update payment summary
    const totalPaymentDisplay = document.getElementById('totalPaymentAmount');
    const unpaidBalanceDisplay = document.getElementById('unpaidBalanceAmount');
    const totalEPPFeesDisplay = document.getElementById('totalEPPFees');

    if (totalPaymentDisplay) {
        const paymentPercent = subtotalAfterDiscount > 0 ? (eppData.total_payment / subtotalAfterDiscount * 100) : 0;
        totalPaymentDisplay.textContent = `RM ${formatAmount(eppData.total_payment)} (${paymentPercent.toFixed(2)}%)`;

        if (Math.abs(paymentPercent - 100) < 0.01) {
            totalPaymentDisplay.classList.add('text-green-600');
            totalPaymentDisplay.classList.remove('text-red-600');
        } else {
            totalPaymentDisplay.classList.add('text-red-600');
            totalPaymentDisplay.classList.remove('text-green-600');
        }

        // Calculate and display Unpaid Balance
        if (unpaidBalanceDisplay) {
            const unpaidAmount = Math.max(0, subtotalAfterDiscount - eppData.total_payment);
            const unpaidPercent = Math.max(0, 100 - paymentPercent);

            unpaidBalanceDisplay.textContent = `RM ${formatAmount(unpaidAmount)} (${unpaidPercent.toFixed(2)}%)`;

            if (unpaidAmount < 0.01) {
                unpaidBalanceDisplay.classList.add('text-green-600');
                unpaidBalanceDisplay.classList.remove('text-red-600');
            } else {
                unpaidBalanceDisplay.classList.add('text-red-600');
                unpaidBalanceDisplay.classList.remove('text-green-600');
            }
        }
    }
    if (totalEPPFeesDisplay) {
        totalEPPFeesDisplay.textContent = `RM ${formatAmount(eppData.total_fee)}`;
    }

    // Calculate SST (6%)
    const applySST = document.getElementById('applySST')?.checked || false;
    const sstRate = applySST ? 6.0 : 0.0;
    const sstAmount = applySST ? (subtotal * (sstRate / 100)) : 0;
    const totalAmount = subtotal + sstAmount;

    // Update totals
    document.getElementById('subtotal').textContent = `RM ${subtotal.toFixed(2)}`;
    const sstLabel = document.querySelector('label[for="applySST"]');
    if (sstLabel) sstLabel.textContent = `Apply 6% SST (Sales & Service Tax)${applySST ? ' - RM ' + sstAmount.toFixed(2) : ''}`;

    // Show/hide SST row based on checkbox
    const sstRow = document.getElementById('sstRow');
    const sstAmountElement = document.getElementById('sstAmount');
    if (sstRow) {
        sstRow.style.display = applySST ? 'flex' : 'none';
    }
    if (sstAmountElement) {
        sstAmountElement.textContent = `RM ${sstAmount.toFixed(2)}`;
    }
    document.getElementById('totalAmount').textContent = `RM ${totalAmount.toFixed(2)}`;
    updateWorkspaceStatuses();
    updateRoiCalculator(totalAmount);
}

// Live ROI Calculator
function updateRoiCalculator(finalTotalAmount) {
    const section = document.getElementById('roiCalculatorSection');
    const badge = document.getElementById('roiLiveBadge');
    if (!section) return;

    const systemCost = parseFloat(finalTotalAmount) || 0;

    const overrideEl = document.getElementById('roiMonthlySavingsOverride');
    const overrideVal = parseFloat(overrideEl?.value);
    const hasOverride = Number.isFinite(overrideVal) && overrideVal >= 0;

    let monthlySavings = null;
    if (hasOverride) {
        monthlySavings = overrideVal;
    } else {
        const estimatedSavingEl = document.getElementById('estimatedSaving');
        const estimatedSaving = parseFloat(estimatedSavingEl?.value);
        if (Number.isFinite(estimatedSaving) && estimatedSaving > 0) {
            monthlySavings = estimatedSaving;
        }
    }

    const monthlySavingsEl = document.getElementById('roiMonthlySavings');
    const systemCostEl = document.getElementById('roiSystemCost');
    const annualPercentEl = document.getElementById('roiAnnualPercent');
    const paybackEl = document.getElementById('roiPaybackPeriod');

    if (monthlySavingsEl) {
        monthlySavingsEl.textContent = monthlySavings !== null ? `RM ${monthlySavings.toFixed(2)}` : 'RM —';
    }
    if (systemCostEl) {
        systemCostEl.textContent = systemCost > 0 ? `RM ${systemCost.toFixed(2)}` : 'RM —';
    }

    let annualRoiDisplay = '— %';
    let paybackDisplay = '— yr';

    if (monthlySavings !== null && systemCost > 0 && monthlySavings > 0) {
        const annualSavings = monthlySavings * 12;
        const annualRoi = (annualSavings / systemCost) * 100;
        const payback = systemCost / annualSavings;
        annualRoiDisplay = `${annualRoi.toFixed(1)}%`;
        paybackDisplay = `${payback.toFixed(1)} yr`;
    }

    if (annualPercentEl) annualPercentEl.textContent = annualRoiDisplay;
    if (paybackEl) paybackEl.textContent = paybackDisplay;

    if (badge) {
        if (monthlySavings !== null && systemCost > 0) {
            badge.className = 'rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 uppercase tracking-wide';
        } else {
            badge.className = 'rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide';
        }
    }
}

// Load invoice data on page load
document.addEventListener('DOMContentLoaded', async function () {
    window.InvoicePageShared.initializeInvoicePageBase();
    window.InvoicePageShared.initWorkspaceShell({ updateWorkspaceStatuses });

    // Fetch User Profile
    window.InvoicePageShared.fetchUserProfile();

    // Get edit_invoice_id from URL
    const urlParams = new URLSearchParams(window.location.search);
    const editInvoiceId = urlParams.get('id');

    if (!editInvoiceId) {
        showError('No invoice ID provided. Please return to My Quotations page.');
        return;
    }

    referralInvoiceFilterId = editInvoiceId;
    await fetchAssignedReferralLeads();

    // Update Cancel Button
    const cancelBtn = document.getElementById('cancelButton');
    if (cancelBtn) {
        cancelBtn.href = `/invoice-office?id=${editInvoiceId}`;
    }

    window.editInvoiceId = editInvoiceId;

    // Show loading warning
    document.getElementById('warningMessage').classList.remove('hidden');
    document.getElementById('warningText').textContent = 'Loading quotation data...';

    try {
        // Fetch invoice data
        const res = await fetch(`/api/v1/invoices/${editInvoiceId}`);
        const json = await res.json();

        if (json.success && json.data) {
            const inv = json.data;

            window.invoiceHasAnyPayment = Boolean(inv.has_any_payment);
            window.canChangePackage = Boolean(inv.can_change_package);
            window.currentPanelRating = parseInt(inv.panel_rating, 10) || 0;
            updatePackageChangeControls();

            // Hide loading warning
            document.getElementById('warningMessage').classList.add('hidden');

            // 1. Load Package
            const invPackageId = inv.linked_package || inv.legacy_pid_to_be_deleted || inv.package_id;
            if (invPackageId) {
                await fetchPackageDetails(invPackageId);
            } else {
                // Handle case where package is missing
                document.getElementById('quotationFormContainer').classList.remove('hidden');
                document.getElementById('packageNameDisplay').textContent = 'No Package Linked';
                document.getElementById('packagePriceDisplay').textContent = 'RM 0.00';
                updateInvoicePreview();
            }

            // 2. Pre-fill Customer Info from Live Data
            window.InvoicePageShared.setCustomerContactFields({
                name: inv.customer_name,
                phone: inv.customer_phone,
                address: inv.customer_address
            });
            if (inv.linked_referral) {
                renderAssignedReferralOptions(inv.linked_referral);
                applyAssignedReferralSelection(inv.linked_referral, { autofill: false });
            }

            // 2.5 Load Profile Picture
            window.InvoicePageShared.setProfilePicture(inv.profile_picture);

            // 2.6 Load Lead Source & Remark from customer
            if (inv.lead_source) document.getElementById('customerLeadSource').value = inv.lead_source;
            if (inv.remark) document.getElementById('customerRemark').value = inv.remark;

            // 3. Discount — edit mode should stay simple and preserve what was
            // saved on the invoice, not re-derive create-time discount logic.
            window.InvoicePageShared.applyDiscountValue(
                window.InvoicePageShared.formatDiscountValue({
                    fixedAmount: inv.discount_fixed,
                    percent: inv.discount_percent
                })
            );

            // 4. SST
            if (inv.sst_amount > 0) document.getElementById('applySST').checked = true;

            // 4.5 Estimated savings (for ROI calculator)
            if (inv.estimated_saving) {
                document.getElementById('estimatedSaving').value = inv.estimated_saving;
            }

            // 5. Markup (Preserve)
            window.currentAgentMarkup = inv.agent_markup || 0;

            // 6. Extra/Manual Items - Load ONLY extra items for edit.
            // Discount display must come from the saved invoice discount fields,
            // not from create-time promo rules or item regeneration.
            if (inv.items && Array.isArray(inv.items)) {
                console.log('[Edit Invoice] Loading', inv.items.length, 'items from invoice');
                loadedInvoiceItems = inv.items;

                const extraItems = inv.items.filter(i => i.item_type === 'extra');
                const discountItems = inv.items.filter(i => i.item_type === 'discount');
                const noticeItems = inv.items.filter(i => i.item_type === 'notice');
                const eppFeeItems = inv.items.filter(i => i.item_type === 'epp_fee');

                console.log('[Edit Invoice] Item breakdown:', {
                    extra: extraItems.length,
                    discount: discountItems.length,
                    notice: noticeItems.length,
                    epp_fee: eppFeeItems.length
                });

                let ballastQty = 0;
                let atsQty = 0;
                const microInverterItems = [];
                extraItems.forEach(item => {
                    if (isBallastItem(item)) {
                        ballastQty += parseInt(item.qty, 10) || Math.round((parseFloat(item.total_price) || 0) / BALLAST_UNIT_PRICE) || 0;
                    } else if (isATSItem(item)) {
                        atsQty += parseInt(item.qty, 10) || Math.round((parseFloat(item.total_price) || 0) / ATS_ADDON_PRICE) || 0;
                    } else if (isMicroInverterItem(item)) {
                        microInverterItems.push(item);
                    } else {
                        addManualItem({
                            description: item.description,
                            qty: parseFloat(item.qty) || 1,
                            unit_price: parseFloat(item.unit_price) || 0,
                            linked_product: item.linked_product || null
                        });
                    }
                });
                setBallastQty(ballastQty);
                setAtsQty(atsQty);
                hydrateMicroInverterFromItems(microInverterItems);
            } else {
                console.warn('[Edit Invoice] No items found in invoice data');
            }
            hydratePromotionSelections(loadedInvoiceItems);
            hydrateCustomDiscountsFromInvoice(loadedInvoiceItems);
            syncATSAddonBanner();
            // 7. Trigger preview update
            updateInvoicePreview();

            // 8. Add first payment method row (default: Cash, 100%)
            addPaymentMethodRow();

            let selectedVoucherIds = [];
            try {
                const invoiceVoucherPayload = await window.InvoiceVoucherStep.fetchVoucherStepData(editInvoiceId);
                selectedVoucherIds = window.InvoiceVoucherStep.readSelectedVoucherIds(invoiceVoucherPayload);
            } catch (error) {
                console.warn('Unable to load saved voucher selection for this invoice:', error);
            }

            await loadDraftVoucherStepForPackage(invPackageId, {
                selectedIds: selectedVoucherIds,
                scrollToSection: false
            });

        } else {
            showError('Failed to load invoice for editing. Invoice not found.');
            document.getElementById('warningMessage').classList.add('hidden');
        }
    } catch (err) {
        console.error(err);
        showError('Error loading invoice: ' + err.message);
        document.getElementById('warningMessage').classList.add('hidden');
    }

    window.InvoicePageShared.wireCommonInvoicePageInteractions({
        addManualItem,
        applyAssignedReferralSelection,
        updateInvoicePreview,
        getBallastQty,
        addPaymentMethodRow
    });

    initDiscountSection();

    const changePackageBtn = document.getElementById('changePackageBtn');
    if (changePackageBtn) {
        changePackageBtn.addEventListener('click', openChangePackageModal);
    }

    updateBallastLimitText();
    wireAtsSection();
    MICRO_INVERTER_MODELS.forEach(model => {
        const input = document.getElementById(`${model.id}_qty`);
        if (input) {
            input.addEventListener('input', updateInvoicePreview);
            input.addEventListener('change', updateInvoicePreview);
        }
    });
    updatePromotionOptionsUI();
    updatePackageChangeControls();
    updateWorkspaceStatuses();

    // CEO Discount: check access and wire up the field
    window.InvoicePageShared.fetchAndApplyCeoDiscountAccess();
});

async function fetchPackageDetails(packageId) {
    try {
        const response = await fetch(`/api/package/${packageId}`);
        const result = await response.json();

        if (result.success && result.package) {
            showPackage(result.package);
            return result.package;
        } else {
            showError(`Package Not Found: The Package ID '${packageId}' does not exist in database.`);
            return null;
        }
    } catch (err) {
        console.error('Error fetching package:', err);
        showError(`Database Error: Failed to check package. Error: ${err.message}`);
        return null;
    }
}

function showPackage(pkg) {
    const packageInfo = document.getElementById('quotationFormContainer');
    packageInfo.classList.remove('hidden');
    document.getElementById('errorMessage')?.classList.add('hidden');

    document.getElementById('packageNameDisplay').textContent = pkg.name || pkg.invoice_desc || `Package ${pkg.bubble_id}`;
    document.getElementById('packagePriceDisplay').textContent = `RM ${(parseFloat(pkg.price) || 0).toFixed(2)}`;

    document.getElementById('packagePrice').value = pkg.price || 0;
    document.getElementById('packageName').value = pkg.name || pkg.invoice_desc || `Package ${pkg.bubble_id}`;
    document.getElementById('packageIdHidden').value = pkg.bubble_id;
    window.currentBasePackagePrice = parseFloat(pkg.price) || 0;
    window.currentBasePackageName = pkg.name || pkg.invoice_desc || `Package ${pkg.bubble_id}`;
    window.currentBasePackageDescription = pkg.invoice_desc || '';
    window.currentPackageHybridUpgradeData = null;
    window.currentPanelQty = pkg.panel_qty || 0;
    window.currentPackageType = pkg.type || '';
    setBallastQty(document.getElementById('ballastQty')?.value || 0);
    updatePromotionOptionsUI();

    // Guardrail: nett_price as floor. Falls back to 7% of price if not set.
    window.packageNettPrice = parseFloat(pkg.nett_price) || 0;
    updateDiscountSummaryBar();

    if (pkg.invoice_desc) {
        const descContainer = document.getElementById('packageDescContainer');
        descContainer.classList.remove('hidden');
        document.getElementById('packageDescDisplay').textContent = pkg.invoice_desc;
    } else {
        const descContainer = document.getElementById('packageDescContainer');
        descContainer.classList.add('hidden');
        document.getElementById('packageDescDisplay').textContent = '';
    }

    if (inlineVoucherStep) {
        loadDraftVoucherStepForPackage(pkg.bubble_id, {
            selectedIds: getSelectedDraftVoucherIds()
        }).catch((error) => {
            console.error('Unable to refresh voucher preview:', error);
        });
    }

    loadHybridUpgradeOptions(pkg.bubble_id);
    syncATSAddonBanner();
    updateInvoicePreview();
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.classList.remove('hidden');
    document.getElementById('errorText').textContent = message;
    updateWorkspaceStatuses();
}

// Handle form submission
document.getElementById('quotationForm')?.addEventListener('submit', async function (e) {
    e.preventDefault();
    const formData = new FormData(this);
    const data = Object.fromEntries(formData);

    if (!window.InvoicePageShared.validateInvoiceSubmitState({
        extraItemsMaxDiscountPercent: EXTRA_ITEMS_MAX_DISCOUNT_PERCENT
    })) {
        return;
    }

    const restoreSubmitButtonState = window.InvoicePageShared.setSubmitButtonLoadingState(this, 'Saving...');

    // Calculate EPP fees
    const eppData = calculateAllEPPFees();
    const extraItems = getAdditionalInvoiceItems();
    const requestData = window.InvoicePageShared.buildInvoiceRequestData({
        formValues: data,
        eppData,
        extraItems,
        voucherIds: getSelectedDraftVoucherIds(),
        additionalFields: {
            // EDIT INVOICE RULE:
            // This screen edits an EXISTING invoice, so promo handling must follow the saved invoice setting.
            // DO NOT treat edit like create. Create defaults are not allowed to overwrite existing invoice promo state.
            applyEarnNowRebate: document.getElementById('applyEarnNowRebate')?.checked || false,
            applyEarthMonthGoGreenBonus: document.getElementById('applyEarthMonthGoGreenBonus')?.checked || false,
            // Carry the custom discount description(s) so re-saving keeps the
            // descriptive discount line instead of relabelling to "Discount".
            discount_description: customDiscounts.map(d => (d.description || '').trim()).filter(Boolean).join(' | ') || null
        }
    });

    const earnNowToggle = document.getElementById('applyEarnNowRebate');
    const earthMonthToggle = document.getElementById('applyEarthMonthGoGreenBonus');
    const parentsDayToggle = document.getElementById('applyParentsDayPromo');
    // If the promo toggles are disabled because the promo period already ended,
    // we still MUST carry the original invoice setting forward on save.
    // DO NOT replace persisted promo state with false just because the edit UI is locked.
    requestData.applyEarnNowRebate = false;
    requestData.applyEarthMonthGoGreenBonus = false;
    requestData.applyParentsDayPromo = false;
    // Always use version endpoint for edit mode
    const endpoint = `/api/v1/invoices/${window.editInvoiceId}/version`;
    // Preserve markup
    requestData.agent_markup = window.currentAgentMarkup || 0;

    // Call the API
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });

        const result = await response.json();

        if (response.ok && result.success) {
            const newVersionInvoiceId = result?.data?.bubbleId || window.editInvoiceId;
            window.location.href = `/view/${encodeURIComponent(newVersionInvoiceId)}`;
        } else {
            alert('Error: ' + (result.error || result.detail || 'Failed to process quotation'));
            restoreSubmitButtonState();
        }
    } catch (error) {
        alert('Error: ' + error.message);
        restoreSubmitButtonState();
    }
});

// ============================================
// WhatsApp Integration - Uses CustomerManager
// ============================================
function checkWhatsApp(e) {
    const btn = document.getElementById('waCheckBtn');
    CustomerManager.checkWhatsApp('customerPhone', {
        profilePictureInputId: 'profilePicture',
        profilePreviewId: 'profilePreview',
        button: btn
    });
}

function fillWhatsAppInfo(photoUrl, phone) {
    CustomerManager.fillWhatsAppInfo(photoUrl, phone, 'profilePicture', 'profilePreview');
}

async function promptManualName(phone, photoUrl) {
    const { value: name } = await Swal.fire({
        title: 'Enter Customer Name',
        input: 'text',
        inputPlaceholder: 'Full Name',
        showCancelButton: true,
        confirmButtonText: 'Save & Sync Photo',
        inputValidator: (value) => {
            if (!value) return 'You must enter a name!';
        }
    });

    if (name) {
        await fillWhatsAppInfo(name, photoUrl, phone);
    }
}

// ============================================
// Live ROI Calculator - Manual override listener
// ============================================
document.addEventListener('DOMContentLoaded', function () {
    const roiOverride = document.getElementById('roiMonthlySavingsOverride');
    if (roiOverride) {
        roiOverride.addEventListener('input', function () {
            const totalAmountText = document.getElementById('totalAmount')?.textContent || '';
            const match = totalAmountText.replace(/[^0-9.]/g, '');
            const totalAmount = parseFloat(match) || 0;
            updateRoiCalculator(totalAmount);
        });
    }
});
