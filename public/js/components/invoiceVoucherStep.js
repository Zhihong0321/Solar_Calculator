(() => {
    function normalizeNumber(value, fallback = 0) {
        const parsed = parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function readSelectedVoucherIds(payload) {
        if (!payload || typeof payload !== 'object') return [];

        if (Array.isArray(payload.selectedVoucherIds)) {
            return payload.selectedVoucherIds.map(String);
        }

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
                    discountAmount: voucher?.discount_amount,
                    discountPercent: voucher?.discount_percent,
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

    function applyVoucherSelectionState(item) {
        if (!item?.wrapper || !item?.checkbox || !item?.titleEl) return;

        if (item.checkbox.checked) {
            item.wrapper.className = 'flex items-center gap-3 rounded-xl border px-3 py-3 transition-all duration-200';
            item.wrapper.style.background = 'linear-gradient(135deg, #172554 0%, #1d4ed8 58%, #38bdf8 100%)';
            item.wrapper.style.borderColor = '#3b82f6';
            item.wrapper.style.boxShadow = '0 18px 34px rgba(30, 64, 175, 0.22)';
            item.titleEl.className = 'text-sm font-semibold text-white';
            if (item.codeEl) {
                item.codeEl.className = 'text-xs uppercase tracking-wide';
                item.codeEl.style.color = '#dbeafe';
            }
            return;
        }

        item.wrapper.className = 'flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 transition-all duration-200 hover:border-slate-300 hover:bg-slate-50';
        item.wrapper.style.background = '';
        item.wrapper.style.borderColor = '';
        item.wrapper.style.boxShadow = '';
        item.titleEl.className = 'text-sm font-medium text-slate-900';
        if (item.codeEl) {
            item.codeEl.className = 'text-xs uppercase tracking-wide text-slate-500';
            item.codeEl.style.color = '';
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

    function createMarkup({ title, subtitle, applyLabel, skipLabel, showHeader, embedded, showFooter }) {
        const wrapperClass = embedded
            ? ''
            : 'rounded-2xl border border-slate-200 bg-white shadow-sm';
        const innerSpacingClass = embedded ? '' : 'px-5 py-5';
        const loadingClass = embedded ? 'py-2 text-sm text-slate-500' : 'px-5 py-10 text-sm text-slate-500';
        const errorClass = embedded ? 'hidden py-2' : 'hidden px-5 py-10';
        const emptyClass = embedded ? 'hidden py-2 text-sm text-slate-500' : 'hidden px-5 py-10 text-sm text-slate-500';
        const categoryListClass = embedded ? 'hidden space-y-3' : 'hidden space-y-4 px-5 py-5';
        const footerClass = embedded
            ? `flex flex-col gap-3 ${showFooter === false ? 'pt-3' : 'border-t border-slate-200 pt-4'} sm:flex-row sm:items-center sm:justify-between`
            : 'flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between';
        return `
            <div class="${wrapperClass}">
                ${showHeader ? `
                    <div class="border-b border-slate-200 ${innerSpacingClass}">
                        <p class="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">Integrated Step</p>
                        <h3 class="mt-1 text-xl font-bold text-slate-900">${title}</h3>
                        <p class="mt-1 text-sm text-slate-600">${subtitle}</p>
                    </div>
                ` : ''}
                <div data-voucher-loading class="${loadingClass}">Loading voucher groups...</div>
                <div data-voucher-error class="${errorClass}">
                    <p data-voucher-error-text class="text-sm font-medium text-red-600"></p>
                </div>
                <div data-voucher-empty class="${emptyClass}">
                    No active voucher groups are available for this quotation.
                </div>
                <div data-voucher-category-list class="${categoryListClass}"></div>
                <div class="${footerClass}">
                    <p data-voucher-summary class="text-sm text-slate-600">No vouchers selected.</p>
                    <div class="flex items-center gap-2 ${showFooter === false ? 'hidden' : ''}">
                        <button data-voucher-skip type="button" class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                            ${skipLabel}
                        </button>
                        <button data-voucher-apply type="button" class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                            ${applyLabel}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    function createVoucherStep(root, options = {}) {
        if (!root) {
            throw new Error('Voucher step root element is required.');
        }

        const state = {
            invoiceId: options.invoiceId || '',
            nextUrl: options.nextUrl || '',
            sourceInvoiceId: options.sourceInvoiceId || '',
            selectedIds: new Set(),
            checkboxesByCategory: new Map(),
            voucherCatalog: new Map(),
            applied: false
        };

        root.innerHTML = createMarkup({
            title: options.title || 'Voucher Selection',
            subtitle: options.subtitle || 'Keep voucher selection on this page so pricing stays easy to review.',
            applyLabel: options.applyLabel || 'Apply and Continue',
            skipLabel: options.skipLabel || 'Skip',
            showHeader: options.showHeader !== false,
            embedded: options.embedded === true,
            showFooter: options.showFooter !== false
        });

        const loadingState = root.querySelector('[data-voucher-loading]');
        const errorState = root.querySelector('[data-voucher-error]');
        const errorText = root.querySelector('[data-voucher-error-text]');
        const emptyState = root.querySelector('[data-voucher-empty]');
        const categoryList = root.querySelector('[data-voucher-category-list]');
        const summaryEl = root.querySelector('[data-voucher-summary]');
        const applyBtn = root.querySelector('[data-voucher-apply]');
        const skipBtn = root.querySelector('[data-voucher-skip]');

        function renderSummary() {
            if (!summaryEl) return;
            const count = state.selectedIds.size;
            summaryEl.textContent = count
                ? `${count} voucher${count === 1 ? '' : 's'} selected.`
                : 'No vouchers selected.';
        }

        function setLoading(visible) {
            loadingState?.classList.toggle('hidden', !visible);
        }

        function setError(message) {
            if (!errorState || !errorText) return;
            errorText.textContent = message || 'Unable to load voucher groups.';
            errorState.classList.remove('hidden');
        }

        function clearStates() {
            errorState?.classList.add('hidden');
            emptyState?.classList.add('hidden');
            categoryList?.classList.add('hidden');
            if (categoryList) categoryList.innerHTML = '';
            state.checkboxesByCategory = new Map();
            state.voucherCatalog = new Map();
        }

        function notifyChange(change = {}) {
            const selectedVouchers = Array.from(state.selectedIds)
                .map((id) => state.voucherCatalog.get(String(id)))
                .filter(Boolean);
            const payload = {
                invoiceId: state.invoiceId,
                selectedIds: Array.from(state.selectedIds),
                selectedVouchers,
                applied: Boolean(change.applied),
                skipped: Boolean(change.skipped)
            };

            if (typeof options.onChange === 'function') {
                options.onChange(payload);
            }
        }

        function renderCategories(categories) {
            if (!categoryList) return;

            categoryList.innerHTML = '';
            categoryList.classList.remove('hidden');
            state.checkboxesByCategory = new Map();
            state.voucherCatalog = new Map();
            const embedded = options.embedded === true;

            categories.forEach((category) => {
                const card = document.createElement('section');
                card.className = embedded
                    ? 'border-t border-slate-200 pt-3 first:border-t-0 first:pt-0'
                    : 'rounded-xl border border-slate-200 bg-white';

                const header = document.createElement('div');
                header.className = embedded ? 'pb-2' : 'border-b border-slate-200 px-4 py-3';
                header.innerHTML = `
                    <div class="flex items-center justify-between gap-2">
                        <h4 class="text-base font-semibold text-slate-900">${category.name}</h4>
                        <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Max ${category.maxSelectable}</span>
                    </div>
                    ${category.description ? `<p class="mt-1 text-xs text-slate-500">${category.description}</p>` : ''}
                `;
                card.appendChild(header);

                const body = document.createElement('div');
                body.className = embedded ? 'space-y-2' : 'space-y-2 px-4 py-3';

                const items = [];
                category.vouchers.forEach((voucher) => {
                    state.voucherCatalog.set(String(voucher.id), voucher);
                    const wrapper = document.createElement('label');
                    wrapper.className = 'flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 transition-all duration-200 hover:border-slate-300 hover:bg-slate-50';

                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.value = voucher.id;
                    checkbox.className = 'h-4 w-4 rounded border-slate-300';
                    checkbox.checked = state.selectedIds.has(voucher.id);

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

                    const item = { checkbox, wrapper, titleEl, codeEl, voucher };
                    applyVoucherSelectionState(item);
                    items.push(item);
                });

                state.checkboxesByCategory.set(category.id, {
                    maxSelectable: category.maxSelectable,
                    items
                });

                card.appendChild(body);
                categoryList.appendChild(card);
            });

            state.selectedIds = recomputeSelectedIds(state.checkboxesByCategory);

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

            state.checkboxesByCategory.forEach((categoryState) => {
                categoryState.items.forEach((item) => {
                    item.checkbox.addEventListener('change', () => {
                        enforceCategoryLimit(categoryState, item);
                        applyVoucherSelectionState(item);
                        state.selectedIds = recomputeSelectedIds(state.checkboxesByCategory);
                        renderSummary();
                        notifyChange();
                    });
                });
            });
        }

        async function applySelections() {
            if (!state.invoiceId) {
                throw new Error('Invoice id is missing.');
            }

            const response = await fetch(`/api/v1/invoices/${encodeURIComponent(state.invoiceId)}/vouchers`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'same-origin',
                body: JSON.stringify({
                    voucher_ids: Array.from(state.selectedIds)
                })
            });

            const json = await response.json();
            if (!response.ok) {
                throw new Error(json?.error || 'Failed to apply voucher selections.');
            }

            state.applied = true;
            notifyChange({ applied: true });
            if (typeof options.onApplied === 'function') {
                options.onApplied({
                    invoiceId: state.invoiceId,
                    selectedIds: Array.from(state.selectedIds),
                    response: json
                });
            }
            return json;
        }

        function normalizePayload(payload, sourceInvoiceId = '') {
            let selectedIds = new Set(readSelectedVoucherIds(payload));
            return {
                payload,
                selectedIds,
                sourceInvoiceId
            };
        }

        function consumePayload(normalized) {
            const payload = normalized.payload;
            state.selectedIds = normalized.selectedIds;
            const categories = extractCategories(payload)
                .filter((category) => category.active && !category.disabled && category.eligible)
                .map((category) => ({
                    ...category,
                    vouchers: category.vouchers.filter((voucher) => voucher.active && !voucher.disabled)
                }))
                .filter((category) => category.vouchers.length > 0);

            setLoading(false);

            if (!categories.length) {
                emptyState?.classList.remove('hidden');
                renderSummary();
                notifyChange();
                if (typeof options.onReady === 'function') {
                    options.onReady({
                        invoiceId: state.invoiceId,
                        selectedIds: Array.from(state.selectedIds),
                        categoryCount: 0
                    });
                }
                return;
            }

            renderCategories(categories);
            renderSummary();
            notifyChange();

            if (typeof options.onReady === 'function') {
                options.onReady({
                    invoiceId: state.invoiceId,
                    selectedIds: Array.from(state.selectedIds),
                    categoryCount: categories.length
                });
            }
        }

        async function load(context = {}) {
            state.invoiceId = context.invoiceId || state.invoiceId;
            state.nextUrl = context.nextUrl ?? state.nextUrl;
            state.sourceInvoiceId = context.sourceInvoiceId ?? state.sourceInvoiceId;
            state.applied = false;
            state.selectedIds = new Set();

            if (!state.invoiceId) {
                clearStates();
                setLoading(false);
                setError('Missing invoice id.');
                return;
            }

            clearStates();
            setLoading(true);

            let payload;
            try {
                payload = await fetchVoucherStepData(state.invoiceId);
            } catch (err) {
                setLoading(false);
                setError(err.message || 'Unable to load voucher groups.');
                return;
            }

            let selectedIds = new Set(readSelectedVoucherIds(payload));
            if (!selectedIds.size && state.sourceInvoiceId && state.sourceInvoiceId !== state.invoiceId) {
                try {
                    const sourcePayload = await fetchVoucherStepData(state.sourceInvoiceId);
                    selectedIds = new Set(readSelectedVoucherIds(sourcePayload));
                } catch (err) {
                    console.warn('Unable to preload source invoice voucher selection:', err);
                }
            }

            consumePayload(normalizePayload(payload, state.sourceInvoiceId));
        }

        async function loadPayload(payload, context = {}) {
            state.invoiceId = context.invoiceId || '';
            state.nextUrl = context.nextUrl ?? state.nextUrl;
            state.sourceInvoiceId = context.sourceInvoiceId ?? '';
            state.applied = false;
            state.selectedIds = new Set((context.selectedIds || []).map(String));

            clearStates();
            setLoading(false);

            const normalized = normalizePayload(payload, state.sourceInvoiceId);
            if (state.selectedIds.size) {
                normalized.selectedIds = new Set(state.selectedIds);
            }
            consumePayload(normalized);
        }

        if (skipBtn) {
            skipBtn.addEventListener('click', () => {
                notifyChange({ skipped: true });
                if (typeof options.onSkipped === 'function') {
                    options.onSkipped({
                        invoiceId: state.invoiceId,
                        selectedIds: Array.from(state.selectedIds)
                    });
                }
            });
        }

        if (applyBtn) {
            applyBtn.addEventListener('click', async () => {
                applyBtn.disabled = true;
                applyBtn.textContent = 'Applying...';
                try {
                    await applySelections();
                } catch (err) {
                    alert(err.message || 'Failed to apply vouchers.');
                    applyBtn.disabled = false;
                    applyBtn.textContent = options.applyLabel || 'Apply and Continue';
                }
            });
        }

        return {
            load,
            loadPayload,
            getSelectedIds: () => Array.from(state.selectedIds),
            getInvoiceId: () => state.invoiceId,
            applySelections
        };
    }

    window.InvoiceVoucherStep = {
        create: createVoucherStep,
        fetchVoucherStepData,
        readSelectedVoucherIds,
        extractCategories
    };
})();
