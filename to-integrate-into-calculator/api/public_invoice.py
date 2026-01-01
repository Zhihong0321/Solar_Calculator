"""
Public invoice view route handler.
This allows viewing invoices via share token without authentication.
Register this router in your main FastAPI app.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import HTMLResponse, Response
from sqlalchemy.orm import Session
from typing import Optional, Union

from app.database import get_db  # Adjust import path as needed
from app.schemas.invoice_schema import InvoiceOnTheFlyResponse
from app.repositories.invoice_repo import InvoiceRepository
from app.utils.html_generator import generate_invoice_html
from app.utils.pdf_generator import generate_invoice_pdf, sanitize_filename

router = APIRouter(tags=["Public Invoice Share"])


@router.get("/view/{share_token}", response_class=Union[HTMLResponse, InvoiceOnTheFlyResponse])
def view_shared_invoice(
    share_token: str,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Public view of invoice via share link (returns HTML for browsers, JSON for others).
    No authentication required.
    """
    invoice_repo = InvoiceRepository(db)
    invoice = invoice_repo.get_by_share_token(share_token)
    
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invoice not found or link expired"
        )
    
    # Record view
    invoice_repo.record_view(invoice.bubble_id)
    
    # Check accept header for HTML
    accept = request.headers.get("accept", "")
    if "text/html" in accept:
        # Fetch template data
        template_data = {}
        if invoice.template_id:
            template = invoice_repo.get_template(invoice.template_id)
            if template:
                template_data = template
        
        # Fallback to default template if none found
        if not template_data:
            template_data = invoice_repo.get_default_template_data() or {}
        
        # Convert invoice to dict for html_generator
        invoice_dict = invoice.to_dict()
        # Add items to invoice_dict
        invoice_dict["items"] = [
            {
                "description": item.description,
                "qty": float(item.qty),
                "unit_price": float(item.unit_price),
                "total_price": float(item.total_price)
            } for item in invoice.items
        ]
        
        html_content = generate_invoice_html(invoice_dict, template_data, share_token=share_token)
        return HTMLResponse(
            content=html_content,
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )
    
    # Return JSON for API clients
    return InvoiceOnTheFlyResponse(
        success=True,
        invoice_link=f"{str(request.base_url).rstrip('/')}/view/{share_token}",
        invoice_number=invoice.invoice_number,
        bubble_id=invoice.bubble_id,
        total_amount=float(invoice.total_amount),
    )


@router.get("/view/{share_token}/pdf")
def download_invoice_pdf(
    share_token: str,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Download invoice as PDF via share token.
    No authentication required.
    
    Returns PDF file with filename: {company_name}_{invoice_number}.pdf
    """
    invoice_repo = InvoiceRepository(db)
    invoice = invoice_repo.get_by_share_token(share_token)
    
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invoice not found or link expired"
        )
    
    # Fetch template data
    template_data = {}
    if invoice.template_id:
        template = invoice_repo.get_template(invoice.template_id)
        if template:
            template_data = template
    
    # Fallback to default template if none found
    if not template_data:
        template_data = invoice_repo.get_default_template_data() or {}
    
    # Convert invoice to dict for html_generator
    invoice_dict = invoice.to_dict()
    # Add items to invoice_dict
    invoice_dict["items"] = [
        {
            "description": item.description,
            "qty": float(item.qty),
            "unit_price": float(item.unit_price),
            "total_price": float(item.total_price)
        } for item in invoice.items
    ]
    
    # Generate HTML (without PDF download button for cleaner PDF)
    html_content = generate_invoice_html(invoice_dict, template_data, share_token=None, invoice_id=None)
    
    # Generate PDF
    try:
        # Get base URL for resolving relative URLs (fonts, images)
        base_url = str(request.base_url).rstrip("/")
        pdf_bytes = generate_invoice_pdf(html_content, page_size='A4', base_url=base_url)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate PDF: {str(e)}"
        )
    
    # Generate filename
    company_name = template_data.get('company_name', 'Invoice')
    invoice_number = invoice.invoice_number
    filename = sanitize_filename(company_name, invoice_number)
    
    # Return PDF as response
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )

