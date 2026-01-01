from typing import Dict, Any
from weasyprint import HTML, CSS
import re


def sanitize_filename(company_name: str, invoice_number: str) -> str:
    """
    Sanitize company name and invoice number for use in filename.
    
    Args:
        company_name: Company name from template
        invoice_number: Invoice number (e.g., "INV-00123")
    
    Returns:
        Sanitized filename: "{company_name}_{invoice_number}.pdf"
    
    Example:
        "ABC Company Sdn Bhd" + "INV-00123" -> "ABC_Company_Sdn_Bhd_INV-00123.pdf"
    """
    # Replace spaces with underscores
    sanitized_company = re.sub(r'\s+', '_', company_name.strip())
    
    # Remove invalid filename characters (keep alphanumeric, underscore, hyphen)
    sanitized_company = re.sub(r'[^\w\-]', '', sanitized_company)
    
    # Remove multiple consecutive underscores
    sanitized_company = re.sub(r'_+', '_', sanitized_company)
    
    # Remove leading/trailing underscores
    sanitized_company = sanitized_company.strip('_')
    
    # Sanitize invoice number similarly
    sanitized_invoice = re.sub(r'[^\w\-]', '', invoice_number.strip())
    
    # If company name is empty after sanitization, use fallback
    if not sanitized_company:
        sanitized_company = "Invoice"
    
    # Combine and return
    filename = f"{sanitized_company}_{sanitized_invoice}.pdf"
    
    return filename


def generate_invoice_pdf(
    html_content: str,
    page_size: str = 'A4',
    base_url: str = None
) -> bytes:
    """
    Generate PDF from HTML content using WeasyPrint.
    
    Args:
        html_content: HTML string to convert to PDF
        page_size: Page size (default: 'A4')
        base_url: Base URL for resolving relative URLs (fonts, images)
    
    Returns:
        PDF bytes
    
    Configuration:
        - A4 page size (210mm x 297mm)
        - 15mm margins on all sides
        - Graceful page breaks (avoid breaking inside invoice items)
    """
    # CSS for PDF generation with A4 page size and page break rules
    pdf_css = CSS(string=f'''
        @page {{
            size: {page_size};
            margin: 15mm;
        }}
        
        /* Prevent page breaks inside invoice items */
        .invoice-item {{
            page-break-inside: avoid;
        }}
        
        /* Prevent page breaks inside summary sections */
        section {{
            page-break-inside: avoid;
        }}
        
        /* Allow page breaks between sections */
        .invoice-container > section {{
            page-break-inside: auto;
        }}
        
        /* Ensure header doesn't break awkwardly */
        header {{
            page-break-inside: avoid;
        }}
        
        /* Footer should appear on last page */
        footer {{
            page-break-inside: avoid;
        }}
        
        /* Hide download button in PDF */
        .pdf-download-btn {{
            display: none !important;
        }}
        
        /* Ensure proper font rendering */
        body {{
            font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }}
    ''')
    
    # Create HTML object
    html_obj = HTML(string=html_content, base_url=base_url)
    
    # Generate PDF
    pdf_bytes = html_obj.write_pdf(stylesheets=[pdf_css])
    
    return pdf_bytes


