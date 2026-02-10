/**
 * Voucher Management Page Logic
 */

let allVouchers = [];

// DOM Elements
const voucherList = document.getElementById('voucherList');
const voucherModal = document.getElementById('voucherModal');
const voucherForm = document.getElementById('voucherForm');
const modalTitle = document.getElementById('modalTitle');
const voucherIdInput = document.getElementById('voucherId');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');
const toastIcon = document.getElementById('toastIcon');

const discountTypeSelect = document.getElementById('voucher_type');
const valuePrefix = document.getElementById('valuePrefix');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    fetchVouchers();

    // Handle discount type change UI
    discountTypeSelect.addEventListener('change', (e) => {
        valuePrefix.textContent = e.target.value === 'Percentage Discount' ? '%' : 'RM';
    });

    // Form submission
    voucherForm.addEventListener('submit', handleFormSubmit);
});

/**
 * Fetch all vouchers from API
 */
async function fetchVouchers() {
    try {
        const response = await fetch('/api/vouchers');
        if (response.status === 401) {
            window.location.href = '/domestic';
            return;
        }

        const data = await response.json();
        console.log('API Response:', data); // Debug log

        if (Array.isArray(data)) {
            allVouchers = data;
        } else if (data.vouchers && Array.isArray(data.vouchers)) {
            allVouchers = data.vouchers;
        } else {
            console.error('Expected array but got:', data);
            allVouchers = [];
        }

        renderVouchers();
        updateStats();
    } catch (error) {
        console.error('Error fetching vouchers:', error);
        showToast('Failed to load vouchers', 'error');
    }
}

/**
 * Render voucher list
 */
function renderVouchers() {
    if (allVouchers.length === 0) {
        voucherList.innerHTML = `
            <div class="col-span-full py-20 flex flex-col items-center justify-center text-slate-400 bg-white rounded-3xl border-2 border-dashed border-slate-100">
                <i class="fa-solid fa-ticket text-5xl mb-4 opacity-20"></i>
                <p class="font-bold text-lg">No vouchers found</p>
                <p class="text-sm">Click "Create Voucher" to get started.</p>
            </div>
        `;
        return;
    }

    voucherList.innerHTML = allVouchers.map(voucher => {
        const isActive = voucher.active;
        const discountText = voucher.voucher_type === 'Percentage Discount'
            ? `${voucher.discount_percent}% OFF`
            : `RM ${parseFloat(voucher.discount_amount || 0).toLocaleString()} OFF`;

        return `
            <div class="voucher-card bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col h-full relative overflow-hidden">
                ${!isActive ? '<div class="absolute top-0 right-0 bg-slate-100 text-slate-400 text-[9px] font-black px-3 py-1 rounded-bl-xl uppercase tracking-widest">Inactive</div>' : ''}
                
                <div class="flex items-start justify-between mb-6">
                    <div class="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-900 shadow-inner">
                        <i class="fa-solid fa-ticket text-xl"></i>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="editVoucher('${voucher.bubble_id}')" class="w-9 h-9 rounded-xl hover:bg-slate-50 flex items-center justify-center text-slate-400 hover:text-blue-500 transition-all">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button onclick="deleteVoucher('${voucher.bubble_id}')" class="w-9 h-9 rounded-xl hover:bg-red-50 flex items-center justify-center text-slate-400 hover:text-red-500 transition-all">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div>

                <div class="flex-1">
                    <h3 class="font-extrabold text-slate-900 mb-1 truncate" title="${voucher.title}">${voucher.title || 'Untitled Voucher'}</h3>
                    <p class="text-[10px] font-black text-brand-blue uppercase tracking-widest mb-4 inline-block px-2 py-1 bg-blue-50 rounded-lg">
                        ${voucher.voucher_code}
                    </p>
                    
                    <div class="space-y-3">
                        <div class="flex items-center justify-between">
                            <span class="text-xs font-bold text-slate-400">Discount</span>
                            <span class="text-sm font-black text-slate-900">${discountText}</span>
                        </div>
                        <div class="flex items-center justify-between">
                            <span class="text-xs font-bold text-slate-400">Availability</span>
                            <span class="text-xs font-bold ${voucher.voucher_availability <= 5 ? 'text-red-500' : 'text-slate-600'}">
                                ${voucher.voucher_availability === null ? '∞' : voucher.voucher_availability} left
                            </span>
                        </div>
                    </div>
                </div>

                <div class="mt-6 pt-5 border-t border-slate-50 flex items-center justify-between text-[10px]">
                    <span class="text-slate-400 font-bold uppercase tracking-tighter">
                        ${voucher.available_until ? `Ends: ${new Date(voucher.available_until).toLocaleDateString()}` : 'No Expiry'}
                    </span>
                    <span class="flex items-center gap-1.5 ${voucher.public ? 'text-blue-500' : 'text-slate-300'} font-black uppercase tracking-widest">
                        <i class="fa-solid ${voucher.public ? 'fa-globe' : 'fa-lock'}"></i>
                        ${voucher.public ? 'Public' : 'Private'}
                    </span>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Update stats numbers
 */
function updateStats() {
    const total = allVouchers.length;
    const active = allVouchers.filter(v => v.active).length;
    const publicCount = allVouchers.filter(v => v.public).length;

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statActive').textContent = active;
    document.getElementById('statPublic').textContent = publicCount;
}

/**
 * Open modal for creation/edit
 */
function openModal(id = null) {
    voucherForm.reset();
    voucherIdInput.value = '';
    modalTitle.textContent = 'Create New Voucher';

    if (id) {
        const voucher = allVouchers.find(v => v.bubble_id === id);
        if (voucher) {
            modalTitle.textContent = 'Edit Voucher';
            voucherIdInput.value = voucher.bubble_id;
            document.getElementById('title').value = voucher.title || '';
            document.getElementById('voucher_code').value = voucher.voucher_code || '';
            document.getElementById('voucher_type').value = voucher.voucher_type || 'Fixed Amount Discount';
            document.getElementById('discount_value').value = voucher.voucher_type === 'Percentage Discount'
                ? voucher.discount_percent
                : voucher.discount_amount;
            document.getElementById('invoice_description').value = voucher.invoice_description || '';
            document.getElementById('voucher_availability').value = voucher.voucher_availability || '';
            document.getElementById('available_until').value = voucher.available_until ? voucher.available_until.split('T')[0] : '';
            document.getElementById('terms_conditions').value = voucher.terms_conditions || '';
            document.getElementById('active').checked = !!voucher.active;
            document.getElementById('public').checked = !!voucher.public;

            valuePrefix.textContent = voucher.voucher_type === 'Percentage Discount' ? '%' : 'RM';
        }
    }

    voucherModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    voucherModal.classList.add('hidden');
    document.body.style.overflow = 'auto';
}

/**
 * Handle form submission
 */
async function handleFormSubmit(e) {
    e.preventDefault();

    const id = voucherIdInput.value;
    const voucherType = document.getElementById('voucher_type').value;
    const value = document.getElementById('discount_value').value;

    const payload = {
        title: document.getElementById('title').value,
        voucher_code: document.getElementById('voucher_code').value.toUpperCase(),
        voucher_type: voucherType,
        discount_amount: voucherType === 'Fixed Amount Discount' ? value : null,
        discount_percent: voucherType === 'Percentage Discount' ? value : null,
        invoice_description: document.getElementById('invoice_description').value,
        voucher_availability: document.getElementById('voucher_availability').value || null,
        available_until: document.getElementById('available_until').value || null,
        terms_conditions: document.getElementById('terms_conditions').value,
        active: document.getElementById('active').checked,
        public: document.getElementById('public').checked
    };

    try {
        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/vouchers/${id}` : '/api/vouchers';

        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to save voucher');
        }

        showToast(id ? 'Voucher updated!' : 'Voucher created!');
        closeModal();
        fetchVouchers();
    } catch (error) {
        console.error('Error saving voucher:', error);
        showToast(error.message, 'error');
    }
}

/**
 * Delete a voucher
 */
async function deleteVoucher(id) {
    if (!confirm('Are you sure you want to delete this voucher? This cannot be undone.')) return;

    try {
        const response = await fetch(`/api/vouchers/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete voucher');

        showToast('Voucher deleted', 'success');
        fetchVouchers();
    } catch (error) {
        console.error('Error deleting voucher:', error);
        showToast('Failed to delete voucher', 'error');
    }
}

function editVoucher(id) {
    openModal(id);
}

/**
 * Show Toast Notification
 */
function showToast(message, type = 'success') {
    toastMessage.textContent = message;

    if (type === 'error') {
        toastIcon.className = 'w-8 h-8 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center';
        toastIcon.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i>';
    } else {
        toastIcon.className = 'w-8 h-8 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center';
        toastIcon.innerHTML = '<i class="fa-solid fa-check"></i>';
    }

    toast.classList.remove('translate-y-20', 'opacity-0');

    setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 3000);
}
