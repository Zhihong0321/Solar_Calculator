// EV Charger Invoice — Simplified creation flow
// Only 5 fixed package options, no solar-specific logic

const EV_CHARGER_PACKAGES = [
    {
        id: 1029,
        bubble_id: '1779719505392x510517187223558528',
        name: 'EV CHARGER SINGLE PHASE 7.4KW',
        shortLabel: '7.4kW Single Phase',
        category: 'charger',
        price: 4888,
        desc: 'Type 2 · 32A · 5m cable · 3-year warranty'
    },
    {
        id: 1030,
        bubble_id: '1779719505392x532985182726628480',
        name: 'EV CHARGER THREE PHASE 22KW',
        shortLabel: '22kW Three Phase',
        category: 'charger',
        price: 8888,
        desc: 'Type 2 · 32A · 5m cable · 3-year warranty'
    },
    {
        id: 1031,
        bubble_id: '1779719505392x185856407051952896',
        name: 'EV CHARGER INSTALLATION SINGLE PHASE 7KW',
        shortLabel: 'Install 7kW Single Phase',
        category: 'installation',
        price: 1688,
        desc: 'Installation only · 15m cabling · 1-year warranty'
    },
    {
        id: 1032,
        bubble_id: '1779719505392x930851860072331776',
        name: 'EV CHARGER INSTALLATION THREE PHASE 11KW',
        shortLabel: 'Install 11kW Three Phase',
        category: 'installation',
        price: 1988,
        desc: 'Installation only · 15m cabling · 1-year warranty'
    },
    {
        id: 1033,
        bubble_id: '1779719505392x911258790790266368',
        name: 'EV CHARGER INSTALLATION THREE PHASE 22KW',
        shortLabel: 'Install 22kW Three Phase',
        category: 'installation',
        price: 1988,
        desc: 'Installation only · 15m cabling · 1-year warranty'
    }
];

let selectedPackage = null;
let extraItems = [];

// ── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    renderPackageCards();
    renderPresetExtras();
    renderExtraItems();
    bindEvents();
    fetchUserProfile();
});

// ── Package Cards ─────────────────────────────────────
function renderPackageCards() {
    const grid = document.getElementById('packageGrid');
    if (!grid) return;

    grid.innerHTML = EV_CHARGER_PACKAGES.map(pkg => {
        const isCharger = pkg.category === 'charger';
        const badge = isCharger
            ? '<span class="inline-block text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Charger</span>'
            : '<span class="inline-block text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Installation</span>';
        const priceText = `RM ${pkg.price.toLocaleString()}`;
        const descLine = pkg.desc ? `<div class="text-[11px] text-slate-400 mt-1 leading-snug">${pkg.desc}</div>` : '';

        return `
        <div class="pkg-card relative rounded-xl border-2 border-slate-200 bg-white p-4"
             data-bubble-id="${pkg.bubble_id}" onclick="selectPackage('${pkg.bubble_id}')">
            <div class="pkg-check absolute top-2 right-2 h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-white text-xs font-bold">&#10003;</div>
            <div class="mb-2">${badge}</div>
            <div class="text-sm font-bold text-slate-900 leading-snug">${pkg.shortLabel}</div>
            ${descLine}
            <div class="mt-3 text-base font-extrabold text-slate-900">${priceText}</div>
        </div>`;
    }).join('');
}

function selectPackage(bubbleId) {
    // Deselect all
    document.querySelectorAll('.pkg-card').forEach(c => c.classList.remove('selected'));

    // Select clicked
    const card = document.querySelector(`.pkg-card[data-bubble-id="${bubbleId}"]`);
    if (card) card.classList.add('selected');

    selectedPackage = EV_CHARGER_PACKAGES.find(p => p.bubble_id === bubbleId) || null;
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
