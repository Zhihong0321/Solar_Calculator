"""
API endpoint for creating invoices on the fly.
Register this router in your main FastAPI app.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import Optional
from decimal import Decimal

from app.database import get_db  # Adjust import path as needed
from app.schemas.invoice_schema import (
    InvoiceOnTheFlyRequest, 
    InvoiceOnTheFlyResponse
)
from app.repositories.invoice_repo import InvoiceRepository

router = APIRouter(prefix="/api/v1/invoices", tags=["Invoices"])


@router.post("/on-the-fly", response_model=InvoiceOnTheFlyResponse)
async def create_invoice_on_the_fly(
    request_data: InvoiceOnTheFlyRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Create a new invoice on the fly for microservices or quick creation.
    Returns the shareable URL and invoice details.
    No authentication required - works with calculator app's existing auth.
    """
    invoice_repo = InvoiceRepository(db)
    
    # Parse discount_given string into discount_fixed and discount_percent
    discount_fixed = Decimal(0)
    discount_percent = Decimal(0)
    
    if request_data.discount_given:
        discount_str = request_data.discount_given.strip()
        parts = discount_str.replace('+', ' ').split()
        
        for part in parts:
            part = part.strip()
            if '%' in part:
                discount_percent = Decimal(part.replace('%', ''))
            else:
                try:
                    discount_fixed = Decimal(
                        part.replace('RM', '').replace(',', '')
                    )
                except:
                    pass
    
    # Use parsed values if discount_given was provided, otherwise use explicit values
    if request_data.discount_given:
        final_discount_fixed = discount_fixed
        final_discount_percent = discount_percent
    else:
        final_discount_fixed = request_data.discount_fixed or Decimal(0)
        final_discount_percent = request_data.discount_percent or Decimal(0)
    
    try:
        invoice = invoice_repo.create_on_the_fly(
            package_id=request_data.package_id,
            discount_fixed=final_discount_fixed,
            discount_percent=final_discount_percent,
            apply_sst=request_data.apply_sst,
            template_id=request_data.template_id,
            voucher_code=request_data.voucher_code,
            agent_markup=request_data.agent_markup,
            customer_name=request_data.customer_name,
            customer_phone=request_data.customer_phone,
            customer_address=request_data.customer_address,
            epp_fee_amount=request_data.epp_fee_amount,
            epp_fee_description=request_data.epp_fee_description,
            created_by=None  # Set to current user ID if you have auth
        )
        
        # Build base URL for share link
        base_url = str(request.base_url).rstrip("/")
        # If you want to use a specific domain instead:
        # base_url = "https://calculator.atap.solar"
        
        share_url = f"{base_url}/view/{invoice.share_token}"
        
        response = InvoiceOnTheFlyResponse(
            success=True,
            invoice_link=share_url,
            invoice_number=invoice.invoice_number,
            bubble_id=invoice.bubble_id,
            total_amount=float(invoice.total_amount),
        )
        
        return response
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to create invoice: {str(e)}"
        )

