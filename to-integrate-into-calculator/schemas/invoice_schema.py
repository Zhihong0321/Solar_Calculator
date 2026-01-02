"""
Pydantic schemas for invoice creation API.
"""
from pydantic import BaseModel, Field
from typing import Optional
from decimal import Decimal


class InvoiceOnTheFlyRequest(BaseModel):
    """Schema for creating invoice on the fly"""
    package_id: str
    discount_fixed: Optional[Decimal] = Field(Decimal(0), ge=0)
    discount_percent: Optional[Decimal] = Field(Decimal(0), ge=0, le=100)
    discount_given: Optional[str] = None  # String format: "500 10%" or "500" or "10%"
    apply_sst: bool = False
    template_id: Optional[str] = None
    voucher_code: Optional[str] = None
    agent_markup: Optional[Decimal] = Field(Decimal(0), ge=0)
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    epp_fee_amount: Optional[Decimal] = Field(None, ge=0)  # Total EPP fee amount
    epp_fee_description: Optional[str] = None  # Combined description: "Maybank EPP 60 Months - RM15000, ..."


class InvoiceOnTheFlyResponse(BaseModel):
    """Response schema for invoice creation"""
    success: bool
    invoice_link: str
    invoice_number: str
    bubble_id: str
    total_amount: float
    agent_markup: Optional[float] = None
    subtotal_with_markup: Optional[float] = None

