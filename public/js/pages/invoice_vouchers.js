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

function applyVoucherSelectionState(item) {
    if (!item?.wrapper || !item?.checkbox || !item?.titleEl || !item?.codeEl) return;

    if (item.checkbox.checked) {
        item.wrapper.className = 'flex items-center gap-3 rounded-xl border border-blue-500 bg-gradient-to-br from-blue-950 via-blue-800 to-sky-600 px-3 py-3 shadow-lg shadow-blue-900/20 transition-all duration-200';
        item.titleEl.className = 'text-sm font-semibold text-white';
        if (item.codeEl) {
            item.codeEl.className = 'text-xs uppercase tracking-wide text-blue-100';
        }
        return;
    }

    item.wrapper.className = 'flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 transition-all duration-200 hover:border-slate-300 hover:bg-slate-50';
    item.titleEl.className = 'text-sm font-medium text-slate-900';
    if (item.codeEl) {
        item.codeEl.className = 'text-xs uppercase tracking-wide text-slate-500';
    }
}

function recomputeSelectedIds(checkboxesByCategory) {
    return new Set(
        Array.from(checkboxesByCategory.values())
            .flatMap((state) => state.items)
            .filter((item) => item.checkbox.checked)
            .map((item) => item.checkbox.value)
    );
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

        const items = [];
        category.vouchers.forEach((voucher) => {
            const wrapper = document.createElement('label');
            wrapper.className = 'flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 transition-all duration-200 hover:border-slate-300 hover:bg-slate-50';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = voucher.id;
            checkbox.className = 'h-4 w-4 rounded border-slate-300';
            checkbox.checked = selectedIds.has(voucher.id);

            const meta = document.createElement('div');
            meta.className = 'min-w-0';
            const titleEl = document.createElement('p');
            titleEl.textContent = voucher.title;
            titleEl.className = 'text-sm font-medium text-slate-900';
            meta.appendChild(titleEl);

            let codeEl = null;
            if (voucher.code) {
                codeEl = document.createElement('p');
                codeEl.textContent = voucher.code;
                codeEl.className = 'text-xs uppercase tracking-wide text-slate-500';
                meta.appendChild(codeEl);
            }

            wrapper.appendChild(checkbox);
            wrapper.appendChild(meta);
            body.appendChild(wrapper);
            const item = {
                checkbox,
                wrapper,
                titleEl,
                codeEl
            };
            applyVoucherSelectionState(item);
            items.push(item);
        });

        checkboxesByCategory.set(category.id, {
            maxSelectable: category.maxSelectable,
            items
        });
        card.appendChild(body);
        categoryList.appendChild(card);
    });

    const enforceCategoryLimit = (categoryState, changedItem) => {
        const checkedItems = categoryState.items.filter((item) => item.checkbox.checked);
        if (checkedItems.length <= categoryState.maxSelectable) return;

        const overflowCount = checkedItems.length - categoryState.maxSelectable;
        checkedItems
            .filter((item) => item !== changedItem)
            .slice(0, overflowCount)
            .forEach((item) => {
                item.checkbox.checked = false;
                applyVoucherSelectionState(item);
            });
    };

    checkboxesByCategory.forEach((categoryState) => {
        categoryState.items.forEach((item) => {
            item.checkbox.addEventListener('change', () => {
                enforceCategoryLimit(categoryState, item);
                applyVoucherSelectionState(item);
                selectedIds = recomputeSelectedIds(checkboxesByCategory);
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
