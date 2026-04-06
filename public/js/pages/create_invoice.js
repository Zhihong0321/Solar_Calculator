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

const MICRO_INVERTER_MODELS = [
    { id: 'mi_s2', name: 'SAJ M2-1.0K S2 Micro Inverter', price: 500, originalPrice: 1000 },
    { id: 'mi_s4', name: 'SAJ M4-1.8K S4 Micro Inverter', price: 1000, originalPrice: 1500 }
];
const BALLAST_UNIT_PRICE = 120;

// Read micro inverter qty inputs and return items with qty > 0
function getMicroInverterItems() {
    const items = [];
    MICRO_INVERTER_MODELS.forEach(model => {
        const qtyInput = document.getElementById(`${model.id}_qty`);
        const qty = parseInt(qtyInput?.value) || 0;
        if (qty > 0) {
            items.push({
                description: `${model.name} (RM${model.originalPrice.toLocaleString()} → RM${model.price.toLocaleString()})`,
                qty: qty,
                unit_price: model.price,
                total_price: qty * model.price,
                item_kind: 'micro_inverter'
            });
        }
    });
    return items;
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
                item_kind: 'manual'
            };
        });

    const ballastItem = getBallastItem();
    if (ballastItem) {
        items.push(ballastItem);
    }

    getMicroInverterItems().forEach(item => items.push(item));

    return items;
}

const EXTRA_ITEMS_MAX_DISCOUNT_PERCENT = 5; // Max negative extra items = 5% of package price
const MANUAL_DISCOUNT_POLICY = [
    { minPrice: 40000, maxPercent: 7 },
    { minPrice: 30000, maxPercent: 6 },
    { minPrice: 18000, maxPercent: 5 }
];

function getManualDiscountPolicy(packagePrice) {
    const normalizedPrice = parseFloat(packagePrice) || 0;
    const matchedTier = MANUAL_DISCOUNT_POLICY.find(tier => normalizedPrice >= tier.minPrice);
    const maxPercent = matchedTier ? matchedTier.maxPercent : 0;

    return {
        maxPercent,
        maxAmount: normalizedPrice * (maxPercent / 100)
    };
}

// Calculate total negative amount from all extra items (manual + micro inverters)
function getExtraItemsNegativeTotal() {
    let negativeTotal = 0;
    getAdditionalInvoiceItems().forEach(item => {
        if (item.total_price < 0) negativeTotal += item.total_price;
    });
    return negativeTotal; // Will be <= 0
}

const BANKS = Object.keys(EPP_RATES);
let paymentMethodCounter = 0;
let assignedReferralLeads = [];
let referralInvoiceFilterId = null;
let inlineVoucherStep = null;
let activeVoucherInvoiceId = '';
let activeVoucherNextUrl = '';
let voucherStepApplied = false;

// Dynamic Additional Items State
let manualItems = [];

// Add a new manual item row
function addManualItem(data = { description: '', qty: 1, unit_price: 0 }) {
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

function toggleFollowUpSection() {
    const name = document.getElementById('customerName').value.trim();
    const section = document.getElementById('followUpSection');
    if (name) {
        section.classList.remove('hidden');
    } else {
        section.classList.add('hidden');
    }
}

function getVisibleReferralLeads() {
    return assignedReferralLeads.filter((referral) => {
        if (!referral?.linked_invoice) return true;
        return referral.linked_invoice === referralInvoiceFilterId;
    });
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

    toggleFollowUpSection();
}

function setHiddenFieldValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value === null || value === undefined ? '' : String(value);
}

function applySolarSavingsParams(urlParams) {
    if (urlParams.has('customer_average_tnb')) {
        setHiddenFieldValue('customerAverageTnb', urlParams.get('customer_average_tnb'));
    }
    if (urlParams.has('estimated_saving')) {
        setHiddenFieldValue('estimatedSaving', urlParams.get('estimated_saving'));
    }
    if (urlParams.has('estimated_new_bill_amount')) {
        setHiddenFieldValue('estimatedNewBillAmount', urlParams.get('estimated_new_bill_amount'));
    }
    if (urlParams.has('solar_sun_peak_hour')) {
        setHiddenFieldValue('solarSunPeakHour', urlParams.get('solar_sun_peak_hour'));
    }
    if (urlParams.has('solar_morning_usage_percent')) {
        setHiddenFieldValue('solarMorningUsagePercent', urlParams.get('solar_morning_usage_percent'));
    }
}

async function fetchAssignedReferralLeads(selectedReferralId = '', { autofillSelection = false } = {}) {
    try {
        const response = await fetch('/api/v1/referrals/my-referrals', { credentials: 'same-origin' });
        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Failed to load assigned referral leads');
        }

        assignedReferralLeads = Array.isArray(result.data) ? result.data : [];
        renderAssignedReferralOptions(selectedReferralId);

        if (selectedReferralId) {
            applyAssignedReferralSelection(selectedReferralId, { autofill: autofillSelection });
        }
    } catch (error) {
        console.error('Error loading assigned referral leads:', error);
    }
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

const APRIL_2026_PROMO_END = new Date('2026-05-01T00:00:00');

function isApril2026PromotionActive() {
    return new Date() < APRIL_2026_PROMO_END;
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

function getAppliedPromotionAmounts(panelQty = window.currentPanelQty) {
    const normalizedPanelQty = parseInt(panelQty, 10) || 0;
    const earnNowEligibleAmount = getEarnNowRebateAmount(normalizedPanelQty);
    const earthMonthEligibleAmount = getEarthMonthGoGreenBonusAmount(normalizedPanelQty);
    const earnNowToggle = document.getElementById('applyEarnNowRebate');
    const earthMonthToggle = document.getElementById('applyEarthMonthGoGreenBonus');
    const promotionsEnabled = isApril2026PromotionActive() && !window.isEditMode;

    const earnNowAppliedAmount = promotionsEnabled && earnNowToggle?.checked ? earnNowEligibleAmount : 0;
    const earthMonthAppliedAmount = promotionsEnabled && earthMonthToggle?.checked ? earthMonthEligibleAmount : 0;

    return {
        panelQty: normalizedPanelQty,
        earnNowEligibleAmount,
        earthMonthEligibleAmount,
        earnNowAppliedAmount,
        earthMonthAppliedAmount,
        totalAppliedAmount: earnNowAppliedAmount + earthMonthAppliedAmount
    };
}

function updatePromotionOptionsUI() {
    const section = document.getElementById('promotionOptionsSection');
    const earnNowToggle = document.getElementById('applyEarnNowRebate');
    const earthMonthToggle = document.getElementById('applyEarthMonthGoGreenBonus');
    const earnNowAmountDisplay = document.getElementById('earnNowAmountDisplay');
    const earthMonthAmountDisplay = document.getElementById('earthMonthBonusAmountDisplay');
    const earnNowHint = document.getElementById('earnNowHint');
    const earthMonthHint = document.getElementById('earthMonthBonusHint');
    const promotionsEnabled = isApril2026PromotionActive() && !window.isEditMode;
    const { panelQty, earnNowEligibleAmount, earthMonthEligibleAmount } = getAppliedPromotionAmounts();

    if (section) {
        section.classList.toggle('hidden', !promotionsEnabled);
    }

    if (!promotionsEnabled) {
        if (earnNowToggle) {
            earnNowToggle.checked = false;
            earnNowToggle.disabled = true;
        }
        if (earthMonthToggle) {
            earthMonthToggle.checked = false;
            earthMonthToggle.disabled = true;
        }
        return;
    }

    if (earnNowAmountDisplay) {
        earnNowAmountDisplay.textContent = `RM ${earnNowEligibleAmount.toFixed(2)}`;
    }
    if (earthMonthAmountDisplay) {
        earthMonthAmountDisplay.textContent = `RM ${earthMonthEligibleAmount.toFixed(2)}`;
    }

    if (earnNowToggle) {
        earnNowToggle.disabled = earnNowEligibleAmount <= 0;
        if (earnNowToggle.disabled) earnNowToggle.checked = false;
    }
    if (earthMonthToggle) {
        earthMonthToggle.disabled = earthMonthEligibleAmount <= 0;
        if (earthMonthToggle.disabled) earthMonthToggle.checked = false;
    }

    if (earnNowHint) {
        if (earnNowEligibleAmount > 0) {
            earnNowHint.textContent = `${panelQty} panels detected. Toggle to apply this rebate.`;
        } else {
            earnNowHint.textContent = 'Eligible for 11 to 36 solar panels only.';
        }
    }

    if (earthMonthHint) {
        if (earthMonthEligibleAmount > 0) {
            earthMonthHint.textContent = `${panelQty} panels detected. Toggle to apply this bonus.`;
        } else {
            earthMonthHint.textContent = 'Eligible for 11 to 36 solar panels only.';
        }
    }
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
    const discountInput = document.getElementById('discountGiven')?.value || '';
    const discount = parseDiscount(discountInput);

    // Calculate extra items total
    const extraItemsTotal = getAdditionalInvoiceItems()
        .reduce((sum, item) => sum + item.total_price, 0);

    let subtotalAfterDiscount = packagePrice + extraItemsTotal;
    if (discount.fixed > 0) subtotalAfterDiscount -= discount.fixed;
    if (discount.percent > 0) subtotalAfterDiscount -= (packagePrice * discount.percent / 100);

    const promotionAmounts = getAppliedPromotionAmounts();
    subtotalAfterDiscount -= promotionAmounts.totalAppliedAmount;

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
    const discountInput = document.getElementById('discountGiven')?.value || '';
    const discount = parseDiscount(discountInput);

    // Calculate extra items total
    const extraItemsTotal = getAdditionalInvoiceItems()
        .reduce((sum, item) => sum + item.total_price, 0);

    let subtotalAfterDiscount = packagePrice + extraItemsTotal;
    if (discount.fixed > 0) subtotalAfterDiscount -= discount.fixed;
    if (discount.percent > 0) subtotalAfterDiscount -= (packagePrice * discount.percent / 100);

    const promotionAmounts = getAppliedPromotionAmounts();
    subtotalAfterDiscount -= promotionAmounts.totalAppliedAmount;

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
    const discountInput = document.getElementById('discountGiven')?.value || '';
    const discount = parseDiscount(discountInput);
    updatePromotionOptionsUI();

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

    const promotionAmounts = getAppliedPromotionAmounts();

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

    let subtotal = packagePrice - promotionAmounts.totalAppliedAmount;

    // Add Extra Items
    getAdditionalInvoiceItems().forEach(item => {
        const itemToneClass = item.item_kind === 'ballast'
            ? 'text-cyan-800'
            : item.item_kind === 'micro_inverter'
                ? 'text-amber-800'
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

    // Add fixed discount item if exists
    if (discount.fixed > 0) {
        const fixedDiscountItem = document.createElement('div');
        fixedDiscountItem.className = 'flex justify-between items-center py-2 border-b border-gray-200';
        fixedDiscountItem.innerHTML = `
                    <div class="flex-1">
                        <div class="font-medium text-red-600">Discount (RM ${discount.fixed.toFixed(2)})</div>
                    </div>
                    <div class="font-semibold text-red-600">-RM ${discount.fixed.toFixed(2)}</div>
                `;
        itemsList.appendChild(fixedDiscountItem);
        subtotal -= discount.fixed;
    }

    // Add percentage discount item if exists
    if (discount.percent > 0) {
        const percentAmount = packagePrice * (discount.percent / 100);
        const percentDiscountItem = document.createElement('div');
        percentDiscountItem.className = 'flex justify-between items-center py-2 border-b border-gray-200';
        percentDiscountItem.innerHTML = `
                    <div class="flex-1">
                        <div class="font-medium text-red-600">Discount (${discount.percent}%)</div>
                    </div>
                    <div class="font-semibold text-red-600">-RM ${percentAmount.toFixed(2)}</div>
                `;
        itemsList.appendChild(percentDiscountItem);
        subtotal -= percentAmount;
    }

    // Validation for tiered manual discount limit
    const totalDiscountValue = (discount.fixed || 0) + (packagePrice * (discount.percent || 0) / 100);
    const discountInputField = document.getElementById('discountGiven');
    const maxDiscountAllowed = Number(window.maxDiscountAllowed) || 0;
    const allowedDiscountPercent = window.maxDiscountPercentAllowed || 0;
    if (totalDiscountValue > (maxDiscountAllowed + 0.01)) {
        window._maxDiscountExceeded = true;
        if (discountInputField) {
            discountInputField.classList.add('border-red-500', 'bg-red-50');
            discountInputField.classList.remove('border-gray-300', 'bg-white');
        }
        const warningMsg = document.createElement('div');
        warningMsg.className = 'text-xs text-red-600 font-bold mt-1';
        warningMsg.id = 'discountLimitWarning';
        warningMsg.textContent = `⚠️ Exceeds max allowed discount of RM ${maxDiscountAllowed.toFixed(2)} (${allowedDiscountPercent}% of package price)`;

        // Remove existing warning if any
        const existingWarning = document.getElementById('discountLimitWarning');
        if (existingWarning) existingWarning.remove();

        if (discountInputField) discountInputField.parentNode.appendChild(warningMsg);
    } else {
        window._maxDiscountExceeded = false;
        if (discountInputField) {
            discountInputField.classList.remove('border-red-500', 'bg-red-50');
            discountInputField.classList.add('border-gray-300', 'bg-white');
        }
        const existingWarning = document.getElementById('discountLimitWarning');
        if (existingWarning) existingWarning.remove();
    }

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
}

function hideAllUI() {
    const packageIdForm = document.getElementById('packageIdForm');
    const quotationFormContainer = document.getElementById('quotationFormContainer');
    const errorMessage = document.getElementById('errorMessage');
    const warningMessage = document.getElementById('warningMessage');

    if (packageIdForm) packageIdForm.classList.add('hidden');
    if (quotationFormContainer) quotationFormContainer.classList.add('hidden');
    if (errorMessage) errorMessage.classList.add('hidden');
    if (warningMessage) warningMessage.classList.add('hidden');
}

function pageLog(msg, color = 'gray-400') {
    const log = document.getElementById('debugLog');
    if (log) {
        const span = document.createElement('div');
        span.textContent = `> ${msg}`;
        log.appendChild(span);
    }
    console.log(`[PageLog] ${msg}`);
}

function setSectionStatus(sectionId, label, tone = 'neutral') {
    const toneClasses = {
        neutral: 'text-slate-500',
        ready: 'text-emerald-600',
        warning: 'text-amber-600',
        error: 'text-red-600',
        optional: 'text-slate-500'
    };

    document.querySelectorAll(`[data-status-for="${sectionId}"]`).forEach((el) => {
        el.textContent = label;
        el.classList.remove('text-slate-500', 'text-emerald-600', 'text-amber-600', 'text-red-600');
        el.classList.add(toneClasses[tone] || toneClasses.neutral);
    });
}

function scrollToWorkspaceSection(sectionId) {
    const target = document.getElementById(sectionId);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function refreshActiveWorkspaceSection() {
    const sections = Array.from(document.querySelectorAll('[data-section]'));
    if (!sections.length) return;

    let activeId = sections[0].id;
    const threshold = window.innerHeight * 0.3;

    sections.forEach((section) => {
        const rect = section.getBoundingClientRect();
        if (rect.top <= threshold && rect.bottom >= threshold / 2) {
            activeId = section.id;
        }
    });

    document.querySelectorAll('.workspace-nav-item').forEach((button) => {
        const isActive = button.dataset.target === activeId;
        button.classList.toggle('border-slate-900', isActive);
        button.classList.toggle('bg-slate-900', isActive);
        button.classList.toggle('text-white', isActive);
        if (isActive) {
            button.querySelectorAll('span').forEach((span) => {
                span.classList.add('text-white');
            });
        } else {
            button.classList.remove('text-white');
            button.querySelectorAll('span').forEach((span) => {
                span.classList.remove('text-white');
            });
        }
    });
}

function updateWorkspaceStatuses() {
    const packageReady = Boolean(document.getElementById('packageIdHidden')?.value);
    setSectionStatus('package-summary', packageReady ? 'Ready' : 'Pending', packageReady ? 'ready' : 'warning');

    const customerName = document.getElementById('customerName')?.value?.trim();
    const leadSource = document.getElementById('customerLeadSource')?.value?.trim();
    const remark = document.getElementById('customerRemark')?.value?.trim();
    const customerReady = !customerName || (leadSource && remark);
    setSectionStatus('customer-lead', customerReady ? 'Ready' : 'Needs attention', customerReady ? 'ready' : 'error');

    const pricingHealthy = !window._extraItemsDiscountExceeded && !window._maxDiscountExceeded && !window._subtotalIsZeroOrNegative;
    setSectionStatus('price-controls', pricingHealthy ? 'Ready' : 'Needs attention', pricingHealthy ? 'ready' : 'error');

    const paymentRows = document.querySelectorAll('#paymentMethodsContainer > *').length;
    setSectionStatus('payment-setup', paymentRows > 0 ? 'Ready' : 'Pending', paymentRows > 0 ? 'ready' : 'warning');

    const voucherLabel = activeVoucherInvoiceId
        ? (voucherStepApplied ? 'Ready' : 'Open after save')
        : 'Optional';
    const voucherTone = activeVoucherInvoiceId ? (voucherStepApplied ? 'ready' : 'warning') : 'optional';
    setSectionStatus('voucher-selection', voucherLabel, voucherTone);

    const reviewReady = packageReady && customerReady && pricingHealthy;
    setSectionStatus('final-review', reviewReady ? 'Ready' : 'Pending', reviewReady ? 'ready' : 'warning');

    refreshActiveWorkspaceSection();
}

function initWorkspaceShell() {
    document.querySelectorAll('.workspace-nav-item').forEach((button) => {
        button.addEventListener('click', () => {
            const mobilePanel = document.getElementById('mobileSectionPanel');
            mobilePanel?.classList.add('hidden');
            scrollToWorkspaceSection(button.dataset.target);
        });
    });

    const mobileToggle = document.getElementById('mobileSectionToggle');
    const mobileClose = document.getElementById('mobileSectionClose');
    const mobilePanel = document.getElementById('mobileSectionPanel');
    mobileToggle?.addEventListener('click', () => mobilePanel?.classList.remove('hidden'));
    mobileClose?.addEventListener('click', () => mobilePanel?.classList.add('hidden'));
    mobilePanel?.addEventListener('click', (event) => {
        if (event.target === mobilePanel) mobilePanel.classList.add('hidden');
    });

    window.addEventListener('scroll', refreshActiveWorkspaceSection, { passive: true });
    updateWorkspaceStatuses();
}

function setPostSubmitStatus(message) {
    const el = document.getElementById('postSubmitFlowStatus');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
}

async function openInlineVoucherStep({ invoiceId, nextUrl, sourceInvoiceId = '', scrollToSection = true }) {
    const hint = document.getElementById('voucherInlineHint');
    const root = document.getElementById('voucherStepRoot');
    if (!root || !window.InvoiceVoucherStep) return;

    activeVoucherInvoiceId = invoiceId;
    activeVoucherNextUrl = nextUrl;
    voucherStepApplied = false;

    hint?.classList.add('hidden');
    root.classList.remove('hidden');

    if (!inlineVoucherStep) {
        inlineVoucherStep = window.InvoiceVoucherStep.create(root, {
            title: 'Voucher Selection',
            subtitle: 'Select vouchers here, then continue to the finished quotation.',
            applyLabel: 'Apply Vouchers and Continue',
            skipLabel: 'Skip for Now',
            onChange: () => updateWorkspaceStatuses(),
            onApplied: () => {
                voucherStepApplied = true;
                updateWorkspaceStatuses();
                window.location.href = activeVoucherNextUrl || `/invoice-office?id=${encodeURIComponent(activeVoucherInvoiceId)}`;
            },
            onSkipped: () => {
                updateWorkspaceStatuses();
                window.location.href = activeVoucherNextUrl || `/invoice-office?id=${encodeURIComponent(activeVoucherInvoiceId)}`;
            }
        });
    }

    await inlineVoucherStep.load({ invoiceId, nextUrl, sourceInvoiceId });
    setPostSubmitStatus('Quotation saved. Voucher selection is now ready below.');
    updateWorkspaceStatuses();
    if (scrollToSection) {
        scrollToWorkspaceSection('voucher-selection');
    }
}

// Initialize preview on page load
document.addEventListener('DOMContentLoaded', async function () {
    console.log('DOM Content Loaded - Initializing Creation Page');
    initWorkspaceShell();

    // Initialize CustomerManager for inline mode
    CustomerManager.initInline({
        fieldIds: {
            name: 'customerName',
            phone: 'customerPhone',
            address: 'customerAddress',
            profilePicture: 'profilePicture',
            profilePreview: 'profilePreview'
        }
    });

    const detectionStatus = document.getElementById('detectionStatus');
    const detectedPackageIdEl = document.getElementById('detectedPackageId');

    // 1. Initial State: Force hide everything immediately
    hideAllUI();
    pageLog('Initializing creation page...');

    // 2. Fetch User Profile (non-blocking for UI)
    fetchUserProfile();

    // 3. Parse URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const packageId = urlParams.get('linked_package') || urlParams.get('package_id');
    const panelQty = urlParams.get('panel_qty');
    const panelRating = urlParams.get('panel_rating');
    const packageType = urlParams.get('package_type') || urlParams.get('type');
    const editInvoiceId = urlParams.get('edit_invoice_id') || urlParams.get('id');
    const selectedReferralFromUrl = urlParams.get('linked_referral') || '';
    referralInvoiceFilterId = editInvoiceId || null;

    await fetchAssignedReferralLeads(selectedReferralFromUrl, {
        autofillSelection: Boolean(selectedReferralFromUrl)
    });

    if (packageId) {
        if (detectedPackageIdEl) detectedPackageIdEl.textContent = packageId;
        if (detectionStatus) detectionStatus.textContent = 'PACKAGE DETECTED';
        pageLog(`URL contains package ID: ${packageId}`);
    } else if (panelQty && panelRating) {
        if (detectionStatus) detectionStatus.textContent = 'PANEL SPECS DETECTED';
        pageLog(`URL contains specs: ${panelQty} panels @ ${panelRating}`);
    } else {
        if (detectionStatus) detectionStatus.textContent = 'NO PACKAGE PARAMS';
        pageLog('No package identification found in URL.');
    }

    // 4. Initialization Logic Branching
    try {
        // BRANCH A: Edit Mode
        if (editInvoiceId && (window.location.pathname.includes('edit-invoice') || urlParams.get('edit_invoice_id'))) {
            pageLog(`Entering Edit Mode for: ${editInvoiceId}`);
            window.isEditMode = true;
            window.editInvoiceId = editInvoiceId;

            document.querySelector('h1').textContent = 'Edit Quotation';
            const submitBtn = document.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.textContent = 'Save New Version';

            showWarning('Loading your quotation...');

            const res = await fetch(`/api/v1/invoices/${editInvoiceId}`);
            if (!res.ok) throw new Error('Failed to fetch invoice');
            const json = await res.json();

            if (json.success && json.data) {
                const inv = json.data;
                const invPackageId = inv.linked_package || inv.legacy_pid_to_be_deleted || inv.package_id;

                if (invPackageId) {
                    pageLog(`Invoice linked to package: ${invPackageId}`);
                    await fetchPackageDetails(invPackageId);
                } else {
                    showWarning(`⚠️ This invoice doesn't have a package.`);
                    document.getElementById('packageIdForm').classList.remove('hidden');
                }

                // ... pre-fill logic
                if (inv.customer_name_snapshot) document.getElementById('customerName').value = inv.customer_name_snapshot;
                if (inv.customer_phone_snapshot) document.getElementById('customerPhone').value = inv.customer_phone_snapshot;
                if (inv.customer_address_snapshot) document.getElementById('customerAddress').value = inv.customer_address_snapshot;
                setHiddenFieldValue('customerAverageTnb', inv.customer_average_tnb);
                setHiddenFieldValue('estimatedSaving', inv.estimated_saving);
                setHiddenFieldValue('estimatedNewBillAmount', inv.estimated_new_bill_amount);
                setHiddenFieldValue('solarSunPeakHour', inv.solar_sun_peak_hour);
                setHiddenFieldValue('solarMorningUsagePercent', inv.solar_morning_usage_percent);
                if (inv.linked_referral) applyAssignedReferralSelection(inv.linked_referral, { autofill: false });

                let discountVal = '';
                if (inv.discount_fixed > 0) discountVal += inv.discount_fixed;
                if (inv.discount_percent > 0) discountVal += (discountVal ? ' ' : '') + `${inv.discount_percent}%`;
                document.getElementById('discountGiven').value = discountVal;

                if (inv.sst_amount > 0) document.getElementById('applySST').checked = true;
                window.currentAgentMarkup = inv.agent_markup || 0;

                if (inv.items) {
                    let ballastQty = 0;
                    inv.items.forEach(item => {
                        const type = (item.item_type || '').toLowerCase();
                        if (type === 'extra' || (!type && !item.is_a_package)) {
                            if (isBallastItem(item)) {
                                ballastQty += parseInt(item.qty, 10) || Math.round((parseFloat(item.total_price) || 0) / BALLAST_UNIT_PRICE) || 0;
                            } else {
                                addManualItem({
                                    description: item.description,
                                    qty: parseFloat(item.qty) || 1,
                                    unit_price: parseFloat(item.unit_price) || 0
                                });
                            }
                        }
                    });
                    setBallastQty(ballastQty);
                }

                // Clear loading warning if everything is okay
                document.getElementById('warningMessage').classList.add('hidden');
            } else {
                throw new Error(json.error || 'Failed to load invoice data');
            }
        }
        // BRANCH B: Direct Creation with Package ID
        else if (packageId) {
            pageLog('Attempting to fetch package details...');
            showWarning('Loading package details...');
            await fetchPackageDetails(packageId);
            pageLog('Package details loaded successfully.');
            addPaymentMethodRow();
            // Clear loading warning
            document.getElementById('warningMessage').classList.add('hidden');
        }
        // BRANCH C: Panel/Rating Lookup
        else if (panelQty && panelRating) {
            pageLog(`Attempting lookup for ${panelQty} panels @ ${panelRating}...`);
            showWarning('🔍 Searching for the best solar package for you...');

            const ratingInt = parseInt(panelRating.replace(/\D/g, ''));
            const lookupParams = new URLSearchParams({
                panelQty,
                panelType: String(ratingInt)
            });
            if (packageType) lookupParams.set('type', packageType);
            const lookupRes = await fetch(`/readonly/package/lookup?${lookupParams.toString()}`);
            const lookupData = await lookupRes.json();

            if (lookupData.packages && lookupData.packages.length > 0) {
                const pkg = lookupData.packages[0];
                pageLog(`Lookup found: ${pkg.package_name} (${pkg.bubble_id})`);
                await showPackage(pkg);
                document.getElementById('warningMessage').classList.add('hidden');
            } else {
                throw new Error(`No package found matching ${panelQty} panels @ ${panelRating}`);
            }
            addPaymentMethodRow();
        }
        // BRANCH D: Browse Mode
        else {
            pageLog('No parameters found, prompting user to browse.');
            document.getElementById('packageIdForm').classList.remove('hidden');
            addPaymentMethodRow();
        }
    } catch (err) {
        pageLog(`FATAL ERROR: ${err.message}`, 'red-400');
        showError(`Failed to initialize: ${err.message}`);
        // If it failed but wasn't browse mode, show browse as fallback
        if (!packageId && !(panelQty && panelRating)) {
            document.getElementById('packageIdForm').classList.remove('hidden');
        }
    }

    // Always pre-fill common fields from URL
    if (urlParams.get('customer_name')) document.getElementById('customerName').value = urlParams.get('customer_name');
    if (urlParams.get('customer_phone')) document.getElementById('customerPhone').value = urlParams.get('customer_phone');
    if (urlParams.get('customer_address')) document.getElementById('customerAddress').value = urlParams.get('customer_address');
    if (urlParams.get('discount_given')) document.getElementById('discountGiven').value = urlParams.get('discount_given');
    if (urlParams.get('apply_sst') === 'true') document.getElementById('applySST').checked = true;
    applySolarSavingsParams(urlParams);
    if (selectedReferralFromUrl) applyAssignedReferralSelection(selectedReferralFromUrl, { autofill: true });

    // Setup listeners
    const addManualItemBtn = document.getElementById('addManualItemBtn');
    if (addManualItemBtn) addManualItemBtn.addEventListener('click', () => addManualItem());

    const assignedReferralSelect = document.getElementById('assignedReferralSelect');
    if (assignedReferralSelect) {
        assignedReferralSelect.addEventListener('change', (event) => {
            applyAssignedReferralSelection(event.target.value, { autofill: true });
        });
    }

    const sstToggle = document.getElementById('applySST');
    if (sstToggle) sstToggle.addEventListener('change', updateInvoicePreview);

    const earnNowToggle = document.getElementById('applyEarnNowRebate');
    if (earnNowToggle) earnNowToggle.addEventListener('change', updateInvoicePreview);

    const earthMonthToggle = document.getElementById('applyEarthMonthGoGreenBonus');
    if (earthMonthToggle) earthMonthToggle.addEventListener('change', updateInvoicePreview);

    const discountInput = document.getElementById('discountGiven');
    if (discountInput) {
        discountInput.addEventListener('input', updateInvoicePreview);
        discountInput.addEventListener('change', updateInvoicePreview);
    }

    // Micro Inverter qty inputs
    MICRO_INVERTER_MODELS.forEach(model => {
        const input = document.getElementById(`${model.id}_qty`);
        if (input) {
            input.addEventListener('input', updateInvoicePreview);
            input.addEventListener('change', updateInvoicePreview);
        }
    });

    const ballastQtyInput = document.getElementById('ballastQty');
    if (ballastQtyInput) {
        ballastQtyInput.addEventListener('input', () => {
            getBallastQty();
            updateInvoicePreview();
        });
        ballastQtyInput.addEventListener('change', () => {
            getBallastQty();
            updateInvoicePreview();
        });
    }

    const addBtn = document.getElementById('addPaymentMethodBtn');
    if (addBtn) addBtn.addEventListener('click', addPaymentMethodRow);

    updateBallastLimitText();
    updatePromotionOptionsUI();
    updateInvoicePreview();
    updateWorkspaceStatuses();
});

async function fetchUserProfile() {
    try {
        const response = await fetch('/api/user/me');
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.user) {
                const welcomeDiv = document.getElementById('userWelcome');
                const nameSpan = document.getElementById('userNameDisplay');

                if (welcomeDiv && nameSpan) {
                    nameSpan.textContent = data.user.name || 'User';
                    welcomeDiv.classList.remove('hidden');
                }
            }
        }
    } catch (err) {
        console.error('Error fetching user profile:', err);
    }
}

async function fetchPackageDetails(packageId) {
    try {
        const response = await fetch(`/api/package/${packageId}`);

        // Check response status before parsing JSON
        if (!response.ok) {
            if (response.status === 404) {
                showError(`⚠️ Package Not Found: The Package ID '${packageId}' does not exist in database.`);
            } else if (response.status === 400) {
                showError(`⚠️ Invalid Package ID: '${packageId}' is not a valid ID format.`);
            } else {
                showError(`⚠️ Server Error: Failed to fetch package. Status: ${response.status}`);
            }
            document.getElementById('packageIdForm').classList.remove('hidden');
            return;
        }

        const result = await response.json();

        if (result.success && result.package) {
            showPackage(result.package);
        } else {
            showError(`⚠️ Package Not Found: The Package ID '${packageId}' does not exist in database.`);
            document.getElementById('packageIdForm').classList.remove('hidden');
        }
    } catch (err) {
        console.error('Error fetching package:', err);
        showError(`⚠️ Database Error: Failed to check package. Error: ${err.message}`);
        document.getElementById('packageIdForm').classList.remove('hidden');
    }
}

function showPackage(pkg) {
    console.log('showPackage called with:', pkg);

    // Safety check for null/undefined pkg
    if (!pkg || typeof pkg !== 'object') {
        showError('⚠️ Package data is missing or invalid. Please try again.');
        document.getElementById('packageIdForm').classList.remove('hidden');
        document.getElementById('quotationFormContainer').classList.add('hidden');
        return;
    }

    if (!pkg.bubble_id) {
        console.error('Package object missing bubble_id:', pkg);
        showError('⚠️ Invalid Package Data: Package ID is missing. Please select a valid package.');
        document.getElementById('packageIdForm').classList.remove('hidden');
        document.getElementById('quotationFormContainer').classList.add('hidden');
        return;
    }

    const packageInfo = document.getElementById('quotationFormContainer');
    packageInfo.classList.remove('hidden');

    updatePackageTypeHeader(pkg.type);

    document.getElementById('packageNameDisplay').textContent = pkg.name || pkg.invoice_desc || `Package ${pkg.bubble_id}`;
    document.getElementById('packagePriceDisplay').textContent = `RM ${(parseFloat(pkg.price) || 0).toFixed(2)}`;

    document.getElementById('packagePrice').value = pkg.price || 0;
    document.getElementById('packageName').value = pkg.name || pkg.invoice_desc || `Package ${pkg.bubble_id}`;
    document.getElementById('packageIdHidden').value = pkg.bubble_id;

    // Store panel quantity for promotion detection
    window.currentPanelQty = pkg.panel_qty || 0;
    setBallastQty(document.getElementById('ballastQty')?.value || 0);
    updatePromotionOptionsUI();

    // Handle tiered max discount policy
    const pkgPriceForLimit = parseFloat(pkg.price) || 0;
    const { maxPercent, maxAmount } = getManualDiscountPolicy(pkgPriceForLimit);
    window.maxDiscountAllowed = maxAmount;
    window.maxDiscountPercentAllowed = maxPercent;
    const maxDiscountRow = document.getElementById('maxDiscountRow');
    const maxDiscountDisplay = document.getElementById('maxDiscountDisplay');

    // New persistent display under input
    const inputMaxDiscountRow = document.getElementById('inputMaxDiscountRow');
    const inputMaxDiscountDisplay = document.getElementById('inputMaxDiscountDisplay');

    // Always show — limit is unconditional
    if (maxDiscountRow) maxDiscountRow.classList.remove('hidden');
    if (maxDiscountDisplay) maxDiscountDisplay.textContent = `RM ${window.maxDiscountAllowed.toFixed(2)} (${maxPercent}% of package price)`;

    if (inputMaxDiscountRow) inputMaxDiscountRow.classList.remove('hidden');
    if (inputMaxDiscountDisplay) inputMaxDiscountDisplay.textContent = `Max discount: RM ${window.maxDiscountAllowed.toFixed(2)} (${maxPercent}% of package price)`;

    if (pkg.invoice_desc) {
        const descContainer = document.getElementById('packageDescContainer');
        descContainer.classList.remove('hidden');
        document.getElementById('packageDescDisplay').textContent = pkg.invoice_desc;
    }

    // Set form values from URL
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('customer_name')) {
        document.getElementById('customerName').value = urlParams.get('customer_name');
    }
    if (urlParams.get('customer_phone')) {
        document.getElementById('customerPhone').value = urlParams.get('customer_phone');
    }
    if (urlParams.get('customer_address')) {
        document.getElementById('customerAddress').value = urlParams.get('customer_address');
    }
    if (urlParams.get('discount_given')) {
        document.getElementById('discountGiven').value = urlParams.get('discount_given');
    }
    if (urlParams.get('apply_sst') === 'true') {
        document.getElementById('applySST').checked = true;
    }
    if (urlParams.get('template_id')) {
        document.getElementById('templateIdHidden').value = urlParams.get('template_id');
    }
    applySolarSavingsParams(urlParams);

    updateInvoicePreview();
}

function normalizePackageTypeHeader(rawType) {
    const value = String(rawType || '').trim().toLowerCase();
    if (!value) return null;

    if (value === 'residential' || value === 'resi') {
        return {
            label: 'RESIDENTIAL',
            classes: ['bg-emerald-950']
        };
    }

    if (
        value === 'commercial'
        || value === 'non-resi'
        || value === 'non_resi'
        || value === 'non residential'
        || value === 'non-residential'
    ) {
        return {
            label: 'COMMERCIAL',
            classes: ['bg-slate-900']
        };
    }

    return null;
}

function updatePackageTypeHeader(rawType) {
    const header = document.getElementById('packageTypeHeader');
    const label = document.getElementById('packageTypeHeaderText');
    if (!header || !label) return;

    const config = normalizePackageTypeHeader(rawType);
    header.classList.remove('bg-emerald-950', 'bg-slate-900');

    if (!config) {
        header.classList.add('hidden');
        label.textContent = '';
        return;
    }

    label.textContent = config.label;
    header.classList.add(...config.classes);
    header.classList.remove('hidden');
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.classList.remove('hidden');
    document.getElementById('errorText').textContent = message;
    updateWorkspaceStatuses();
}

function showWarning(message) {
    const warningDiv = document.getElementById('warningMessage');
    warningDiv.classList.remove('hidden');
    document.getElementById('warningText').textContent = message;
    updateWorkspaceStatuses();
}

function buildPostSubmitVoucherStepUrl({ invoiceId, nextUrl }) {
    const params = new URLSearchParams();
    if (invoiceId) params.set('id', invoiceId);
    if (nextUrl) params.set('next', nextUrl);
    return `/invoice-vouchers?${params.toString()}`;
}

function resolveCreateFlowNextUrl(result) {
    if (result?.invoice_link) return result.invoice_link;
    if (result?.data?.shareToken) return `/view/${result.data.shareToken}`;
    if (result?.data?.bubbleId) return `/invoice-office?id=${result.data.bubbleId}`;
    return '/my-invoice';
}

// Handle form submission
document.getElementById('quotationForm')?.addEventListener('submit', async function (e) {
    e.preventDefault();
    const formData = new FormData(this);
    const data = Object.fromEntries(formData);

    console.log('Form Submit Debug:', data);
    console.log('Linked Package Value:', data.linked_package);
    console.log('Hidden Input Value:', document.getElementById('packageIdHidden').value);

    // Block submission if extra items discount exceeds 5% cap
    if (window._extraItemsDiscountExceeded) {
        const pkgPrice = parseFloat(document.getElementById('packagePrice')?.value || 0);
        const maxRM = (pkgPrice * EXTRA_ITEMS_MAX_DISCOUNT_PERCENT / 100).toFixed(2);
        Swal.fire({
            icon: 'error',
            title: 'Discount Limit Exceeded',
            text: `Additional items discount cannot exceed ${EXTRA_ITEMS_MAX_DISCOUNT_PERCENT}% of the package price (RM ${maxRM}). Please adjust the negative item amounts.`
        });
        return;
    }

    if (window._maxDiscountExceeded) {
        Swal.fire({
            icon: 'error',
            title: 'Max Discount Exceeded',
            text: `The discount entered exceeds the maximum allowed discount of RM ${window.maxDiscountAllowed.toFixed(2)} (${window.maxDiscountPercentAllowed || 0}% of package price).`
        });
        return;
    }

    if (window._subtotalIsZeroOrNegative) {
        Swal.fire({
            icon: 'error',
            title: 'Invalid Total Amount',
            text: 'The total amount cannot be zero or negative after applying discounts. Please adjust the discounts.'
        });
        return;
    }

    // Require lead_source when customer name is provided
    const customerName = document.getElementById('customerName')?.value?.trim();
    const leadSource = document.getElementById('customerLeadSource')?.value;
    const remark = document.getElementById('customerRemark')?.value;

    if (customerName && !leadSource) {
        Swal.fire({
            icon: 'error',
            title: 'Lead Source Required',
            text: 'Please select a lead source for the customer.'
        });
        return;
    }

    if (customerName && !remark?.trim()) {
        Swal.fire({
            icon: 'error',
            title: 'Remark Required',
            text: 'Please add a remark for the customer.'
        });
        return;
    }

    // Show loading state
    const submitBtn = this.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating...';

    // Calculate EPP fees
    const eppData = calculateAllEPPFees();
    const promotionAmounts = getAppliedPromotionAmounts();

    // Prepare extra items (Manual Items + Micro Inverters)
    const extraItems = getAdditionalInvoiceItems().map(item => ({
        description: item.description,
        qty: item.qty,
        unit_price: item.unit_price,
        total_price: item.qty * item.unit_price
    }));

    try {
        // Prepare request data
        const requestData = {
            linked_package: data.linked_package,
            template_id: data.template_id || null,
            linked_referral: data.linked_referral || null,
            customer_name: data.customer_name || null,
            customer_phone: data.customer_phone || null,
            customer_address: data.customer_address || null,
            profilePicture: document.getElementById('profilePicture').value || null,
            lead_source: document.getElementById('customerLeadSource')?.value || null,
            remark: document.getElementById('customerRemark')?.value || null,
            customer_average_tnb: document.getElementById('customerAverageTnb')?.value || null,
            estimated_saving: document.getElementById('estimatedSaving')?.value || null,
            estimated_new_bill_amount: document.getElementById('estimatedNewBillAmount')?.value || null,
            solar_sun_peak_hour: document.getElementById('solarSunPeakHour')?.value || null,
            solar_morning_usage_percent: document.getElementById('solarMorningUsagePercent')?.value || null,
            discount_given: data.discount_given || null,
            apply_earn_now_rebate: promotionAmounts.earnNowAppliedAmount > 0,
            apply_earth_month_go_green_bonus: promotionAmounts.earthMonthAppliedAmount > 0,
            apply_sst: document.getElementById('applySST')?.checked || false,
            payment_structure: eppData.payment_structure,
            extra_items: extraItems,
            followUpDays: data.follow_up_days || null
        };

        // Add EPP fee data if exists
        if (eppData.total_fee > 0 && eppData.description) {
            requestData.epp_fee_amount = eppData.total_fee;
            requestData.epp_fee_description = eppData.description;
        }

        // Handle Edit Mode vs Create Mode
        let endpoint = '/api/v1/invoices/on-the-fly';
        if (window.isEditMode && window.editInvoiceId) {
            endpoint = `/api/v1/invoices/${window.editInvoiceId}/version`;
            // Preserve markup
            requestData.agent_markup = window.currentAgentMarkup || 0;
        }

        // Call the API
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });

        const result = await response.json();

        if (response.ok && result.success) {
            const createdInvoiceId = result?.data?.bubbleId || '';
            await openInlineVoucherStep({
                invoiceId: createdInvoiceId,
                nextUrl: resolveCreateFlowNextUrl(result)
            });
        } else {
            alert('Error: ' + (result.error || result.detail || 'Failed to process quotation'));
        }
    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
});

// ============================================
// WhatsApp Integration - Uses CustomerManager
// ============================================
function checkWhatsApp() {
    CustomerManager.checkWhatsApp('customerPhone', {
        profilePictureInputId: 'profilePicture',
        profilePreviewId: 'profilePreview'
    });
}

function fillWhatsAppInfo(photoUrl, phone) {
    CustomerManager.fillWhatsAppInfo(photoUrl, phone, 'profilePicture', 'profilePreview');
}
