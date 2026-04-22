(function attachInvoicePageShared(global) {
    function setInputValue(id, value) {
        const input = document.getElementById(id);
        if (!input || value == null || value === '') return;
        input.value = value;
    }

    function setCheckboxValue(id, checked) {
        const input = document.getElementById(id);
        if (!input) return;
        input.checked = Boolean(checked);
    }

    function initializeInvoicePageBase() {
        global.CustomerManager?.initInline({
            fieldIds: {
                name: 'customerName',
                phone: 'customerPhone',
                address: 'customerAddress',
                profilePicture: 'profilePicture',
                profilePreview: 'profilePreview'
            }
        });
    }

    async function fetchUserProfile() {
        try {
            const response = await fetch('/api/user/me');
            if (!response.ok) return;

            const data = await response.json();
            if (!data.success || !data.user) return;

            const welcomeDiv = document.getElementById('userWelcome');
            const nameSpan = document.getElementById('userNameDisplay');

            if (welcomeDiv && nameSpan) {
                nameSpan.textContent = data.user.name || 'User';
                welcomeDiv.classList.remove('hidden');
            }
        } catch (err) {
            console.error('Error fetching user profile:', err);
        }
    }

    function setCustomerContactFields({ name, phone, address }) {
        setInputValue('customerName', name);
        setInputValue('customerPhone', phone);
        setInputValue('customerAddress', address);
    }

    function setProfilePicture(url) {
        if (!url) return;

        setInputValue('profilePicture', url);
        const preview = document.getElementById('profilePreview');
        if (preview) {
            preview.innerHTML = `<img src="${url}" class="h-full w-full object-cover">`;
        }
    }

    function formatDiscountValue({ fixedAmount = 0, percent = 0 } = {}) {
        let discountValue = '';
        if (Number(fixedAmount) > 0) discountValue += fixedAmount;
        if (Number(percent) > 0) discountValue += (discountValue ? ' ' : '') + `${percent}%`;
        return discountValue;
    }

    function applyDiscountValue(value) {
        setInputValue('discountGiven', value);
    }

    function applyCommonInvoiceQueryPrefill({
        urlParams,
        applySolarSavingsParams,
        applyAssignedReferralSelection
    }) {
        if (!urlParams) return;

        setCustomerContactFields({
            name: urlParams.get('customer_name'),
            phone: urlParams.get('customer_phone'),
            address: urlParams.get('customer_address')
        });
        applyDiscountValue(urlParams.get('discount_given'));
        setCheckboxValue('applySST', urlParams.get('apply_sst') === 'true');
        setInputValue('templateIdHidden', urlParams.get('template_id'));

        if (typeof applySolarSavingsParams === 'function') {
            applySolarSavingsParams(urlParams);
        }

        const selectedReferralId = urlParams.get('linked_referral') || '';
        if (selectedReferralId && typeof applyAssignedReferralSelection === 'function') {
            applyAssignedReferralSelection(selectedReferralId, { autofill: true });
        }
    }

    function wireCommonInvoicePageInteractions({
        addManualItem,
        applyAssignedReferralSelection,
        updateInvoicePreview,
        getBallastQty,
        addPaymentMethodRow
    }) {
        const addManualItemBtn = document.getElementById('addManualItemBtn');
        if (addManualItemBtn && typeof addManualItem === 'function') {
            addManualItemBtn.addEventListener('click', () => addManualItem());
        }

        const assignedReferralSelect = document.getElementById('assignedReferralSelect');
        if (assignedReferralSelect && typeof applyAssignedReferralSelection === 'function') {
            assignedReferralSelect.addEventListener('change', (event) => {
                applyAssignedReferralSelection(event.target.value, { autofill: true });
            });
        }

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

        const discountInput = document.getElementById('discountGiven');
        if (discountInput) {
            discountInput.addEventListener('input', updateInvoicePreview);
            discountInput.addEventListener('change', updateInvoicePreview);
        }

        const ballastQtyInput = document.getElementById('ballastQty');
        if (ballastQtyInput && typeof getBallastQty === 'function') {
            const handleBallastChange = () => {
                getBallastQty();
                updateInvoicePreview();
            };

            ballastQtyInput.addEventListener('input', handleBallastChange);
            ballastQtyInput.addEventListener('change', handleBallastChange);
        }

        const addBtn = document.getElementById('addPaymentMethodBtn');
        if (addBtn && typeof addPaymentMethodRow === 'function') {
            addBtn.addEventListener('click', addPaymentMethodRow);
        }
    }

    function applyCommonWorkspaceStatuses({
        selectedDraftVoucherCount = 0,
        setSectionStatus,
        refreshActiveWorkspaceSection
    }) {
        const packageReady = Boolean(document.getElementById('packageIdHidden')?.value);
        setSectionStatus('package-summary', packageReady ? 'Ready' : 'Pending', packageReady ? 'ready' : 'warning');

        const customerName = document.getElementById('customerName')?.value?.trim();
        const leadSource = document.getElementById('customerLeadSource')?.value?.trim();
        const remark = document.getElementById('customerRemark')?.value?.trim();
        const customerReady = !customerName || (leadSource && remark);
        setSectionStatus('customer-lead', customerReady ? 'Ready' : 'Needs attention', customerReady ? 'ready' : 'error');

        const pricingHealthy = !global._extraItemsDiscountExceeded && !global._maxDiscountExceeded && !global._subtotalIsZeroOrNegative;
        setSectionStatus('price-controls', pricingHealthy ? 'Ready' : 'Needs attention', pricingHealthy ? 'ready' : 'error');

        const paymentRows = document.querySelectorAll('#paymentMethodsContainer > *').length;
        setSectionStatus('payment-setup', paymentRows > 0 ? 'Ready' : 'Pending', paymentRows > 0 ? 'ready' : 'warning');

        const voucherRootVisible = !document.getElementById('voucherStepRoot')?.classList.contains('hidden');
        const voucherLabel = !packageReady
            ? 'Select package first'
            : selectedDraftVoucherCount > 0
                ? `${selectedDraftVoucherCount} selected`
                : voucherRootVisible
                    ? 'Optional'
                    : 'Loading';
        const voucherTone = !packageReady
            ? 'warning'
            : selectedDraftVoucherCount > 0
                ? 'ready'
                : voucherRootVisible
                    ? 'optional'
                    : 'warning';
        setSectionStatus('voucher-selection', voucherLabel, voucherTone);

        const reviewReady = packageReady && customerReady && pricingHealthy;
        setSectionStatus('final-review', reviewReady ? 'Ready' : 'Pending', reviewReady ? 'ready' : 'warning');

        if (typeof refreshActiveWorkspaceSection === 'function') {
            refreshActiveWorkspaceSection();
        }
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

    function initWorkspaceShell({ updateWorkspaceStatuses } = {}) {
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
        if (typeof updateWorkspaceStatuses === 'function') {
            updateWorkspaceStatuses();
        }
    }

    function fetchVoucherPreviewData(packageId) {
        return fetch(`/api/v1/vouchers/preview?package_id=${encodeURIComponent(packageId)}`, {
            credentials: 'same-origin'
        })
            .then(async (response) => {
                const json = await response.json();
                if (!response.ok) {
                    throw new Error(json?.error || 'Failed to load voucher preview.');
                }
                return json?.data || {};
            });
    }

    function mapExtraItemsForRequest(extraItems = []) {
        return extraItems.map(item => ({
            description: item.description,
            qty: item.qty,
            unit_price: item.unit_price,
            total_price: item.qty * item.unit_price,
            linked_product: item.linked_product || null
        }));
    }

    function validateInvoiceSubmitState({ extraItemsMaxDiscountPercent = 5 } = {}) {
        if (global._extraItemsDiscountExceeded) {
            const pkgPrice = parseFloat(document.getElementById('packagePrice')?.value || 0);
            const maxRM = (pkgPrice * extraItemsMaxDiscountPercent / 100).toFixed(2);
            Swal.fire({
                icon: 'error',
                title: 'Discount Limit Exceeded',
                text: `Additional items discount cannot exceed ${extraItemsMaxDiscountPercent}% of the package price (RM ${maxRM}). Please adjust the negative item amounts.`
            });
            return false;
        }

        if (global._maxDiscountExceeded) {
            Swal.fire({
                icon: 'error',
                title: 'Max Discount Exceeded',
                text: `The discount entered exceeds the maximum allowed discount of RM ${(Number(global.maxDiscountAllowed) || 0).toFixed(2)} (${Number(global.maxDiscountPercentAllowed) || 0}% of package price).`
            });
            return false;
        }

        if (global._subtotalIsZeroOrNegative) {
            Swal.fire({
                icon: 'error',
                title: 'Invalid Total Amount',
                text: 'The total amount cannot be zero or negative after applying discounts. Please adjust the discounts.'
            });
            return false;
        }

        const customerName = document.getElementById('customerName')?.value?.trim();
        const leadSource = document.getElementById('customerLeadSource')?.value;
        const remark = document.getElementById('customerRemark')?.value;

        if (customerName && !leadSource) {
            Swal.fire({
                icon: 'error',
                title: 'Lead Source Required',
                text: 'Please select a lead source for the customer.'
            });
            return false;
        }

        if (customerName && !remark?.trim()) {
            Swal.fire({
                icon: 'error',
                title: 'Remark Required',
                text: 'Please add a remark for the customer.'
            });
            return false;
        }

        return true;
    }

    function setSubmitButtonLoadingState(form, loadingText) {
        const submitBtn = form?.querySelector('button[type="submit"]');
        const originalText = submitBtn?.textContent || '';

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = loadingText;
        }

        return function restoreSubmitButtonState() {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        };
    }

    function buildInvoiceRequestData({
        formValues,
        eppData = {},
        extraItems = [],
        voucherIds = [],
        additionalFields = {}
    }) {
        const requestData = {
            linked_package: formValues.linked_package,
            template_id: formValues.template_id || null,
            linked_referral: formValues.linked_referral || null,
            customer_name: formValues.customer_name || null,
            customer_phone: formValues.customer_phone || null,
            customer_address: formValues.customer_address || null,
            profilePicture: document.getElementById('profilePicture')?.value || null,
            lead_source: document.getElementById('customerLeadSource')?.value || null,
            remark: document.getElementById('customerRemark')?.value || null,
            discount_given: formValues.discount_given || null,
            apply_sst: document.getElementById('applySST')?.checked || false,
            payment_structure: eppData.payment_structure,
            extra_items: mapExtraItemsForRequest(extraItems),
            voucher_ids: voucherIds,
            ...additionalFields
        };

        if (eppData.total_fee > 0 && eppData.description) {
            requestData.epp_fee_amount = eppData.total_fee;
            requestData.epp_fee_description = eppData.description;
        }

        return requestData;
    }

    global.InvoicePageShared = {
        applyCommonWorkspaceStatuses,
        applyCommonInvoiceQueryPrefill,
        applyDiscountValue,
        buildInvoiceRequestData,
        fetchVoucherPreviewData,
        fetchUserProfile,
        formatDiscountValue,
        initWorkspaceShell,
        initializeInvoicePageBase,
        refreshActiveWorkspaceSection,
        scrollToWorkspaceSection,
        setSectionStatus,
        setCustomerContactFields,
        setProfilePicture,
        setSubmitButtonLoadingState,
        validateInvoiceSubmitState,
        wireCommonInvoicePageInteractions
    };
})(window);
