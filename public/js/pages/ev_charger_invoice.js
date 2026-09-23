// EV Charger Invoice — package cards come from the package table so the
// price on the card is the price written onto the quotation.

let evChargerPackages = [];
let selectedPackage = null;
let extraItems = [];

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[ch]));
}

function formatRm(amount) {
    return `RM ${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function packageBadge(category) {
    if (category === 'installation') {
        return '<span class="inline-block text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Installation</span>';
    }
    if (category === 'bundle') {
        return '<span class="inline-block text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Charger + Install</span>';
    }
    return '<span class="inline-block text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Charger</span>';
}

// ── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    bindPackageGrid();
    loadPackages();
    renderPresetExtras();
    renderExtraItems();
    bindEvents();
    fetchUserProfile();
});

// ── Package Cards ─────────────────────────────────────
async function loadPackages() {
    const grid = document.getElementById('packageGrid');
    if (grid) {
        grid.innerHTML = '<div class="text-sm text-slate-400 sm:col-span-2">Loading packages...</div>';
    }

    try {
        const response = await fetch('/api/v1/ev-charger/packages');
        const result = await response.json();
        if (!response.ok || !result.success || !Array.isArray(result.packages)) {
            throw new Error(result.error || 'Failed to load packages');
        }

        evChargerPackages = result.packages.map((pkg) => ({
            bubble_id: pkg.bubble_id,
            name: pkg.name,
            shortLabel: pkg.name,
            category: pkg.category,
            price: Number(pkg.price) || 0,
            desc: pkg.desc || ''
        }));
        renderPackageCards();
    } catch (err) {
        if (grid) {
            grid.innerHTML = `<div class="text-sm text-red-600 sm:col-span-2">${escapeHtml(err.message)}</div>`;
        }
    }
}

function renderPackageCards() {
    const grid = document.getElementById('packageGrid');
    if (!grid) return;

    if (!evChargerPackages.length) {
        grid.innerHTML = '<div class="text-sm text-slate-400 sm:col-span-2">No EV charger packages are available.</div>';
        return;
    }

    grid.innerHTML = evChargerPackages.map((pkg) => {
        const descLine = pkg.desc
            ? `<div class="text-[11px] text-slate-400 mt-1 leading-snug">${escapeHtml(pkg.desc)}</div>`
            : '';

        return `
        <div class="pkg-card relative rounded-xl border-2 border-slate-200 bg-white p-4" role="button" tabindex="0" data-bubble-id="${escapeHtml(pkg.bubble_id)}">
            <div class="pkg-check absolute top-2 right-2 h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-white text-xs font-bold">&#10003;</div>
            <div class="mb-2">${packageBadge(pkg.category)}</div>
            <div class="text-sm font-bold text-slate-900 leading-snug">${escapeHtml(pkg.shortLabel)}</div>
            ${descLine}
            <div class="mt-3 text-base font-extrabold text-slate-900">${escapeHtml(formatRm(pkg.price))}</div>
        </div>`;
    }).join('');
}

function bindPackageGrid() {
    const grid = document.getElementById('packageGrid');
    if (!grid || grid.dataset.bound === '1') return;
    grid.dataset.bound = '1';
    grid.addEventListener('click', (event) => {
        const card = event.target.closest('.pkg-card');
        if (!card) return;
        selectPackage(card.dataset.bubbleId);
    });
    grid.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const card = event.target.closest('.pkg-card');
        if (!card) return;
        event.preventDefault();
        selectPackage(card.dataset.bubbleId);
    });
}

function selectPackage(bubbleId) {
    document.querySelectorAll('.pkg-card').forEach(c => c.classList.remove('selected'));

    const card = document.querySelector(`.pkg-card[data-bubble-id="${CSS.escape(bubbleId)}"]`);
    if (card) card.classList.add('selected');

    selectedPackage = evChargerPackages.find(p => p.bubble_id === bubbleId) || null;
    document.getElementById('selectedPackageId').value = bubbleId;

    updateSummary();
    updateSubmitButton();
}

// ── Extra Items ───────────────────────────────────────
const PRESET_EXTRAS = [
    { description: 'Site Visit (before install)', unit_price: 150 },
    { description: 'Extra Cable (per meter, over 15m)', unit_price: 40 },
    { description: 'Upgrade Cable 6mm to 10mm (per meter)', unit_price: 15 },
    { description: 'Conceal & Hacking without paint (per meter)', unit_price: 150 },
    { description: 'Ceiling open hole and make good (per hole)', unit_price: 90 },
    { description: 'Additional wall crossing fee (per wall)', unit_price: 50 },
    { description: '3P63A Weatherproof Isolator', unit_price: 150 }
];

function renderExtraItems() {
    const container = document.getElementById('extraItemsContainer');
    if (!container) return;
    container.innerHTML = '';

    extraItems.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = 'flex gap-2 items-start';
        row.innerHTML = `
            <input type="text" placeholder="Description" value="${item.description || ''}"
                class="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                onchange="updateExtraItem(${idx}, 'description', this.value)">
            <input type="number" placeholder="Qty" value="${item.qty || 1}" min="1"
                class="w-16 rounded-lg border border-slate-200 px-2 py-2 text-sm text-center focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                onchange="updateExtraItem(${idx}, 'qty', this.value)">
            <input type="number" placeholder="Unit price" value="${item.unit_price || 0}" min="0" step="0.01"
                class="w-28 rounded-lg border border-slate-200 px-2 py-2 text-sm text-right focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                onchange="updateExtraItem(${idx}, 'unit_price', this.value)">
            <button type="button" onclick="removeExtraItem(${idx})"
                class="text-slate-400 hover:text-red-500 transition-colors text-lg leading-none p-1">&times;</button>
        `;
        container.appendChild(row);
    });
}

function addExtraItem() {
    extraItems.push({ description: '', qty: 1, unit_price: 0 });
    renderExtraItems();
    // Focus the new description input
    const inputs = document.querySelectorAll('#extraItemsContainer input[type="text"]');
    if (inputs.length) inputs[inputs.length - 1].focus();
}

function renderPresetExtras() {
    const container = document.getElementById('presetExtras');
    if (!container) return;
    container.innerHTML = PRESET_EXTRAS.map((preset, idx) =>
        `<button type="button" onclick="addPresetExtra(${idx})"
            class="text-[11px] font-medium rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-slate-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors">
            ${preset.description} <span class="text-slate-400">RM${preset.unit_price}</span>
        </button>`
    ).join('');
}

function addPresetExtra(presetIdx) {
    const preset = PRESET_EXTRAS[presetIdx];
    if (!preset) return;
    extraItems.push({ description: preset.description, qty: 1, unit_price: preset.unit_price });
    renderExtraItems();
    updateSummary();
}

function updateExtraItem(idx, field, value) {
    if (!extraItems[idx]) return;
    if (field === 'qty' || field === 'unit_price') {
        extraItems[idx][field] = parseFloat(value) || 0;
    } else {
        extraItems[idx][field] = value;
    }
    updateSummary();
}

function removeExtraItem(idx) {
    extraItems.splice(idx, 1);
    renderExtraItems();
    updateSummary();
}

// ── Summary ───────────────────────────────────────────
function updateSummary() {
    const summaryPackage = document.getElementById('summaryPackage');
    const summaryExtraItems = document.getElementById('summaryExtraItems');
    const summaryTotal = document.getElementById('summaryTotal');

    // Package line
    if (selectedPackage) {
        summaryPackage.textContent = `${selectedPackage.shortLabel} — RM ${selectedPackage.price.toLocaleString()}`;
    } else {
        summaryPackage.textContent = '—';
    }

    // Extra items lines
    let extraHtml = '';
    let extraTotal = 0;
    extraItems.forEach(item => {
        const lineTotal = (item.qty || 0) * (item.unit_price || 0);
        extraTotal += lineTotal;
        if (item.description && lineTotal > 0) {
            extraHtml += `<div class="flex justify-between text-slate-500"><span>${item.description} x${item.qty}</span><span>RM ${lineTotal.toLocaleString(undefined, {minimumFractionDigits:2})}</span></div>`;
        }
    });
    summaryExtraItems.innerHTML = extraHtml;

    // Grand total
    const grandTotal = (selectedPackage ? selectedPackage.price : 0) + extraTotal;
    summaryTotal.textContent = `RM ${grandTotal.toLocaleString(undefined, {minimumFractionDigits:2})}`;
}

function updateSubmitButton() {
    const btn = document.getElementById('submitBtn');
    if (btn) btn.disabled = !selectedPackage;
}

// ── Events ────────────────────────────────────────────
function bindEvents() {
    const addBtn = document.getElementById('addExtraItemBtn');
    if (addBtn) addBtn.addEventListener('click', addExtraItem);

    const form = document.getElementById('evChargerForm');
    if (form) form.addEventListener('submit', handleSubmit);
}

// ── Submit ────────────────────────────────────────────
async function handleSubmit(e) {
    e.preventDefault();

    if (!selectedPackage) {
        Swal.fire({ icon: 'warning', title: 'No Package', text: 'Please select a package first.' });
        return;
    }

    const customerName = document.getElementById('customerName')?.value?.trim() || null;
    const customerPhone = document.getElementById('customerPhone')?.value?.trim() || null;
    const customerAddress = document.getElementById('customerAddress')?.value?.trim() || null;
    const leadSource = document.getElementById('customerLeadSource')?.value || null;
    const remark = document.getElementById('customerRemark')?.value?.trim() || null;

    // Validate: if customer name provided, lead source and remark required (same rule as solar invoices)
    if (customerName) {
        if (!leadSource) {
            Swal.fire({ icon: 'warning', title: 'Lead Source Required', text: 'Please select a lead source when providing customer details.' });
            return;
        }
        if (!remark) {
            Swal.fire({ icon: 'warning', title: 'Remark Required', text: 'Please add a remark when providing customer details.' });
            return;
        }
    }

    // Build extra_items array (filter out empty rows)
    const extraItemsForRequest = extraItems
        .filter(item => item.description && item.description.trim())
        .map(item => ({
            description: item.description.trim(),
            qty: item.qty || 1,
            unit_price: item.unit_price || 0,
            total_price: (item.qty || 1) * (item.unit_price || 0),
            item_kind: 'ev_charger_extra'
        }));

    const requestData = {
        linked_package: selectedPackage.bubble_id,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_address: customerAddress,
        lead_source: leadSource,
        remark: remark,
        discount_given: null,
        apply_sst: false,
        extra_items: extraItemsForRequest,
        template_id: null
    };

    // UI: disable button
    const btn = document.getElementById('submitBtn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
        const response = await fetch('/api/v1/invoices/on-the-fly', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });

        const result = await response.json();

        if (response.ok && result.success) {
            const shareToken = result.data?.shareToken;
            if (shareToken) {
                window.location.href = `/view/${shareToken}`;
            } else {
                Swal.fire({ icon: 'success', title: 'Created!', text: 'Quotation created successfully.' });
            }
        } else {
            Swal.fire({ icon: 'error', title: 'Error', text: result.error || 'Failed to create quotation.' });
        }
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Network Error', text: err.message });
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

// ── User Profile ──────────────────────────────────────
async function fetchUserProfile() {
    try {
        const res = await fetch('/api/v1/user/profile');
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && data.data) {
            const name = data.data.name || data.data.displayName || '';
            if (name) {
                document.getElementById('userNameDisplay').textContent = name;
                document.getElementById('userWelcome').classList.remove('hidden');
            }
        }
    } catch (_) {
        // silent
    }
}
