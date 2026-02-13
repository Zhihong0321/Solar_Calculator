/**
 * CustomerManager - Unified Customer Creation/Editing Module
 * 
 * SINGLE SOURCE OF TRUTH for customer management across:
 * - /my-customers page (Modal Mode)
 * - Invoice creation page (Inline Mode)
 * - Invoice edit page (Inline Mode)
 * 
 * USAGE:
 * 1. Modal Mode (my_customers page):
 *    CustomerManager.initModal({ onSaved: callback })
 *    CustomerManager.openModal(customer) // null for create, customer object for edit
 *    CustomerManager.closeModal()
 * 
 * 2. Inline Mode (invoice pages):
 *    CustomerManager.initInline({ fieldIds: {...}, onProfileUpdate: callback })
 *    CustomerManager.checkWhatsApp(phoneInputId, options)
 *    CustomerManager.getCustomerData(fieldIds)
 *    CustomerManager.setCustomerData(customer, fieldIds)
 */

const CustomerManager = (function() {
    // Private state
    let _state = {
        currentCustomerId: null,
        profilePicture: null,
        onSaved: null,          // Callback after customer saved (modal mode)
        onProfileUpdate: null,  // Callback when profile picture updates (inline mode)
        mode: 'modal',          // 'modal' or 'inline'
        fieldIds: {}            // Custom field ID mappings
    };

    // Default field ID mappings
    const DEFAULT_FIELD_IDS = {
        id: 'customerId',
        name: 'customerName',
        phone: 'customerPhone',
        email: 'customerEmail',
        address: 'customerAddress',
        city: 'customerCity',
        state: 'customerState',
        postcode: 'customerPostcode',
        profilePicture: 'profilePicture',
        profilePreview: 'profilePreview',
        leadSource: 'customerLeadSource',
        remark: 'customerRemark'
    };

    // WhatsApp API endpoints
    const WHATSAPP_API = {
        check: '/api/customers/check-whatsapp',
        syncPhoto: '/api/customers/whatsapp-photo'
    };

    // Customer API endpoints
    const CUSTOMER_API = {
        list: '/api/customers',
        create: '/api/customers',
        update: (id) => `/api/customers/${id}`,
        delete: (id) => `/api/customers/${id}`
    };

    /**
     * Initialize for inline mode (invoice pages)
     * @param {Object} config - Configuration object
     * @param {Object} config.fieldIds - Custom field ID mappings (optional)
     * @param {Function} config.onProfileUpdate - Callback when profile picture updates
     */
    function initInline(config = {}) {
        _state.mode = 'inline';
        _state.fieldIds = { ...DEFAULT_FIELD_IDS, ...config.fieldIds };
        _state.onProfileUpdate = config.onProfileUpdate || null;
        console.log('[CustomerManager] Initialized in inline mode');
    }

    /**
     * Initialize for modal mode (my_customers page)
     * @param {Object} config - Configuration object
     * @param {Function} config.onSaved - Callback after customer saved
     */
    function initModal(config = {}) {
        _state.mode = 'modal';
        _state.fieldIds = { ...DEFAULT_FIELD_IDS };
        _state.onSaved = config.onSaved || null;
        console.log('[CustomerManager] Initialized in modal mode');
    }

    /**
     * Open customer modal (for my_customers page)
     * @param {Object|null} customer - Customer data for edit, null for create
     */
    function openModal(customer = null) {
        const modal = document.getElementById('customerModal');
        const form = document.getElementById('customerForm');
        const titleEl = document.getElementById('modalTitle');
        
        if (!modal || !form) {
            console.error('[CustomerManager] Modal elements not found');
            return;
        }

        // Reset form
        form.reset();
        _state.currentCustomerId = null;
        _state.profilePicture = null;

        // Reset profile preview
        _resetProfilePreview();

        if (customer) {
            // Edit mode
            if (titleEl) titleEl.textContent = 'Edit Customer';
            _populateForm(customer);
            _state.currentCustomerId = customer.id;
        } else {
            // Create mode
            if (titleEl) titleEl.textContent = 'Add Customer';
        }

        modal.classList.remove('hidden');
    }

    /**
     * Close customer modal
     */
    function closeModal() {
        const modal = document.getElementById('customerModal');
        if (modal) {
            modal.classList.add('hidden');
        }
        _state.currentCustomerId = null;
        _state.profilePicture = null;
    }

    /**
     * Reset profile preview to default avatar
     */
    function _resetProfilePreview() {
        const preview = document.getElementById('profilePreview');
        if (preview) {
            preview.innerHTML = `
                <svg class="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                </svg>
            `;
        }
    }

    /**
     * Populate form with customer data
     */
    function _populateForm(customer) {
        const fieldMap = {
            'customerId': customer.id,
            'customerName': customer.name,
            'customerPhone': customer.phone || '',
            'customerEmail': customer.email || '',
            'customerAddress': customer.address || '',
            'customerCity': customer.city || '',
            'customerState': customer.state || '',
            'customerPostcode': customer.postcode || '',
            'customerLeadSource': customer.lead_source || '',
            'customerRemark': customer.remark || ''
        };

        Object.entries(fieldMap).forEach(([fieldId, value]) => {
            const el = document.getElementById(fieldId);
            if (el) el.value = value || '';
        });

        // Handle profile picture
        const hiddenPic = document.getElementById('profilePicture');
        const preview = document.getElementById('profilePreview');
        
        if (customer.profile_picture) {
            _state.profilePicture = customer.profile_picture;
            if (hiddenPic) hiddenPic.value = customer.profile_picture;
            if (preview) {
                preview.innerHTML = `<img src="${customer.profile_picture}" class="h-full w-full object-cover">`;
            }
        }
    }

    /**
     * Handle form submission (modal mode)
     */
    async function handleFormSubmit(event) {
        if (event) event.preventDefault();

        const id = _state.currentCustomerId || document.getElementById('customerId')?.value;
        
        const data = {
            name: document.getElementById('customerName')?.value || '',
            phone: document.getElementById('customerPhone')?.value || '',
            email: document.getElementById('customerEmail')?.value || '',
            address: document.getElementById('customerAddress')?.value || '',
            city: document.getElementById('customerCity')?.value || '',
            state: document.getElementById('customerState')?.value || '',
            postcode: document.getElementById('customerPostcode')?.value || '',
            profilePicture: document.getElementById('profilePicture')?.value || null,
            leadSource: document.getElementById('customerLeadSource')?.value || null,
            remark: document.getElementById('customerRemark')?.value || null
        };

        if (!data.name.trim()) {
            Swal.fire({ icon: 'error', title: 'Name Required', text: 'Customer name is required.' });
            return;
        }

        // Require lead_source for new customers
        if (!id && !data.leadSource) {
            Swal.fire({ icon: 'error', title: 'Lead Source Required', text: 'Please select a lead source for the customer.' });
            return;
        }

        const url = id ? CUSTOMER_API.update(id) : CUSTOMER_API.create;
        const method = id ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();

            if (result.success) {
                closeModal();
                
                // Show success toast
                Swal.fire({
                    icon: 'success',
                    title: 'Saved',
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 2000
                });

                // Call onSaved callback if provided
                if (_state.onSaved) {
                    _state.onSaved(result.data);
                }
            } else {
                throw new Error(result.error || 'Failed to save customer');
            }
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Error', text: err.message });
        }
    }

    /**
     * Delete customer
     */
    async function deleteCustomer(id) {
        const confirm = await Swal.fire({
            icon: 'warning',
            title: 'Delete Customer?',
            text: 'This action cannot be undone. If the customer has invoices, deletion will fail.',
            showCancelButton: true,
            confirmButtonText: 'Delete',
            confirmButtonColor: '#dc2626'
        });

        if (!confirm.isConfirmed) return;

        try {
            const res = await fetch(CUSTOMER_API.delete(id), { method: 'DELETE' });
            const result = await res.json();

            if (result.success) {
                Swal.fire({
                    icon: 'success',
                    title: 'Deleted',
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 2000
                });
                
                if (_state.onSaved) {
                    _state.onSaved(null, id); // Pass deleted ID
                }
            } else {
                throw new Error(result.error || 'Failed to delete');
            }
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Error', text: err.message });
        }
    }

    /**
     * Check WhatsApp - Unified for all pages
     * @param {string} phoneInputId - ID of phone input field (default: 'customerPhone')
     * @param {Object} options - Options object
     * @param {string} options.profilePictureInputId - Hidden input for profile picture URL
     * @param {string} options.profilePreviewId - Element to show preview
     * @param {HTMLElement} options.button - The button that triggered (for animation)
     */
    async function checkWhatsApp(phoneInputId = 'customerPhone', options = {}) {
        const phoneInput = document.getElementById(phoneInputId);
        if (!phoneInput) {
            console.error('[CustomerManager] Phone input not found:', phoneInputId);
            return;
        }

        let phone = phoneInput.value.replace(/\D/g, '');
        if (phone.startsWith('0')) {
            phone = '60' + phone.substring(1);
        }

        if (!phone || phone.length < 10) {
            Swal.fire({ 
                icon: 'warning', 
                title: 'Invalid Phone', 
                text: 'Please enter a valid phone number with country code (e.g. 60123456789)' 
            });
            return;
        }

        // Get button for animation - try options.button first, then event.currentTarget
        const btn = options.button || (typeof event !== 'undefined' ? event?.currentTarget : null);
        const originalColor = btn?.style.color || '';
        
        if (btn) {
            btn.classList.add('animate-pulse');
            btn.style.color = '#16a34a';
        }

        try {
            const res = await fetch(WHATSAPP_API.check, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone })
            });
            const data = await res.json();

            if (data.success && data.isWhatsAppUser) {
                const picInputId = options.profilePictureInputId || 'profilePicture';
                const previewId = options.profilePreviewId || 'profilePreview';
                
                Swal.fire({
                    title: 'WhatsApp User Detected!',
                    html: `
                        <div class="flex flex-col items-center gap-4 py-2">
                            ${data.profilePicture ? `<img src="${data.profilePicture}" class="w-24 h-24 rounded-full border-4 border-green-500 shadow-lg">` : ''}
                            <div class="text-center">
                                <div class="font-bold text-lg text-slate-900">Verified WhatsApp Number</div>
                                <div class="text-green-600 font-semibold flex items-center justify-center gap-1">
                                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                                    </svg>
                                    Verified
                                </div>
                            </div>
                            <div class="flex flex-col gap-2 w-full px-4">
                                ${data.profilePicture ? `
                                <button onclick="CustomerManager.fillWhatsAppInfo('${data.profilePicture}', '${phone}', '${picInputId}', '${previewId}')" 
                                    class="mt-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-green-700 transition-all">
                                    Use Profile Picture
                                </button>` : '<div class="text-sm text-slate-500 italic">No profile picture available</div>'}
                            </div>
                        </div>
                    `,
                    showConfirmButton: false,
                    showCloseButton: true
                });
            } else {
                Swal.fire({ 
                    icon: 'info', 
                    title: 'Not Found', 
                    text: 'This number is not registered on WhatsApp.' 
                });
            }
        } catch (err) {
            console.error('[CustomerManager] WhatsApp check error:', err);
            Swal.fire({ 
                icon: 'error', 
                title: 'API Error', 
                text: 'Failed to connect to WhatsApp API server. ' + err.message 
            });
        } finally {
            if (btn) {
                btn.classList.remove('animate-pulse');
                btn.style.color = originalColor;
            }
        }
    }

    /**
     * Fill WhatsApp info after user confirms
     */
    async function fillWhatsAppInfo(photoUrl, phone, profilePictureInputId = 'profilePicture', profilePreviewId = 'profilePreview') {
        if (photoUrl) {
            Swal.fire({
                title: 'Syncing Profile Picture...',
                didOpen: () => { Swal.showLoading(); }
            });

            try {
                const res = await fetch(WHATSAPP_API.syncPhoto, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ photoUrl, phone })
                });
                const data = await res.json();

                if (data.success && data.localUrl) {
                    // Update hidden input
                    const hiddenInput = document.getElementById(profilePictureInputId);
                    if (hiddenInput) hiddenInput.value = data.localUrl;

                    // Update preview
                    const preview = document.getElementById(profilePreviewId);
                    if (preview) {
                        preview.innerHTML = `<img src="${data.localUrl}" class="h-full w-full object-cover">`;
                    }

                    // Update state
                    _state.profilePicture = data.localUrl;

                    // Call callback if set
                    if (_state.onProfileUpdate) {
                        _state.onProfileUpdate(data.localUrl);
                    }
                }
            } catch (err) {
                console.error('[CustomerManager] Failed to sync WhatsApp photo:', err);
            }
        }
        Swal.close();
    }

    /**
     * Get customer data from inline form (for invoice pages)
     * @param {Object} fieldIds - Custom field ID mappings (optional)
     * @returns {Object} Customer data object
     */
    function getCustomerData(fieldIds = {}) {
        const ids = { ...DEFAULT_FIELD_IDS, ...fieldIds };
        
        return {
            name: document.getElementById(ids.name)?.value?.trim() || null,
            phone: document.getElementById(ids.phone)?.value?.trim() || null,
            email: document.getElementById(ids.email)?.value?.trim() || null,
            address: document.getElementById(ids.address)?.value?.trim() || null,
            city: document.getElementById(ids.city)?.value?.trim() || null,
            state: document.getElementById(ids.state)?.value?.trim() || null,
            postcode: document.getElementById(ids.postcode)?.value?.trim() || null,
            profilePicture: document.getElementById(ids.profilePicture)?.value?.trim() || null
        };
    }

    /**
     * Set customer data to inline form (for invoice pages)
     * @param {Object} customer - Customer data to populate
     * @param {Object} fieldIds - Custom field ID mappings (optional)
     */
    function setCustomerData(customer, fieldIds = {}) {
        const ids = { ...DEFAULT_FIELD_IDS, ...fieldIds };

        if (customer.name && document.getElementById(ids.name)) {
            document.getElementById(ids.name).value = customer.name;
        }
        if (customer.phone && document.getElementById(ids.phone)) {
            document.getElementById(ids.phone).value = customer.phone;
        }
        if (customer.address && document.getElementById(ids.address)) {
            document.getElementById(ids.address).value = customer.address;
        }
        if (customer.profile_picture && document.getElementById(ids.profilePicture)) {
            document.getElementById(ids.profilePicture).value = customer.profile_picture;
            const preview = document.getElementById(ids.profilePreview);
            if (preview) {
                preview.innerHTML = `<img src="${customer.profile_picture}" class="h-full w-full object-cover">`;
            }
        }
    }

    // Public API
    return {
        initInline,
        initModal,
        openModal,
        closeModal,
        handleFormSubmit,
        deleteCustomer,
        checkWhatsApp,
        fillWhatsAppInfo,
        getCustomerData,
        setCustomerData
    };
})();

// Export for module systems (optional)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CustomerManager;
}
