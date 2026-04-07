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
const BALLAST_UNIT_PRICE = 120;
const APRIL_2026_PROMO_END = new Date('2026-05-01T00:00:00');

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

    return items;
}

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
    const promotionsEnabled = isApril2026PromotionActive();

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
    const promotionsEnabled = isApril2026PromotionActive();
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
        earnNowHint.textContent = earnNowEligibleAmount > 0
            ? `${panelQty} panels detected. Toggle to apply this rebate.`
            : 'Eligible for 11 to 36 solar panels only.';
    }

    if (earthMonthHint) {
        earthMonthHint.textContent = earthMonthEligibleAmount > 0
            ? `${panelQty} panels detected. Toggle to apply this bonus.`
            : 'Eligible for 11 to 36 solar panels only.';
    }
}

function hydratePromotionSelections(items = []) {
    const earnNowToggle = document.getElementById('applyEarnNowRebate');
    const earthMonthToggle = document.getElementById('applyEarthMonthGoGreenBonus');
    const earnNowApplied = items.some((item) => String(item?.description || '').toLowerCase().includes('earn now rebate'));
    const earthMonthApplied = items.some((item) => String(item?.description || '').toLowerCase().includes('earth month go green bonus'));

    if (earnNowToggle) {
        earnNowToggle.checked = earnNowApplied;
    }

    if (earthMonthToggle) {
        earthMonthToggle.checked = earthMonthApplied;
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
            button.querySelectorAll('span').forEach((span) => span.classList.add('text-white'));
        } else {
            button.classList.remove('text-white');
            button.querySelectorAll('span').forEach((span) => span.classList.remove('text-white'));
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

    const voucherRootVisible = !document.getElementById('voucherStepRoot')?.classList.contains('hidden');
    const voucherLabel = !packageReady
        ? 'Select package first'
        : selectedDraftVouchers.length > 0
            ? `${selectedDraftVouchers.length} selected`
            : voucherRootVisible
                ? 'Optional'
                : 'Loading';
    const voucherTone = !packageReady
        ? 'warning'
        : selectedDraftVouchers.length > 0
            ? 'ready'
            : voucherRootVisible
                ? 'optional'
                : 'warning';
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

async function fetchVoucherPreviewData(packageId) {
    const response = await fetch(`/api/v1/vouchers/preview?package_id=${encodeURIComponent(packageId)}`, {
        credentials: 'same-origin'
    });
    const json = await response.json();
    if (!response.ok) {
        throw new Error(json?.error || 'Failed to load voucher preview.');
    }
    return json?.data || {};
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
        const payload = await fetchVoucherPreviewData(packageId);
        hint?.classList.add('hidden');
        root.classList.remove('hidden');
        await inlineVoucherStep.loadPayload(payload, {
            selectedIds
        });
        updateWorkspaceStatuses();
        if (scrollToSection) {
            scrollToWorkspaceSection('voucher-selection');
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
    const discountInput = document.getElementById('discountGiven')?.value || '';
    const discount = parseDiscount(discountInput);

    // Calculate extra items total
    const extraItemsTotal = getAdditionalInvoiceItems()
        .reduce((sum, item) => sum + item.total_price, 0);

    let subtotalAfterDiscount = packagePrice + extraItemsTotal;
    if (discount.fixed > 0) subtotalAfterDiscount -= discount.fixed;
    if (discount.percent > 0) subtotalAfterDiscount -= (packagePrice * discount.percent / 100);
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
    const discountInput = document.getElementById('discountGiven')?.value || '';
    const discount = parseDiscount(discountInput);

    // Calculate extra items total
    const extraItemsTotal = getAdditionalInvoiceItems()
        .reduce((sum, item) => sum + item.total_price, 0);

    let subtotalAfterDiscount = packagePrice + extraItemsTotal;
    if (discount.fixed > 0) subtotalAfterDiscount -= discount.fixed;
    if (discount.percent > 0) subtotalAfterDiscount -= (packagePrice * discount.percent / 100);
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
    const discountInput = document.getElementById('discountGiven')?.value || '';
    const discount = parseDiscount(discountInput);
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

    // Calculate subtotal (starting with package price)
    let subtotal = packagePrice - promotionAmounts.totalAppliedAmount;

    // Add Extra Items
    getAdditionalInvoiceItems().forEach(item => {
        const itemToneClass = item.item_kind === 'ballast' ? 'text-cyan-800' : 'text-gray-900';
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

// Load invoice data on page load
document.addEventListener('DOMContentLoaded', async function () {
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

    // Fetch User Profile
    fetchUserProfile();

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
            if (inv.customer_name) document.getElementById('customerName').value = inv.customer_name;
            if (inv.customer_phone) document.getElementById('customerPhone').value = inv.customer_phone;
            if (inv.customer_address) document.getElementById('customerAddress').value = inv.customer_address;
            if (inv.linked_referral) {
                renderAssignedReferralOptions(inv.linked_referral);
                applyAssignedReferralSelection(inv.linked_referral, { autofill: false });
            }

            // 2.5 Load Profile Picture
            if (inv.profile_picture) {
                document.getElementById('profilePicture').value = inv.profile_picture;
                document.getElementById('profilePreview').innerHTML = `<img src="${inv.profile_picture}" class="h-full w-full object-cover">`;
            }

            // 2.6 Load Lead Source & Remark from customer
            if (inv.lead_source) document.getElementById('customerLeadSource').value = inv.lead_source;
            if (inv.remark) document.getElementById('customerRemark').value = inv.remark;

            // 3. Discount
            let discountVal = '';
            if (inv.discount_fixed > 0) discountVal += inv.discount_fixed;
            if (inv.discount_percent > 0) discountVal += (discountVal ? ' ' : '') + `${inv.discount_percent}%`;
            document.getElementById('discountGiven').value = discountVal;

            // 4. SST
            if (inv.sst_amount > 0) document.getElementById('applySST').checked = true;

            // 5. Markup (Preserve)
            window.currentAgentMarkup = inv.agent_markup || 0;

            // 6. Extra/Manual Items - Load ALL items from database
            if (inv.items && Array.isArray(inv.items)) {
                console.log('[Edit Invoice] Loading', inv.items.length, 'items from invoice');
                loadedInvoiceItems = inv.items;

                // Group items by type
                const packageItems = inv.items.filter(i => i.is_a_package || i.item_type === 'package');
                const extraItems = inv.items.filter(i => i.item_type === 'extra');
                const discountItems = inv.items.filter(i => i.item_type === 'discount');
                const noticeItems = inv.items.filter(i => i.item_type === 'notice');
                const eppFeeItems = inv.items.filter(i => i.item_type === 'epp_fee');

                console.log('[Edit Invoice] Item breakdown:', {
                    package: packageItems.length,
                    extra: extraItems.length,
                    discount: discountItems.length,
                    notice: noticeItems.length,
                    epp_fee: eppFeeItems.length
                });

                // Load extra items as manual items (editable)
                let ballastQty = 0;
                extraItems.forEach(item => {
                    if (isBallastItem(item)) {
                        ballastQty += parseInt(item.qty, 10) || Math.round((parseFloat(item.total_price) || 0) / BALLAST_UNIT_PRICE) || 0;
                    } else {
                        addManualItem({
                            description: item.description,
                            qty: parseFloat(item.qty) || 1,
                            unit_price: parseFloat(item.unit_price) || 0
                        });
                    }
                });
                setBallastQty(ballastQty);

                // Note: Package, discount, and EPP fee items are handled
                // by their respective form fields and will be recreated on submit
            } else {
                console.warn('[Edit Invoice] No items found in invoice data');
            }
            hydratePromotionSelections(loadedInvoiceItems);
            // 7. Trigger preview update
            updateInvoicePreview();

            // 8. Add first payment method row (default: Cash, 100%)
            addPaymentMethodRow();

            const invoiceVoucherPayload = await window.InvoiceVoucherStep.fetchVoucherStepData(editInvoiceId);
            const selectedVoucherIds = window.InvoiceVoucherStep.readSelectedVoucherIds(invoiceVoucherPayload);
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

    // Manual Item Listener
    const addManualItemBtn = document.getElementById('addManualItemBtn');
    if (addManualItemBtn) {
        addManualItemBtn.addEventListener('click', () => addManualItem());
    }

    const assignedReferralSelect = document.getElementById('assignedReferralSelect');
    if (assignedReferralSelect) {
        assignedReferralSelect.addEventListener('change', (event) => {
            applyAssignedReferralSelection(event.target.value, { autofill: true });
        });
    }

    // Update preview when SST toggle changes
    const sstToggle = document.getElementById('applySST');
    if (sstToggle) {
        sstToggle.addEventListener('change', updateInvoicePreview);
    }

    const earnNowToggle = document.getElementById('applyEarnNowRebate');
    if (earnNowToggle) {
        earnNowToggle.addEventListener('change', updateInvoicePreview);
    }

    const earthMonthToggle = document.getElementById('applyEarthMonthGoGreenBonus');
    if (earthMonthToggle) {
        earthMonthToggle.addEventListener('change', updateInvoicePreview);
    }

    // Update preview when discount input changes
    const discountInput = document.getElementById('discountGiven');
    if (discountInput) {
        discountInput.addEventListener('input', updateInvoicePreview);
        discountInput.addEventListener('change', updateInvoicePreview);
    }

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

    // Add payment method button
    const addBtn = document.getElementById('addPaymentMethodBtn');
    if (addBtn) {
        addBtn.addEventListener('click', addPaymentMethodRow);
    }

    const changePackageBtn = document.getElementById('changePackageBtn');
    if (changePackageBtn) {
        changePackageBtn.addEventListener('click', openChangePackageModal);
    }

    updateBallastLimitText();
    updatePromotionOptionsUI();
    updatePackageChangeControls();
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
    window.currentPanelQty = pkg.panel_qty || 0;
    window.currentPackageType = pkg.type || '';
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
    submitBtn.textContent = 'Saving...';

    // Calculate EPP fees
    const eppData = calculateAllEPPFees();

    // Prepare extra items (Manual Items)
    const extraItems = getAdditionalInvoiceItems().map(item => ({
        description: item.description,
        qty: item.qty,
        unit_price: item.unit_price,
        total_price: item.qty * item.unit_price
    }));

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
        discount_given: data.discount_given || null,
        apply_sst: document.getElementById('applySST')?.checked || false,
        applyEarnNowRebate: document.getElementById('applyEarnNowRebate')?.checked || false,
        applyEarthMonthGoGreenBonus: document.getElementById('applyEarthMonthGoGreenBonus')?.checked || false,
        payment_structure: eppData.payment_structure,
        extra_items: extraItems,
        voucher_ids: getSelectedDraftVoucherIds()
    };


    // Add EPP fee data if exists
    if (eppData.total_fee > 0 && eppData.description) {
        requestData.epp_fee_amount = eppData.total_fee;
        requestData.epp_fee_description = eppData.description;
    }

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
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    } catch (error) {
        alert('Error: ' + error.message);
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
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
