function parseQuery() {
    const params = new URLSearchParams(window.location.search);
    return {
        invoiceId: params.get('id') || '',
        nextUrl: params.get('next') || '',
        sourceInvoiceId: params.get('source_invoice_id') || ''
    };
}

function normalizeNumber(value, fallback = 0) {
    const parsed = parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
    return fallback;
}

function readSelectedVoucherIds(payload) {
    if (!payload || typeof payload !== 'object') return [];

    if (Array.isArray(payload.selected_voucher_ids)) {
        return payload.selected_voucher_ids.map(String);
    }

    if (Array.isArray(payload.selectedVouchers)) {
        return payload.selectedVouchers
            .map((voucher) => String(voucher?.bubble_id || voucher?.id || ''))
            .filter(Boolean);
    }

    if (Array.isArray(payload.selected_vouchers)) {
        return payload.selected_vouchers
            .map((voucher) => String(voucher?.bubble_id || voucher?.id || ''))
            .filter(Boolean);
    }

    return [];
}

function extractVoucherId(voucher) {
    if (!voucher) return '';
    return String(voucher.bubble_id || voucher.id || '');
}

function extractCategories(payload) {
    const candidates = [
        payload?.categories,
        payload?.voucher_categories,
        payload?.voucherGroups,
        payload?.groups
    ];
    const categories = candidates.find((list) => Array.isArray(list)) || [];

    return categories.map((category) => {
        const vouchers = Array.isArray(category?.vouchers) ? category.vouchers : [];
        return {
            id: String(category?.bubble_id || category?.id || ''),
            name: category?.name || 'Voucher Group',
            description: category?.description || '',
            maxSelectable: Math.max(1, normalizeNumber(category?.max_selectable, 1)),
            active: category?.active !== false,
            disabled: category?.disabled === true,
            eligible: category?.eligible !== false,
            vouchers: vouchers.map((voucher) => ({
                id: extractVoucherId(voucher),
                title: voucher?.title || voucher?.voucher_code || 'Voucher',
                code: voucher?.voucher_code || '',
                active: voucher?.active !== false,
                disabled: voucher?.disabled === true
            })).filter((voucher) => voucher.id)
        };
    }).filter((category) => category.id);
}

function pickPayload(responseJson) {
    if (responseJson?.data && typeof responseJson.data === 'object') return responseJson.data;
    return responseJson || {};
}

async function fetchVoucherStepData(invoiceId) {
    const response = await fetch(`/api/v1/invoices/${encodeURIComponent(invoiceId)}/voucher-step`, {
        credentials: 'same-origin'
    });
    const json = await response.json();
    if (!response.ok) {
        throw new Error(json?.error || 'Failed to load voucher-step data');
    }
    return pickPayload(json);
}

function renderSummary(selectedIds) {
    const summaryEl = document.getElementById('selectionSummary');
    if (!summaryEl) return;
    if (!selectedIds.size) {
        summaryEl.textContent = 'No vouchers selected.';
        return;
    }
    summaryEl.textContent = `${selectedIds.size} voucher${selectedIds.size === 1 ? '' : 's'} selected.`;
}

function resolveNextUrl(nextUrl, invoiceId) {
    if (nextUrl) return nextUrl;
    if (invoiceId) return `/invoice-office?id=${encodeURIComponent(invoiceId)}`;
    return '/my-invoice';
}

async function init() {
    const { invoiceId, nextUrl, sourceInvoiceId } = parseQuery();
    const loadingState = document.getElementById('loadingState');
    const emptyState = document.getElementById('emptyState');
    const errorState = document.getElementById('errorState');
    const errorText = document.getElementById('errorText');
    const categoryList = document.getElementById('categoryList');
    const applyBtn = document.getElementById('applyBtn');
    const skipBtn = document.getElementById('skipBtn');
    const invoiceMeta = document.getElementById('invoiceMeta');

    if (!invoiceId) {
        if (loadingState) loadingState.classList.add('hidden');
        if (errorState) errorState.classList.remove('hidden');
        if (errorText) errorText.textContent = 'Missing invoice id.';
        return;
    }

    if (invoiceMeta) {
        invoiceMeta.textContent = `Quotation ID: ${invoiceId}`;
    }

    const goNext = () => {
        window.location.href = resolveNextUrl(nextUrl, invoiceId);
    };

    if (skipBtn) {
        skipBtn.addEventListener('click', goNext);
    }

    let payload;
    try {
        payload = await fetchVoucherStepData(invoiceId);
    } catch (err) {
        if (loadingState) loadingState.classList.add('hidden');
        if (errorState) errorState.classList.remove('hidden');
        if (errorText) errorText.textContent = err.message || 'Unable to load voucher groups.';
        return;
    }

    if (invoiceMeta) {
        const invoiceNumber = payload?.invoice?.invoice_number || invoiceId;
        const customerName = payload?.invoice?.customer_name || 'Quotation';
        invoiceMeta.textContent = `${invoiceNumber} • ${customerName}`;
    }

    const categories = extractCategories(payload)
        .filter((category) => category.active && !category.disabled && category.eligible)
        .map((category) => ({
            ...category,
            vouchers: category.vouchers.filter((voucher) => voucher.active && !voucher.disabled)
        }))
        .filter((category) => category.vouchers.length > 0);

    let selectedIds = new Set(readSelectedVoucherIds(payload));

    // Edit-flow fallback: if current version does not have selections yet, attempt source invoice.
    if (!selectedIds.size && sourceInvoiceId && sourceInvoiceId !== invoiceId) {
        try {
            const sourcePayload = await fetchVoucherStepData(sourceInvoiceId);
            selectedIds = new Set(readSelectedVoucherIds(sourcePayload));
        } catch (err) {
            console.warn('Unable to preload source invoice voucher selection:', err);
        }
    }

    if (loadingState) loadingState.classList.add('hidden');

    if (!categories.length) {
        if (emptyState) emptyState.classList.remove('hidden');
        renderSummary(selectedIds);
        if (applyBtn) {
            applyBtn.addEventListener('click', goNext);
        }
        return;
    }

    if (categoryList) {
        categoryList.classList.remove('hidden');
    }

    const checkboxesByCategory = new Map();

    categories.forEach((category) => {
        const card = document.createElement('section');
        card.className = 'rounded-xl border border-slate-200 bg-white';

        const header = document.createElement('div');
        header.className = 'border-b border-slate-200 px-4 py-3';
        header.innerHTML = `
            <div class="flex items-center justify-between gap-2">
                <h2 class="text-base font-semibold text-slate-900">${category.name}</h2>
                <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Max ${category.maxSelectable}</span>
            </div>
            ${category.description ? `<p class="mt-1 text-xs text-slate-500">${category.description}</p>` : ''}
        `;
        card.appendChild(header);

        const body = document.createElement('div');
        body.className = 'space-y-2 px-4 py-3';

        const checkboxes = [];
        category.vouchers.forEach((voucher) => {
            const wrapper = document.createElement('label');
            wrapper.className = 'flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 hover:border-slate-300';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = voucher.id;
            checkbox.className = 'h-4 w-4 rounded border-slate-300';
            checkbox.checked = selectedIds.has(voucher.id);

            const meta = document.createElement('div');
            meta.className = 'min-w-0';
            meta.innerHTML = `
                <p class="text-sm font-medium text-slate-900">${voucher.title}</p>
                ${voucher.code ? `<p class="text-xs uppercase tracking-wide text-slate-500">${voucher.code}</p>` : ''}
            `;

            wrapper.appendChild(checkbox);
            wrapper.appendChild(meta);
            body.appendChild(wrapper);
            checkboxes.push(checkbox);
        });

        checkboxesByCategory.set(category.id, {
            maxSelectable: category.maxSelectable,
            checkboxes
        });
        card.appendChild(body);
        categoryList.appendChild(card);
    });

    const enforceCategoryLimit = (categoryState, changedCheckbox) => {
        const checked = categoryState.checkboxes.filter((checkbox) => checkbox.checked);
        if (checked.length <= categoryState.maxSelectable) return;
        changedCheckbox.checked = false;
        alert(`You can only select up to ${categoryState.maxSelectable} voucher(s) in this group.`);
    };

    checkboxesByCategory.forEach((categoryState) => {
        categoryState.checkboxes.forEach((checkbox) => {
            checkbox.addEventListener('change', () => {
                enforceCategoryLimit(categoryState, checkbox);
                selectedIds = new Set(
                    Array.from(checkboxesByCategory.values())
                        .flatMap((state) => state.checkboxes)
                        .filter((cb) => cb.checked)
                        .map((cb) => cb.value)
                );
                renderSummary(selectedIds);
            });
        });
    });

    renderSummary(selectedIds);

    if (applyBtn) {
        applyBtn.addEventListener('click', async () => {
            applyBtn.disabled = true;
            applyBtn.textContent = 'Applying...';
            try {
                const response = await fetch(`/api/v1/invoices/${encodeURIComponent(invoiceId)}/vouchers`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        voucher_ids: Array.from(selectedIds)
                    })
                });
                const json = await response.json();
                if (!response.ok) {
                    throw new Error(json?.error || 'Failed to apply voucher selections.');
                }
                goNext();
            } catch (err) {
                alert(err.message || 'Failed to apply vouchers.');
                applyBtn.disabled = false;
                applyBtn.textContent = 'Apply and Continue';
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', init);
