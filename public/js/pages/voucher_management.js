let currentVouchers = [];
let currentCategories = [];
let currentTab = 'active';

const voucherList = document.getElementById('voucherList');
const categoryList = document.getElementById('categoryList');
const voucherModal = document.getElementById('voucherModal');
const voucherForm = document.getElementById('voucherForm');
const voucherIdInput = document.getElementById('voucherId');
const modalTitle = document.getElementById('modalTitle');
const discountTypeSelect = document.getElementById('voucher_type');
const valuePrefix = document.getElementById('valuePrefix');
const categoryModal = document.getElementById('categoryModal');
const categoryForm = document.getElementById('categoryForm');
const categoryIdInput = document.getElementById('categoryId');
const categoryModalTitle = document.getElementById('categoryModalTitle');
const tabActive = document.getElementById('tabActive');
const tabInactive = document.getElementById('tabInactive');
const tabDeleted = document.getElementById('tabDeleted');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');
const toastIcon = document.getElementById('toastIcon');

document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    loadInitialData();
});

function bindEvents() {
    discountTypeSelect?.addEventListener('change', () => {
        const type = discountTypeSelect.value;
        const isGift = type === 'Gift';

        valuePrefix.textContent = type === 'Percentage Discount' ? '%' : 'RM';
        document.getElementById('giftTypeDesc')?.classList.toggle('hidden', !isGift);
        document.getElementById('commissionDeductionField')?.classList.toggle('hidden', !isGift);
    });

    voucherForm?.addEventListener('submit', handleVoucherSubmit);
    categoryForm?.addEventListener('submit', handleCategorySubmit);
}

async function loadInitialData() {
    await Promise.all([fetchCategories(), fetchVouchers()]);
}

function normalizeBool(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
    if (typeof value === 'number') return value === 1;
    return fallback;
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        },
        ...options
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(json?.error || json?.message || `Request failed (${response.status})`);
    }
    return json;
}

async function fetchCategories() {
    try {
        const json = await fetchJson('/api/voucher-categories?status=all');
        currentCategories = Array.isArray(json.categories) ? json.categories : [];
        renderCategories();
        populateCategoryOptions();
    } catch (error) {
        console.error('Error fetching voucher categories:', error);
        categoryList.innerHTML = `
            <div class="col-span-full rounded-2xl border border-dashed border-red-200 bg-red-50 px-6 py-10 text-center text-sm text-red-600">
                Failed to load voucher categories.
            </div>
        `;
    }
}

async function fetchVouchers() {
    try {
        const json = await fetchJson(`/api/vouchers_v2?status=${encodeURIComponent(currentTab)}`);
        const rows = Array.isArray(json) ? json : Array.isArray(json.vouchers) ? json.vouchers : [];

        currentVouchers = rows.filter((voucher) => {
            const isDeleted = !!voucher.delete;
            const isActive = !!voucher.active;
            if (currentTab === 'deleted') return isDeleted;
            if (currentTab === 'inactive') return !isActive && !isDeleted;
            return isActive && !isDeleted;
        });

        renderVouchers();
        updateStats();
    } catch (error) {
        console.error('Error fetching vouchers:', error);
        showToast('Failed to load vouchers', 'error');
    }
}

function switchTab(tab) {
    currentTab = tab;
    [tabActive, tabInactive, tabDeleted].forEach((el) => {
        el.className = 'px-4 py-2 text-sm font-bold text-slate-400 hover:text-slate-600 border-b-2 border-transparent hover:border-slate-200 transition-colors';
    });

    const activeClass = 'px-4 py-2 text-sm font-bold text-blue-600 border-b-2 border-blue-600 transition-colors';
    if (tab === 'active') tabActive.className = activeClass;
    if (tab === 'inactive') tabInactive.className = activeClass;
    if (tab === 'deleted') tabDeleted.className = activeClass;

    fetchVouchers();
}

function getCategoryName(categoryId) {
    const category = currentCategories.find((item) => item.bubble_id === categoryId || String(item.id) === String(categoryId));
    return category?.name || 'Uncategorized';
}

function populateCategoryOptions(selectedValue = '') {
    const select = document.getElementById('linked_voucher_category');
    if (!select) return;

    const options = ['<option value="">Uncategorized (Hidden in voucher step)</option>'];
    currentCategories
        .filter((category) => !category.delete)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.name || '').localeCompare(String(b.name || '')))
        .forEach((category) => {
            const badges = [];
            if (!category.active) badges.push('Inactive');
            if (category.disabled) badges.push('Disabled');
            const label = badges.length ? `${category.name} (${badges.join(', ')})` : category.name;
            options.push(`<option value="${category.bubble_id}">${label}</option>`);
        });

    select.innerHTML = options.join('');
    select.value = selectedValue || '';
}

function renderCategories() {
    if (!currentCategories.length) {
        categoryList.innerHTML = `
            <div class="col-span-full rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-400">
                No voucher categories yet.
            </div>
        `;
        return;
    }

    const sorted = [...currentCategories].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.name || '').localeCompare(String(b.name || '')));
    categoryList.innerHTML = sorted.map((category) => {
        const deleted = !!category.delete;
        const active = !!category.active;
        const disabled = !!category.disabled;
        const cardClass = deleted
            ? 'bg-slate-50 border-slate-200 opacity-70'
            : active && !disabled
                ? 'bg-white border-slate-200'
                : 'bg-amber-50 border-amber-200';

        const requirementBits = [];
        if (category.min_package_amount !== null && category.min_package_amount !== undefined) {
            requirementBits.push(`Min amount RM ${Number(category.min_package_amount).toLocaleString()}`);
        }
        if (category.max_package_amount !== null && category.max_package_amount !== undefined) {
            requirementBits.push(`Max amount RM ${Number(category.max_package_amount).toLocaleString()}`);
        }
        if (category.min_panel_quantity !== null && category.min_panel_quantity !== undefined) {
            requirementBits.push(`Min panels ${category.min_panel_quantity}`);
        }
        requirementBits.push(`Type ${category.package_type_scope || 'all'}`);

        const actions = deleted
            ? `<button onclick="restoreCategory('${category.bubble_id}')" class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100">Restore</button>`
            : `
                <button onclick="editCategory('${category.bubble_id}')" class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100">Edit</button>
                <button onclick="toggleCategoryDisabled('${category.bubble_id}', ${disabled ? 'false' : 'true'})" class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-100">${disabled ? 'Enable Step' : 'Disable Step'}</button>
                <button onclick="toggleCategoryActive('${category.bubble_id}')" class="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100">${active ? 'Set Inactive' : 'Set Active'}</button>
                <button onclick="deleteCategory('${category.bubble_id}')" class="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100">Delete</button>
            `;

        return `
            <article class="rounded-3xl border p-6 shadow-sm ${cardClass}">
                <div class="mb-4 flex items-start justify-between gap-4">
                    <div>
                        <h3 class="text-lg font-extrabold text-slate-900">${category.name || 'Unnamed Category'}</h3>
                        <p class="mt-1 text-xs font-bold uppercase tracking-widest text-slate-500">Max selectable: ${category.max_selectable || 1}</p>
                    </div>
                    <div class="flex flex-wrap justify-end gap-2 text-[10px] font-black uppercase tracking-wider">
                        ${deleted ? '<span class="rounded-full bg-slate-200 px-2 py-1 text-slate-600">Deleted</span>' : ''}
                        ${active ? '<span class="rounded-full bg-green-100 px-2 py-1 text-green-700">Active</span>' : '<span class="rounded-full bg-slate-200 px-2 py-1 text-slate-600">Inactive</span>'}
                        ${disabled ? '<span class="rounded-full bg-amber-100 px-2 py-1 text-amber-700">Disabled</span>' : ''}
                    </div>
                </div>
                ${category.description ? `<p class="mb-4 text-sm text-slate-600">${category.description}</p>` : ''}
                <div class="space-y-2 text-xs font-medium text-slate-600">
                    <p>Requirements: ${requirementBits.join(' | ')}</p>
                    <p>Assigned vouchers: ${category.voucher_count || 0}</p>
                </div>
                <div class="mt-5 flex flex-wrap gap-2">
                    ${actions}
                </div>
            </article>
        `;
    }).join('');
}

function renderVouchers() {
    if (!currentVouchers.length) {
        voucherList.innerHTML = `
            <div class="col-span-full py-20 flex flex-col items-center justify-center text-slate-400 bg-white rounded-3xl border-2 border-dashed border-slate-100">
                <i class="fa-solid fa-ticket text-5xl mb-4 opacity-20"></i>
                <p class="font-bold text-lg">No vouchers found</p>
                <p class="text-sm text-center">${currentTab === 'deleted' ? 'Recycle bin is empty.' : `No ${currentTab} vouchers.`}</p>
            </div>
        `;
        return;
    }

    currentVouchers.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
    voucherList.innerHTML = currentVouchers.map((voucher) => {
        const deleted = !!voucher.delete;
        const active = !!voucher.active;
        const categoryName = voucher.linked_voucher_category ? getCategoryName(voucher.linked_voucher_category) : 'Uncategorized';
        const cardClass = deleted
            ? 'bg-slate-50 border-slate-200 opacity-70'
            : active
                ? 'bg-green-50 border-green-200'
                : 'bg-white border-slate-200';
        const discountText = voucher.voucher_type === 'Percentage Discount'
            ? `${voucher.discount_percent}% OFF`
            : `RM ${parseFloat(voucher.discount_amount || 0).toLocaleString()} OFF`;
        const actions = deleted
            ? `<button onclick="restoreVoucher('${voucher.bubble_id}')" class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100">Restore</button>`
            : `
                <button onclick="editVoucher('${voucher.bubble_id}')" class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100">Edit</button>
                <button onclick="duplicateVoucher('${voucher.bubble_id}')" class="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100">Duplicate</button>
                <button onclick="toggleActive('${voucher.bubble_id}')" class="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100">${active ? 'Set Inactive' : 'Set Active'}</button>
                <button onclick="deleteVoucher('${voucher.bubble_id}')" class="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100">Delete</button>
            `;

        return `
            <article class="voucher-card ${cardClass} p-6 rounded-3xl shadow-sm border flex flex-col gap-5">
                <div class="flex items-start justify-between gap-4">
                    <div>
                        <h3 class="font-extrabold text-slate-900">${voucher.title || 'Untitled Voucher'}</h3>
                        <p class="mt-1 text-[10px] font-black uppercase tracking-widest text-blue-600">${voucher.voucher_code}</p>
                    </div>
                    <div class="flex flex-wrap justify-end gap-2 text-[10px] font-black uppercase tracking-widest">
                        ${active && !deleted ? '<span class="rounded-full bg-green-200 px-2 py-1 text-green-700">Active</span>' : ''}
                        ${!active && !deleted ? '<span class="rounded-full bg-slate-200 px-2 py-1 text-slate-600">Inactive</span>' : ''}
                        ${deleted ? '<span class="rounded-full bg-slate-200 px-2 py-1 text-slate-600">Deleted</span>' : ''}
                    </div>
                </div>
                <div class="space-y-2 text-sm text-slate-700">
                    <div class="flex items-center justify-between"><span class="font-semibold text-slate-400">Discount</span><span class="font-black text-slate-900">${discountText}</span></div>
                    <div class="flex items-center justify-between"><span class="font-semibold text-slate-400">Category</span><span class="font-semibold text-slate-700">${categoryName}</span></div>
                    <div class="flex items-center justify-between"><span class="font-semibold text-slate-400">Availability</span><span class="font-semibold text-slate-700">${voucher.voucher_availability === null ? '∞' : voucher.voucher_availability}</span></div>
                </div>
                <div class="flex flex-wrap gap-2">
                    ${actions}
                </div>
            </article>
        `;
    }).join('');
}

function updateStats() {
    document.getElementById('statTotal').textContent = currentVouchers.length || '--';
    document.getElementById('statActive').textContent = currentVouchers.filter((voucher) => !!voucher.active && !voucher.delete).length || '--';
    document.getElementById('statPublic').textContent = currentVouchers.filter((voucher) => !!voucher.public && !voucher.delete).length || '--';
}

function openModal(id = null) {
    if (currentTab === 'deleted') {
        showToast('Cannot edit deleted vouchers. Restore them first.', 'error');
        return;
    }

    voucherForm.reset();
    voucherIdInput.value = '';
    modalTitle.textContent = 'Create New Voucher';
    populateCategoryOptions();

    if (id) {
        const voucher = currentVouchers.find((item) => item.bubble_id === id);
        if (voucher) {
            modalTitle.textContent = 'Edit Voucher';
            voucherIdInput.value = voucher.bubble_id;
            document.getElementById('title').value = voucher.title || '';
            document.getElementById('voucher_code').value = voucher.voucher_code || '';
            document.getElementById('voucher_type').value = voucher.voucher_type || 'Fixed Amount Discount';
            document.getElementById('discount_value').value = voucher.voucher_type === 'Percentage Discount' ? voucher.discount_percent : voucher.discount_amount;
            document.getElementById('deductable_from_commission').value = voucher.deductable_from_commission || '';
            document.getElementById('invoice_description').value = voucher.invoice_description || '';
            document.getElementById('voucher_availability').value = voucher.voucher_availability || '';
            document.getElementById('available_until').value = voucher.available_until ? voucher.available_until.split('T')[0] : '';
            document.getElementById('terms_conditions').value = voucher.terms_conditions || '';
            document.getElementById('active').checked = !!voucher.active;
            document.getElementById('public').checked = !!voucher.public;
            populateCategoryOptions(voucher.linked_voucher_category || '');
        }
    }

    discountTypeSelect?.dispatchEvent(new Event('change'));
    voucherModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    voucherModal.classList.add('hidden');
    document.body.style.overflow = 'auto';
}

async function handleVoucherSubmit(event) {
    event.preventDefault();

    const id = voucherIdInput.value;
    const voucherType = document.getElementById('voucher_type').value;
    const value = document.getElementById('discount_value').value;

    const payload = {
        title: document.getElementById('title').value.trim(),
        voucher_code: document.getElementById('voucher_code').value.trim().toUpperCase(),
        voucher_type: voucherType,
        discount_amount: voucherType === 'Percentage Discount' ? null : (value || null),
        discount_percent: voucherType === 'Percentage Discount' ? (value || null) : null,
        deductable_from_commission: document.getElementById('deductable_from_commission').value || 0,
        invoice_description: document.getElementById('invoice_description').value.trim(),
        voucher_availability: document.getElementById('voucher_availability').value || null,
        available_until: document.getElementById('available_until').value || null,
        terms_conditions: document.getElementById('terms_conditions').value.trim(),
        active: document.getElementById('active').checked,
        public: document.getElementById('public').checked,
        linked_voucher_category: document.getElementById('linked_voucher_category').value || null
    };

    try {
        await fetchJson(id ? `/api/vouchers/${id}` : '/api/vouchers', {
            method: id ? 'PUT' : 'POST',
            body: JSON.stringify(payload)
        });
        closeModal();
        showToast(id ? 'Voucher updated' : 'Voucher created');
        await Promise.all([fetchCategories(), fetchVouchers()]);
    } catch (error) {
        console.error('Error saving voucher:', error);
        showToast(error.message || 'Failed to save voucher', 'error');
    }
}

function openCategoryModal(id = null) {
    categoryForm.reset();
    categoryIdInput.value = '';
    categoryModalTitle.textContent = 'Create Voucher Category';
    document.getElementById('category_active').checked = true;
    document.getElementById('category_disabled').checked = false;
    document.getElementById('category_max_selectable').value = 1;
    document.getElementById('category_package_type_scope').value = 'all';
    document.getElementById('category_max_package_amount').value = '';

    if (id) {
        const category = currentCategories.find((item) => item.bubble_id === id);
        if (category) {
            categoryIdInput.value = category.bubble_id;
            categoryModalTitle.textContent = 'Edit Voucher Category';
            document.getElementById('category_name').value = category.name || '';
            document.getElementById('category_description').value = category.description || '';
            document.getElementById('category_max_selectable').value = category.max_selectable || 1;
            document.getElementById('category_min_package_amount').value = category.min_package_amount ?? '';
            document.getElementById('category_max_package_amount').value = category.max_package_amount ?? '';
            document.getElementById('category_min_panel_quantity').value = category.min_panel_quantity ?? '';
            document.getElementById('category_package_type_scope').value = category.package_type_scope || 'all';
            document.getElementById('category_active').checked = !!category.active;
            document.getElementById('category_disabled').checked = !!category.disabled;
        }
    }

    categoryModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeCategoryModal() {
    categoryModal.classList.add('hidden');
    document.body.style.overflow = 'auto';
}

async function handleCategorySubmit(event) {
    event.preventDefault();

    const id = categoryIdInput.value;
    const payload = {
        name: document.getElementById('category_name').value.trim(),
        description: document.getElementById('category_description').value.trim() || null,
        max_selectable: document.getElementById('category_max_selectable').value || 1,
        min_package_amount: document.getElementById('category_min_package_amount').value || null,
        max_package_amount: document.getElementById('category_max_package_amount').value || null,
        min_panel_quantity: document.getElementById('category_min_panel_quantity').value || null,
        package_type_scope: document.getElementById('category_package_type_scope').value || 'all',
        active: document.getElementById('category_active').checked,
        disabled: document.getElementById('category_disabled').checked
    };

    try {
        await fetchJson(id ? `/api/voucher-categories/${id}` : '/api/voucher-categories', {
            method: id ? 'PUT' : 'POST',
            body: JSON.stringify(payload)
        });
        closeCategoryModal();
        showToast(id ? 'Category updated' : 'Category created');
        await Promise.all([fetchCategories(), fetchVouchers()]);
    } catch (error) {
        console.error('Error saving category:', error);
        showToast(error.message || 'Failed to save category', 'error');
    }
}

function editVoucher(id) {
    openModal(id);
}

function editCategory(id) {
    openCategoryModal(id);
}

async function toggleActive(id) {
    try {
        const json = await fetchJson(`/api/vouchers/${id}/toggle`, { method: 'PATCH' });
        showToast(json.active ? 'Voucher activated' : 'Voucher deactivated');
        await fetchVouchers();
    } catch (error) {
        showToast(error.message || 'Failed to toggle voucher', 'error');
    }
}

async function duplicateVoucher(id) {
    try {
        await fetchJson(`/api/vouchers/${id}/duplicate`, { method: 'POST' });
        showToast('Voucher duplicated successfully');
        await Promise.all([fetchCategories(), fetchVouchers()]);
    } catch (error) {
        console.error('Error duplicating voucher:', error);
        showToast(error.message || 'Failed to duplicate voucher', 'error');
    }
}

async function deleteVoucher(id) {
    if (!confirm('Move this voucher to recycle bin?')) return;
    try {
        await fetchJson(`/api/vouchers/${id}`, { method: 'DELETE' });
        showToast('Voucher moved to recycle bin');
        await Promise.all([fetchCategories(), fetchVouchers()]);
    } catch (error) {
        showToast(error.message || 'Failed to delete voucher', 'error');
    }
}

async function restoreVoucher(id) {
    try {
        await fetchJson(`/api/vouchers/${id}/restore`, { method: 'POST' });
        showToast('Voucher restored');
        await Promise.all([fetchCategories(), fetchVouchers()]);
    } catch (error) {
        showToast(error.message || 'Failed to restore voucher', 'error');
    }
}

async function toggleCategoryActive(id) {
    try {
        const json = await fetchJson(`/api/voucher-categories/${id}/toggle`, { method: 'PATCH' });
        showToast(json.active ? 'Category activated' : 'Category deactivated');
        await Promise.all([fetchCategories(), fetchVouchers()]);
    } catch (error) {
        showToast(error.message || 'Failed to toggle category', 'error');
    }
}

async function toggleCategoryDisabled(id, disabled) {
    try {
        await fetchJson(`/api/voucher-categories/${id}/disable`, {
            method: 'PATCH',
            body: JSON.stringify({ disabled: normalizeBool(disabled, false) })
        });
        showToast(disabled ? 'Category disabled in voucher step' : 'Category enabled in voucher step');
        await Promise.all([fetchCategories(), fetchVouchers()]);
    } catch (error) {
        showToast(error.message || 'Failed to update category', 'error');
    }
}

async function deleteCategory(id) {
    if (!confirm('Delete this voucher category? Linked vouchers will become uncategorized.')) return;
    try {
        await fetchJson(`/api/voucher-categories/${id}`, { method: 'DELETE' });
        showToast('Category moved to recycle bin');
        await Promise.all([fetchCategories(), fetchVouchers()]);
    } catch (error) {
        showToast(error.message || 'Failed to delete category', 'error');
    }
}

async function restoreCategory(id) {
    try {
        await fetchJson(`/api/voucher-categories/${id}/restore`, { method: 'POST' });
        showToast('Category restored');
        await Promise.all([fetchCategories(), fetchVouchers()]);
    } catch (error) {
        showToast(error.message || 'Failed to restore category', 'error');
    }
}

function showToast(message, type = 'success') {
    if (!toast || !toastMessage || !toastIcon) return;

    toastMessage.textContent = message;
    toastIcon.className = `w-8 h-8 rounded-full flex items-center justify-center ${type === 'error' ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'}`;
    toastIcon.innerHTML = type === 'error'
        ? '<i class="fa-solid fa-triangle-exclamation"></i>'
        : '<i class="fa-solid fa-check"></i>';

    toast.classList.remove('translate-y-20', 'opacity-0');
    setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 2800);
}
