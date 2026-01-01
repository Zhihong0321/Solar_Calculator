from typing import Dict, Any, Optional


def _generate_pdf_download_button(share_token: Optional[str] = None, invoice_id: Optional[str] = None) -> str:
    """
    Generate PDF download button HTML.
    
    Args:
        share_token: Share token for public invoice view
        invoice_id: Invoice bubble_id for authenticated view
    
    Returns:
        HTML string for download button or empty string if neither token nor ID provided
    """
    if share_token:
        pdf_url = f"/view/{share_token}/pdf"
    elif invoice_id:
        pdf_url = f"/api/v1/invoices/{invoice_id}/pdf"
    else:
        return ""
    
    return f'''
            <div class="mt-6">
                <a href="{pdf_url}" class="pdf-download-btn" download>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Download PDF
                </a>
            </div>
        '''


def generate_invoice_html(
    invoice: Dict[str, Any], 
    template: Dict[str, Any],
    share_token: str = None,
    invoice_id: str = None
) -> str:
    """
    Generates a professional, minimalist, mobile-optimized HTML invoice.
    
    Args:
        invoice: Invoice data dictionary
        template: Template data dictionary
        share_token: Share token for public invoice view (for PDF download link)
        invoice_id: Invoice bubble_id for authenticated view (for PDF download link)
    """
    
    # Format currency
    def fmt_money(amount):
        if amount is None: return "0.00"
        return "{:,.2f}".format(float(amount))

    items_html = ""
    for item in invoice.get("items", []):
        # Check if item has negative price (discount/voucher)
        is_discount = item.get('total_price', 0) < 0
        amount_color = "text-red-600" if is_discount else "text-gray-900"
        amount_prefix = "-" if is_discount else ""
        abs_amount = abs(item.get('total_price', 0))
        abs_unit_price = abs(item.get('unit_price', 0))

        items_html += f"""
        <div class="invoice-item py-5 px-1 border-b premium-border last:border-b-0">
            <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                <div class="flex-1">
                    <p class="font-semibold text-gray-900 text-[16px] leading-relaxed mb-2">{item.get('description')}</p>
                    <p class="text-xs text-gray-500 font-medium">
                        {item.get('qty')} × RM {fmt_money(abs_unit_price)}
                    </p>
                </div>
                <div class="text-right sm:text-right">
                    <p class="font-semibold {amount_color} text-[16px] whitespace-nowrap">
                        {amount_prefix}RM {fmt_money(abs_amount)}
                    </p>
                </div>
            </div>
        </div>
        """

    logo_html = ""
    if template.get("logo_url"):
        logo_html = f'<img src="{template["logo_url"]}" alt="Logo" class="h-14 sm:h-16 mb-6 object-contain">'

    def process_notes(text):
        if not text: return ""
        lines = text.split('\n')
        html = ""
        for line in lines:
            line = line.strip()
            if not line: continue
            # USE 10PX FOR SMALLEST HUMAN READABLE TEXT
            if len(line) < 40 and (line.isupper() or line.endswith(':')):
                html += f'<h4 style="font-size: 10px !important; font-weight: 700; color: #9ca3af; text-transform: uppercase; margin-top: 3px; margin-bottom: 0;">{line}</h4>'
            else:
                html += f'<p style="font-size: 10px !important; color: #9ca3af; line-height: 1.1; margin-bottom: 1px;">{line}</p>'
        return html

    tnc_section = ""
    if template.get("terms_and_conditions"):
        tnc_section = f"""
        <div class="tnc-container mt-10 pt-8 border-t premium-border">
            <h3 style="font-size: 10px !important; font-weight: 700; color: #6b7280 !important; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 6px;">Terms & Conditions</h3>
            <div class="tnc-content">{template["terms_and_conditions"]}</div>
        </div>
        """

    disclaimer_section = ""
    if template.get("disclaimer"):
        disclaimer_section = f"""
        <div class="tnc-container mt-6 pt-6 border-t premium-border">
            <h3 style="font-size: 10px !important; font-weight: 700; color: #6b7280 !important; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 6px;">Notice</h3>
            <div class="tnc-content">{template["disclaimer"]}</div>
        </div>
        """

    # Format company address
    company_address = template.get('company_address', '')
    if company_address:
        address_lines = [line.strip() for line in company_address.split('\n') if line.strip()]
        formatted_address = '<br>'.join(address_lines)
    else:
        formatted_address = ''

    return f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
        <meta http-equiv="Pragma" content="no-cache">
        <meta http-equiv="Expires" content="0">
        <title>Invoice {invoice.get('invoice_number')}</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            * {{ margin: 0; padding: 0; box-sizing: border-box; }}
            body {{ 
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
                color: #111827; 
                -webkit-tap-highlight-color: transparent;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
                background-color: #fafafa;
                letter-spacing: -0.01em;
            }}
            .invoice-container {{
                max-width: 100%;
                margin: 0 auto;
                padding: 24px 20px;
                background-color: #ffffff;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
            }}
            @media (min-width: 640px) {{
                .invoice-container {{
                    padding: 40px 32px;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
                }}
            }}
            @media (min-width: 768px) {{
                .invoice-container {{
                    max-width: 720px;
                    padding: 56px 48px;
                    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
                }}
            }}
            /* Section Headers */
            .section-label {{
                font-size: 11px;
                font-weight: 600;
                color: #6b7280;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                margin-bottom: 12px;
            }}
            /* Premium Item Cards */
            .invoice-item {{
                transition: background-color 0.15s ease;
            }}
            .invoice-item:hover {{
                background-color: #f9fafb;
            }}
            /* TNC TEXT: SMALLEST HUMAN READABLE ON MOBILE (10PX) */
            .tnc-container, .tnc-container *, .tnc-container p, .tnc-container div, .tnc-container h1, .tnc-container h2, .tnc-container h3, .tnc-container h4, .tnc-container span {{ 
                font-size: 10px !important; 
                line-height: 1.5 !important;
                color: #6b7280 !important;
            }}
            /* Premium PDF Download Button */
            .pdf-download-btn {{
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 14px 28px;
                background: linear-gradient(135deg, #111827 0%, #1f2937 100%);
                color: #ffffff;
                font-size: 15px;
                font-weight: 600;
                text-decoration: none;
                border-radius: 8px;
                transition: all 0.2s ease;
                margin-top: 24px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                letter-spacing: -0.01em;
            }}
            .pdf-download-btn:hover {{
                background: linear-gradient(135deg, #1f2937 0%, #374151 100%);
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
                transform: translateY(-1px);
            }}
            .pdf-download-btn:active {{
                transform: translateY(0);
                box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
            }}
            /* Premium Borders */
            .premium-border {{
                border-color: #e5e7eb;
            }}
            .premium-divider {{
                border-color: #d1d5db;
            }}
            @media print {{
                body {{ 
                    background: white;
                    padding: 0;
                }}
                .invoice-container {{
                    max-width: 100% !important;
                    padding: 0 !important;
                    box-shadow: none !important;
                }}
                .pdf-download-btn {{
                    display: none !important;
                }}
            }}
        </style>
    </head>
    <body>
        <div class="invoice-container">
            
            <!-- Header Section -->
            <header class="mb-10 pb-8 border-b premium-divider">
                <div class="flex flex-col gap-8">
                    <!-- Company Info -->
                    <div>
                        {logo_html}
                        <h1 class="text-3xl sm:text-4xl font-bold text-gray-900 mb-4 leading-tight tracking-tight">
                            {template.get('company_name', 'Company Name')}
                        </h1>
                        <div class="text-sm sm:text-base text-gray-600 leading-relaxed space-y-1.5">
                            {f'<div class="font-normal">{formatted_address}</div>' if formatted_address else ''}
                            {f'<div class="mt-3 space-y-1.5">' if (template.get('company_phone') or template.get('company_email')) else ''}
                            {f'<div class="font-medium">T: <span class="font-normal">{template.get("company_phone")}</span></div>' if template.get('company_phone') else ''}
                            {f'<div class="font-medium">E: <span class="font-normal">{template.get("company_email")}</span></div>' if template.get('company_email') else ''}
                            {f'</div>' if (template.get('company_phone') or template.get('company_email')) else ''}
                            {f'<div class="mt-3 font-semibold text-gray-900">SST ID: <span class="font-normal">{template.get("sst_registration_no")}</span></div>' if template.get('sst_registration_no') else ''}
                        </div>
                    </div>
                    
                    <!-- Invoice Meta -->
                    <div class="flex flex-row justify-between items-start pt-6 border-t premium-border sm:border-t-0 sm:pt-0 sm:flex-col sm:items-end sm:gap-5">
                        <div class="flex-1 sm:flex-none">
                            <p class="section-label mb-2">Invoice Number</p>
                            <p class="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">#{invoice.get('invoice_number')}</p>
                        </div>
                        <div class="text-right sm:text-right">
                            <p class="section-label mb-2">Date</p>
                            <p class="text-lg sm:text-xl font-semibold text-gray-900">{invoice.get('invoice_date')}</p>
                        </div>
                    </div>
                </div>
            </header>

            <!-- Bill To Section -->
            <section class="mb-10">
                <p class="section-label">Bill To</p>
                <p class="text-xl sm:text-2xl font-bold text-gray-900 mb-3 leading-tight">
                    {invoice.get('customer_name_snapshot')}
                </p>
                {f'<p class="text-sm sm:text-base text-gray-600 leading-relaxed font-normal">{invoice.get("customer_address_snapshot")}</p>' if invoice.get('customer_address_snapshot') else '<p class="text-sm text-gray-400 italic font-normal">No address provided</p>'}
            </section>

            <!-- Items Section -->
            <section class="mb-10">
                <div class="mb-6 pb-3 border-b premium-divider">
                    <p class="section-label">Items</p>
                </div>
                <div class="space-y-0">
                    {items_html}
                </div>
            </section>

            <!-- Summary Section -->
            <section class="mb-10">
                <div class="flex flex-col sm:flex-row sm:justify-between gap-8">
                    <!-- Totals -->
                    <div class="flex-1 space-y-4 sm:max-w-xs">
                        <div class="flex justify-between items-center text-base text-gray-700">
                            <span class="font-medium">Subtotal</span>
                            <span class="font-semibold text-gray-900">RM {fmt_money(invoice.get('subtotal'))}</span>
                        </div>
                        {f'''
                        <div class="flex justify-between items-center text-base text-gray-700">
                            <span class="font-medium">SST ({fmt_money(invoice.get('sst_rate'))}%)</span>
                            <span class="font-semibold text-gray-900">RM {fmt_money(invoice.get('sst_amount'))}</span>
                        </div>
                        ''' if float(invoice.get('sst_amount', 0)) > 0 else ''}
                        <div class="flex justify-between items-center pt-5 mt-5 border-t-2 border-gray-900">
                            <span class="text-lg font-bold text-gray-900">Total</span>
                            <span class="text-2xl sm:text-3xl font-bold text-gray-900">RM {fmt_money(invoice.get('total_amount'))}</span>
                        </div>
                    </div>

                    <!-- Payment Info -->
                    <div class="flex-1 pt-8 border-t premium-divider sm:border-t-0 sm:pt-0 sm:pl-8 sm:border-l premium-divider">
                        <p class="section-label mb-5">Payment Information</p>
                        <div class="space-y-4 text-base">
                            <div>
                                <span class="text-gray-500 font-medium block mb-1.5">Bank</span>
                                <span class="text-gray-900 font-semibold text-lg">{template.get('bank_name', '-')}</span>
                            </div>
                            <div>
                                <span class="text-gray-500 font-medium block mb-1.5">Account Number</span>
                                <span class="text-gray-900 font-semibold text-lg">{template.get('bank_account_no', '-')}</span>
                            </div>
                            <div>
                                <span class="text-gray-500 font-medium block mb-1.5">Account Holder</span>
                                <span class="text-gray-900 font-semibold text-lg">{template.get('bank_account_name', '-')}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Footer Sections -->
            {tnc_section}
            {disclaimer_section}

            <!-- Document Footer -->
            <footer class="mt-14 pt-8 border-t premium-divider text-center">
                <p class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-6">Official Digital Document</p>
                {_generate_pdf_download_button(share_token, invoice_id)}
            </footer>
        </div>
    </body>
    </html>
    """
