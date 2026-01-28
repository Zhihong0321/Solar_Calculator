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

        const BANKS = Object.keys(EPP_RATES);
        let paymentMethodCounter = 0;
        let availableVouchers = [];
        let selectedVouchers = [];

        // Dynamic Additional Items State
        let manualItems = [];

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

        function toggleFollowUpSection() {
            const name = document.getElementById('customerName').value.trim();
            const section = document.getElementById('followUpSection');
            if (name) {
                section.classList.remove('hidden');
            } else {
                section.classList.add('hidden');
            }
        }

        // Fetch available vouchers
        async function fetchVouchers() {
            try {
                const response = await fetch('/api/vouchers');
                const result = await response.json();
                
                if (result.success) {
                    availableVouchers = result.vouchers;
                    populateVoucherSelect();
                }
            } catch (err) {
                console.error('Error fetching vouchers:', err);
            }
        }

        // Populate voucher dropdown
        function populateVoucherSelect() {
            const select = document.getElementById('voucherSelectDropdown');
            if (!select) return;
            
            // Keep first option
            select.innerHTML = '<option value="">-- Select a Voucher --</option>';
            
            availableVouchers.forEach(v => {
                const option = document.createElement('option');
                option.value = v.voucher_code;
                let text = v.title || v.voucher_code;
                if (v.discount_amount) text += ` (RM ${v.discount_amount})`;
                if (v.discount_percent) text += ` (${v.discount_percent}%)`;
                option.textContent = text;
                select.appendChild(option);
            });
        }

        // Get currently previewed voucher (in dropdown)
        function getPreviewVoucher() {
            const select = document.getElementById('voucherSelectDropdown');
            if (!select || !select.value) return null;
            return availableVouchers.find(v => v.voucher_code === select.value) || null;
        }

        // Add voucher to selection
        function addVoucher() {
            const voucher = getPreviewVoucher();
            if (!voucher) return;

            // Check if already added
            if (selectedVouchers.find(v => v.voucher_code === voucher.voucher_code)) {
                alert('This voucher is already added.');
                return;
            }

            // Check conflicts (simple logic for now: if user selects one, it just adds. 
            // If explicit "auto_cancel" logic is needed, it goes here. 
            // For now, we assume user knows what they are doing or backend validates)
            
            selectedVouchers.push(voucher);
            renderSelectedVouchers();
            updateInvoicePreview();
            
            // Reset dropdown
            const select = document.getElementById('voucherSelectDropdown');
            if (select) select.value = "";
            updateVoucherInfo();
        }

        // Remove voucher from selection
        function removeVoucher(code) {
            selectedVouchers = selectedVouchers.filter(v => v.voucher_code !== code);
            renderSelectedVouchers();
            updateInvoicePreview();
        }

        // Render selected vouchers list
        function renderSelectedVouchers() {
            const container = document.getElementById('selectedVouchersContainer');
            const list = document.getElementById('selectedVouchersList');
            if (!container || !list) return;

            if (selectedVouchers.length === 0) {
                container.classList.add('hidden');
                return;
            }

            container.classList.remove('hidden');
            list.innerHTML = '';

            selectedVouchers.forEach(v => {
                const item = document.createElement('div');
                item.className = 'flex justify-between items-center bg-white p-2 rounded border border-green-200 shadow-sm';
                
                let valText = '';
                if (v.discount_amount) valText = `RM ${v.discount_amount}`;
                else if (v.discount_percent) valText = `${v.discount_percent}%`;

                item.innerHTML = `
                    <div class="flex-1">
                        <div class="text-sm font-semibold text-gray-900">${v.title || v.voucher_code}</div>
                        <div class="text-xs text-gray-600">${v.invoice_description || ''}</div>
                    </div>
                    <div class="flex items-center gap-3">
                        <span class="text-sm font-bold text-green-600">${valText}</span>
                        <button type="button" class="text-red-500 hover:text-red-700 p-1" onclick="removeVoucher('${v.voucher_code}')" title="Remove">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                `;
                list.appendChild(item);
            });
        }

        // Update voucher info display (dropdown preview)
        function updateVoucherInfo() {
            const voucher = getPreviewVoucher();
            const infoDiv = document.getElementById('voucherInfo');
            const titleEl = document.getElementById('voucherTitle');
            const descEl = document.getElementById('voucherDesc');
            const termsEl = document.getElementById('voucherTerms');
            
            if (voucher) {
                infoDiv.classList.remove('hidden');
                titleEl.textContent = voucher.title || voucher.voucher_code;
                descEl.textContent = voucher.invoice_description || '';
                termsEl.textContent = voucher.terms_conditions || '';
            } else {
                infoDiv.classList.add('hidden');
            }
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
            
            // Calculate package price after discount and voucher
            const packagePrice = parseFloat(document.getElementById('packagePrice')?.value || 0);
            const discountInput = document.getElementById('discountGiven')?.value || '';
            const discount = parseDiscount(discountInput);
            
            // Calculate total voucher amount
            let totalVoucherAmount = 0;
            selectedVouchers.forEach(voucher => {
                let amount = 0;
                if (voucher.discount_amount) {
                    amount = parseFloat(voucher.discount_amount);
                } else if (voucher.discount_percent) {
                    amount = packagePrice * (parseFloat(voucher.discount_percent) / 100);
                }
                totalVoucherAmount += amount;
            });

            // Calculate extra items total
            let extraItemsTotal = 0;
            manualItems.forEach(item => {
                if (item.qty > 0) {
                    extraItemsTotal += item.qty * item.unit_price;
                }
            });

            let subtotalAfterDiscount = packagePrice + extraItemsTotal;
            if (discount.fixed > 0) subtotalAfterDiscount -= discount.fixed;
            if (discount.percent > 0) subtotalAfterDiscount -= (packagePrice * discount.percent / 100);
            subtotalAfterDiscount -= totalVoucherAmount; // Deduct vouchers

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
            // Calculate package price after discount and voucher
            const packagePrice = parseFloat(document.getElementById('packagePrice')?.value || 0);
            const discountInput = document.getElementById('discountGiven')?.value || '';
            const discount = parseDiscount(discountInput);
            
            // Calculate total voucher amount
            let totalVoucherAmount = 0;
            selectedVouchers.forEach(voucher => {
                let amount = 0;
                if (voucher.discount_amount) {
                    amount = parseFloat(voucher.discount_amount);
                } else if (voucher.discount_percent) {
                    amount = packagePrice * (parseFloat(voucher.discount_percent) / 100);
                }
                totalVoucherAmount += amount;
            });

            // Calculate extra items total
            let extraItemsTotal = 0;
            manualItems.forEach(item => {
                if (item.qty > 0) {
                    extraItemsTotal += item.qty * item.unit_price;
                }
            });

            let subtotalAfterDiscount = packagePrice + extraItemsTotal;
            if (discount.fixed > 0) subtotalAfterDiscount -= discount.fixed;
            if (discount.percent > 0) subtotalAfterDiscount -= (packagePrice * discount.percent / 100);
            subtotalAfterDiscount -= totalVoucherAmount; // Deduct vouchers

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
            
            // Calculate subtotal (starting with package price)
            let subtotal = packagePrice;

            // Add Extra Items
            manualItems.forEach(item => {
                if (item.qty > 0) {
                    const itemTotal = item.qty * item.unit_price;
                    const el = document.createElement('div');
                    el.className = 'flex justify-between items-center py-2 border-b border-gray-200';
                    el.innerHTML = `
                        <div class="flex-1">
                            <div class="font-medium text-gray-900">${item.description || 'Unnamed Item'}</div>
                            <div class="text-sm text-gray-600">${item.qty} × RM ${item.unit_price.toFixed(2)}</div>
                        </div>
                        <div class="font-semibold text-gray-900">RM ${itemTotal.toFixed(2)}</div>
                    `;
                    itemsList.appendChild(el);
                    subtotal += itemTotal;
                }
            });
            
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

            // Validation for Max Discount
            const totalDiscountValue = (discount.fixed || 0) + (packagePrice * (discount.percent || 0) / 100);
            const discountInputField = document.getElementById('discountGiven');
            if (window.maxDiscountAllowed > 0 && totalDiscountValue > window.maxDiscountAllowed) {
                if (discountInputField) {
                    discountInputField.classList.add('border-red-500', 'bg-red-50');
                    discountInputField.classList.remove('border-gray-300', 'bg-white');
                }
                const warningMsg = document.createElement('div');
                warningMsg.className = 'text-xs text-red-600 font-bold mt-1';
                warningMsg.id = 'discountLimitWarning';
                warningMsg.textContent = `⚠️ Exceeds max allowed discount of RM ${window.maxDiscountAllowed.toFixed(2)}`;
                
                // Remove existing warning if any
                const existingWarning = document.getElementById('discountLimitWarning');
                if (existingWarning) existingWarning.remove();
                
                if (discountInputField) discountInputField.parentNode.appendChild(warningMsg);
            } else {
                if (discountInputField) {
                    discountInputField.classList.remove('border-red-500', 'bg-red-50');
                    discountInputField.classList.add('border-gray-300', 'bg-white');
                }
                const existingWarning = document.getElementById('discountLimitWarning');
                if (existingWarning) existingWarning.remove();
            }
            
            // Add Voucher Items
            selectedVouchers.forEach(voucher => {
                let voucherAmount = 0;
                if (voucher.discount_amount) {
                    voucherAmount = parseFloat(voucher.discount_amount);
                } else if (voucher.discount_percent) {
                    voucherAmount = packagePrice * (parseFloat(voucher.discount_percent) / 100);
                }
                
                if (voucherAmount > 0) {
                     const voucherItem = document.createElement('div');
                    voucherItem.className = 'flex justify-between items-center py-2 border-b border-gray-200';
                    voucherItem.innerHTML = `
                        <div class="flex-1">
                            <div class="font-medium text-green-600">${voucher.title || 'Voucher'} (${voucher.voucher_code})</div>
                        </div>
                        <div class="font-semibold text-green-600">-RM ${voucherAmount.toFixed(2)}</div>
                    `;
                    itemsList.appendChild(voucherItem);
                    subtotal -= voucherAmount;
                }
            });

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
        }

        function hideAllUI() {
            const packageIdForm = document.getElementById('packageIdForm');
            const quotationFormContainer = document.getElementById('quotationFormContainer');
            const errorMessage = document.getElementById('errorMessage');
            const warningMessage = document.getElementById('warningMessage');
            
            if (packageIdForm) packageIdForm.classList.add('hidden');
            if (quotationFormContainer) quotationFormContainer.classList.add('hidden');
            if (errorMessage) errorMessage.classList.add('hidden');
            if (warningMessage) warningMessage.classList.add('hidden');
        }

        function pageLog(msg, color = 'gray-400') {
            const log = document.getElementById('debugLog');
            if (log) {
                const span = document.createElement('div');
                span.textContent = `> ${msg}`;
                log.appendChild(span);
            }
            console.log(`[PageLog] ${msg}`);
        }

        // Initialize preview on page load
        document.addEventListener('DOMContentLoaded', async function() {
            console.log('DOM Content Loaded - Initializing Creation Page');
            
            const detectionStatus = document.getElementById('detectionStatus');
            const detectedPackageIdEl = document.getElementById('detectedPackageId');

            // 1. Initial State: Force hide everything immediately
            hideAllUI();
            pageLog('Initializing creation page...');

            // 2. Fetch User Profile (non-blocking for UI)
            fetchUserProfile();

            // 3. Parse URL parameters
            const urlParams = new URLSearchParams(window.location.search);
            const packageId = urlParams.get('linked_package') || urlParams.get('package_id');
            const panelQty = urlParams.get('panel_qty');
            const panelRating = urlParams.get('panel_rating');
            const editInvoiceId = urlParams.get('edit_invoice_id') || urlParams.get('id');
            
            if (packageId) {
                if (detectedPackageIdEl) detectedPackageIdEl.textContent = packageId;
                if (detectionStatus) detectionStatus.textContent = 'PACKAGE DETECTED';
                pageLog(`URL contains package ID: ${packageId}`);
            } else if (panelQty && panelRating) {
                if (detectionStatus) detectionStatus.textContent = 'PANEL SPECS DETECTED';
                pageLog(`URL contains specs: ${panelQty} panels @ ${panelRating}`);
            } else {
                if (detectionStatus) detectionStatus.textContent = 'NO PACKAGE PARAMS';
                pageLog('No package identification found in URL.');
            }

            // 4. Initialization Logic Branching
            try {
                // BRANCH A: Edit Mode
                if (editInvoiceId && (window.location.pathname.includes('edit-invoice') || urlParams.get('edit_invoice_id'))) {
                    pageLog(`Entering Edit Mode for: ${editInvoiceId}`);
                    window.isEditMode = true;
                    window.editInvoiceId = editInvoiceId;
                    
                    document.querySelector('h1').textContent = 'Edit Quotation';
                    const submitBtn = document.querySelector('button[type="submit"]');
                    if (submitBtn) submitBtn.textContent = 'Save New Version';
                    
                    showWarning('Loading your quotation...');
                    
                    const res = await fetch(`/api/v1/invoices/${editInvoiceId}`);
                    if (!res.ok) throw new Error('Failed to fetch invoice');
                    const json = await res.json();
                    
                    if (json.success && json.data) {
                        const inv = json.data;
                        const invPackageId = inv.linked_package || inv.legacy_pid_to_be_deleted || inv.package_id;
                        
                        if (invPackageId) {
                            pageLog(`Invoice linked to package: ${invPackageId}`);
                            await fetchPackageDetails(invPackageId);
                        } else {
                            showWarning(`⚠️ This invoice doesn't have a package.`);
                            document.getElementById('packageIdForm').classList.remove('hidden');
                        }
                        
                        // ... pre-fill logic
                        if (inv.customer_name_snapshot) document.getElementById('customerName').value = inv.customer_name_snapshot;
                        if (inv.customer_phone_snapshot) document.getElementById('customerPhone').value = inv.customer_phone_snapshot;
                        if (inv.customer_address_snapshot) document.getElementById('customerAddress').value = inv.customer_address_snapshot;
                        
                        let discountVal = '';
                        if (inv.discount_fixed > 0) discountVal += inv.discount_fixed;
                        if (inv.discount_percent > 0) discountVal += (discountVal ? ' ' : '') + `${inv.discount_percent}%`;
                        document.getElementById('discountGiven').value = discountVal;
                        
                        if (inv.sst_amount > 0) document.getElementById('applySST').checked = true;
                        window.currentAgentMarkup = inv.agent_markup || 0;

                        if (inv.items) {
                            inv.items.forEach(item => {
                                const type = (item.item_type || '').toLowerCase();
                                if (type === 'extra' || (!type && !item.is_a_package)) {
                                    addManualItem({
                                        description: item.description,
                                        qty: parseFloat(item.qty) || 1,
                                        unit_price: parseFloat(item.unit_price) || 0
                                    });
                                }
                            });
                        }
                        
                        await fetchVouchers();
                        if (inv.voucher_code) {
                            const codes = inv.voucher_code.split(',').map(s => s.trim());
                            codes.forEach(code => {
                                const v = availableVouchers.find(av => av.voucher_code === code);
                                if (v && !selectedVouchers.find(sv => sv.voucher_code === v.voucher_code)) {
                                    selectedVouchers.push(v);
                                }
                            });
                            renderSelectedVouchers();
                        }
                        // Clear loading warning if everything is okay
                        document.getElementById('warningMessage').classList.add('hidden');
                    } else {
                        throw new Error(json.error || 'Failed to load invoice data');
                    }
                } 
                // BRANCH B: Direct Creation with Package ID
                else if (packageId) {
                    pageLog('Attempting to fetch package details...');
                    showWarning('Loading package details...');
                    await fetchPackageDetails(packageId);
                    pageLog('Package details loaded successfully.');
                    addPaymentMethodRow();
                    await fetchVouchers();
                    // Clear loading warning
                    document.getElementById('warningMessage').classList.add('hidden');
                } 
                // BRANCH C: Panel/Rating Lookup
                else if (panelQty && panelRating) {
                    pageLog(`Attempting lookup for ${panelQty} panels @ ${panelRating}...`);
                    showWarning('🔍 Searching for the best solar package for you...');
                    
                    const ratingInt = parseInt(panelRating.replace(/\D/g, ''));
                    const lookupRes = await fetch(`/readonly/package/lookup?panelQty=${panelQty}&panelType=${ratingInt}`);
                    const lookupData = await lookupRes.json();
                    
                    if (lookupData.packages && lookupData.packages.length > 0) {
                        const pkg = lookupData.packages[0];
                        pageLog(`Lookup found: ${pkg.package_name} (${pkg.bubble_id})`);
                        await showPackage(pkg);
                        document.getElementById('warningMessage').classList.add('hidden');
                    } else {
                        throw new Error(`No package found matching ${panelQty} panels @ ${panelRating}`);
                    }
                    addPaymentMethodRow();
                    await fetchVouchers();
                } 
                // BRANCH D: Browse Mode
                else {
                    pageLog('No parameters found, prompting user to browse.');
                    document.getElementById('packageIdForm').classList.remove('hidden');
                    addPaymentMethodRow();
                    await fetchVouchers();
                }
            } catch (err) {
                pageLog(`FATAL ERROR: ${err.message}`, 'red-400');
                showError(`Failed to initialize: ${err.message}`);
                // If it failed but wasn't browse mode, show browse as fallback
                if (!packageId && !(panelQty && panelRating)) {
                    document.getElementById('packageIdForm').classList.remove('hidden');
                }
            }

            // Always pre-fill common fields from URL
            if (urlParams.get('customer_name')) document.getElementById('customerName').value = urlParams.get('customer_name');
            if (urlParams.get('customer_phone')) document.getElementById('customerPhone').value = urlParams.get('customer_phone');
            if (urlParams.get('customer_address')) document.getElementById('customerAddress').value = urlParams.get('customer_address');
            if (urlParams.get('discount_given')) document.getElementById('discountGiven').value = urlParams.get('discount_given');
            if (urlParams.get('apply_sst') === 'true') document.getElementById('applySST').checked = true;

            // Setup listeners
            const addManualItemBtn = document.getElementById('addManualItemBtn');
            if (addManualItemBtn) addManualItemBtn.addEventListener('click', () => addManualItem());

            const voucherSelect = document.getElementById('voucherSelectDropdown');
            if (voucherSelect) voucherSelect.addEventListener('change', () => updateVoucherInfo());
            
            const addVoucherBtn = document.getElementById('addVoucherBtn');
            if (addVoucherBtn) addVoucherBtn.addEventListener('click', addVoucher);

            const sstToggle = document.getElementById('applySST');
            if (sstToggle) sstToggle.addEventListener('change', updateInvoicePreview);
            
            const discountInput = document.getElementById('discountGiven');
            if (discountInput) {
                discountInput.addEventListener('input', updateInvoicePreview);
                discountInput.addEventListener('change', updateInvoicePreview);
            }
            
            const addBtn = document.getElementById('addPaymentMethodBtn');
            if (addBtn) addBtn.addEventListener('click', addPaymentMethodRow);

            updateInvoicePreview();
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

                // Check response status before parsing JSON
                if (!response.ok) {
                    if (response.status === 404) {
                        showError(`⚠️ Package Not Found: The Package ID '${packageId}' does not exist in database.`);
                    } else if (response.status === 400) {
                        showError(`⚠️ Invalid Package ID: '${packageId}' is not a valid ID format.`);
                    } else {
                        showError(`⚠️ Server Error: Failed to fetch package. Status: ${response.status}`);
                    }
                    document.getElementById('packageIdForm').classList.remove('hidden');
                    return;
                }

                const result = await response.json();

                if (result.success && result.package) {
                    showPackage(result.package);
                } else {
                    showError(`⚠️ Package Not Found: The Package ID '${packageId}' does not exist in database.`);
                    document.getElementById('packageIdForm').classList.remove('hidden');
                }
            } catch (err) {
                console.error('Error fetching package:', err);
                showError(`⚠️ Database Error: Failed to check package. Error: ${err.message}`);
                document.getElementById('packageIdForm').classList.remove('hidden');
            }
        }

        function showPackage(pkg) {
            console.log('showPackage called with:', pkg);
            
            // Safety check for null/undefined pkg
            if (!pkg || typeof pkg !== 'object') {
                showError('⚠️ Package data is missing or invalid. Please try again.');
                document.getElementById('packageIdForm').classList.remove('hidden');
                document.getElementById('quotationFormContainer').classList.add('hidden');
                return;
            }

            if (!pkg.bubble_id) {
                console.error('Package object missing bubble_id:', pkg);
                showError('⚠️ Invalid Package Data: Package ID is missing. Please select a valid package.');
                document.getElementById('packageIdForm').classList.remove('hidden');
                document.getElementById('quotationFormContainer').classList.add('hidden');
                return;
            }

            const packageInfo = document.getElementById('quotationFormContainer');
            packageInfo.classList.remove('hidden');

            document.getElementById('packageNameDisplay').textContent = pkg.name || pkg.invoice_desc || `Package ${pkg.bubble_id}`;
            document.getElementById('packagePriceDisplay').textContent = `RM ${(parseFloat(pkg.price) || 0).toFixed(2)}`;
            
            document.getElementById('packagePrice').value = pkg.price || 0;
            document.getElementById('packageName').value = pkg.name || pkg.invoice_desc || `Package ${pkg.bubble_id}`;
            document.getElementById('packageIdHidden').value = pkg.bubble_id;
            
            // Handle Max Discount
            window.maxDiscountAllowed = parseFloat(pkg.max_discount) || 0;
            const maxDiscountRow = document.getElementById('maxDiscountRow');
            const maxDiscountDisplay = document.getElementById('maxDiscountDisplay');
            
            // New persistent display under input
            const inputMaxDiscountRow = document.getElementById('inputMaxDiscountRow');
            const inputMaxDiscountDisplay = document.getElementById('inputMaxDiscountDisplay');

            if (window.maxDiscountAllowed > 0) {
                if (maxDiscountRow) maxDiscountRow.classList.remove('hidden');
                if (maxDiscountDisplay) maxDiscountDisplay.textContent = `RM ${window.maxDiscountAllowed.toFixed(2)}`;
                
                if (inputMaxDiscountRow) inputMaxDiscountRow.classList.remove('hidden');
                if (inputMaxDiscountDisplay) inputMaxDiscountDisplay.textContent = `RM ${window.maxDiscountAllowed.toFixed(2)}`;
            } else {
                if (maxDiscountRow) maxDiscountRow.classList.add('hidden');
                if (inputMaxDiscountRow) inputMaxDiscountRow.classList.add('hidden');
            }
            
            if (pkg.invoice_desc) {
                const descContainer = document.getElementById('packageDescContainer');
                descContainer.classList.remove('hidden');
                document.getElementById('packageDescDisplay').textContent = pkg.invoice_desc;
            }
            
            // Set form values from URL
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('customer_name')) {
                document.getElementById('customerName').value = urlParams.get('customer_name');
            }
            if (urlParams.get('customer_phone')) {
                document.getElementById('customerPhone').value = urlParams.get('customer_phone');
            }
            if (urlParams.get('customer_address')) {
                document.getElementById('customerAddress').value = urlParams.get('customer_address');
            }
            if (urlParams.get('discount_given')) {
                document.getElementById('discountGiven').value = urlParams.get('discount_given');
            }
            if (urlParams.get('apply_sst') === 'true') {
                document.getElementById('applySST').checked = true;
            }
            if (urlParams.get('template_id')) {
                document.getElementById('templateIdHidden').value = urlParams.get('template_id');
            }
            
            updateInvoicePreview();
        }

        function showError(message) {
            const errorDiv = document.getElementById('errorMessage');
            errorDiv.classList.remove('hidden');
            document.getElementById('errorText').textContent = message;
        }

        function showWarning(message) {
            const warningDiv = document.getElementById('warningMessage');
            warningDiv.classList.remove('hidden');
            document.getElementById('warningText').textContent = message;
        }

        // Handle form submission
        document.getElementById('quotationForm')?.addEventListener('submit', async function(e) {
            e.preventDefault();
            const formData = new FormData(this);
            const data = Object.fromEntries(formData);
            
            console.log('Form Submit Debug:', data);
            console.log('Linked Package Value:', data.linked_package);
            console.log('Hidden Input Value:', document.getElementById('packageIdHidden').value);

            // Show loading state
            const submitBtn = this.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating...';
            
            // Calculate EPP fees
            const eppData = calculateAllEPPFees();
            
            // Prepare extra items (Manual Items)
            const extraItems = manualItems.map(item => ({
                description: item.description,
                qty: item.qty,
                unit_price: item.unit_price,
                total_price: item.qty * item.unit_price
            }));

            // Prepare request data
            const requestData = {
                linked_package: data.linked_package,
                template_id: data.template_id || null,
                customer_name: data.customer_name || null,
                customer_phone: data.customer_phone || null,
                customer_address: data.customer_address || null,
                profilePicture: document.getElementById('profilePicture').value || null,
                discount_given: data.discount_given || null,
                voucher_codes: selectedVouchers.map(v => v.voucher_code),
                apply_sst: document.getElementById('applySST')?.checked || false,
                payment_structure: eppData.payment_structure,
                extra_items: extraItems,
                followUpDays: data.follow_up_days || null
            };

            
            // Add EPP fee data if exists
            if (eppData.total_fee > 0 && eppData.description) {
                requestData.epp_fee_amount = eppData.total_fee;
                requestData.epp_fee_description = eppData.description;
            }

            // Handle Edit Mode vs Create Mode
            let endpoint = '/api/v1/invoices/on-the-fly';
            if (window.isEditMode && window.editInvoiceId) {
                endpoint = `/api/v1/invoices/${window.editInvoiceId}/version`;
                // Preserve markup
                requestData.agent_markup = window.currentAgentMarkup || 0;
            }
            
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
                    window.location.href = result.invoice_link;
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

        async function checkWhatsApp() {
            let phone = document.getElementById('customerPhone').value.replace(/\D/g, '');
            if (phone.startsWith('0')) {
                phone = '60' + phone.substring(1);
            }
            if (!phone || phone.length < 10) {
                Swal.fire({ icon: 'warning', title: 'Invalid Phone', text: 'Please enter a valid phone number with country code (e.g. 60123456789)' });
                return;
            }

            const btn = event.currentTarget;
            const originalColor = btn.style.color;
            btn.classList.add('animate-pulse');
            btn.style.color = '#16a34a';

            try {
                const res = await fetch('https://whatsapp-api-server-production-c15f.up.railway.app/api/check-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone })
                });
                const data = await res.json();

                if (data.success && data.isWhatsAppUser) {
                    Swal.fire({
                        title: 'WhatsApp User Detected!',
                        html: `
                            <div class="flex flex-col items-center gap-4 py-2">
                                ${data.profilePicture ? `<img src="${data.profilePicture}" class="w-24 h-24 rounded-full border-4 border-green-500 shadow-lg">` : ''}
                                <div class="text-center">
                                    <div class="font-bold text-lg text-slate-900">Verified WhatsApp Number</div>
                                    <div class="text-green-600 font-semibold flex items-center justify-center gap-1">
                                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                                        Verified
                                    </div>
                                </div>
                                <div class="flex flex-col gap-2 w-full px-4">
                                    ${data.profilePicture ? `
                                    <button onclick="fillWhatsAppInfo('${data.profilePicture}', '${phone}')" class="mt-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-green-700 transition-all">
                                        Use Profile Picture
                                    </button>` : '<div class="text-sm text-slate-500 italic">No profile picture available</div>'}
                                </div>
                            </div>
                        `,
                        showConfirmButton: false,
                        showCloseButton: true
                    });
                } else {
                    Swal.fire({ icon: 'info', title: 'Not Found', text: 'This number is not registered on WhatsApp.' });
                }
            } catch (err) {
                console.error(err);
                Swal.fire({ icon: 'error', title: 'API Error', text: 'Failed to connect to WhatsApp API server.' });
            } finally {
                btn.classList.remove('animate-pulse');
                btn.style.color = originalColor;
            }
        }

        async function fillWhatsAppInfo(photoUrl, phone) {
            if (photoUrl) {
                // Trigger backend download
                Swal.fire({
                    title: 'Syncing Profile Picture...',
                    didOpen: () => { Swal.showLoading(); }
                });

                try {
                    const res = await fetch('/api/customers/whatsapp-photo', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ photoUrl, phone })
                    });
                    const data = await res.json();
                    
                    if (data.success && data.localUrl) {
                        document.getElementById('profilePicture').value = data.localUrl;
                        document.getElementById('profilePreview').innerHTML = `<img src="${data.localUrl}" class="h-full w-full object-cover">`;
                    }
                } catch (err) {
                    console.error('Failed to sync WhatsApp photo:', err);
                }
            }
            Swal.close();
        }
