"""
Invoice repository with create_on_the_fly method.
This is the core logic for creating invoices from packages.
"""
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import secrets
import json

# Adjust imports based on your project structure
from app.models.invoice_models import (
    InvoiceNew, InvoiceNewItem, Package, Customer, 
    InvoiceTemplate, Voucher
)
# Note: generate_share_token is not used in create_on_the_fly (uses secrets.token_urlsafe directly)
# from app.utils.security import generate_share_token
from app.config import invoice_settings  # Adjust import path as needed


class InvoiceRepository:
    """Repository for invoice operations"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def _generate_invoice_number(self) -> str:
        """Generate next invoice number"""
        last_invoice = self.db.query(InvoiceNew).order_by(
            InvoiceNew.invoice_number.desc()
        ).first()
        
        if last_invoice:
            try:
                last_num = int(last_invoice.invoice_number.replace(
                    invoice_settings.INVOICE_NUMBER_PREFIX + "-", ""
                ))
                next_num = last_num + 1
            except:
                next_num = 1
        else:
            next_num = 1
        
        num_str = str(next_num).zfill(invoice_settings.INVOICE_NUMBER_LENGTH)
        return f"{invoice_settings.INVOICE_NUMBER_PREFIX}-{num_str}"
    
    def _calculate_invoice_totals(self, invoice: InvoiceNew) -> None:
        """Calculate invoice totals"""
        items = invoice.items
        
        if not items:
            items = self.db.query(InvoiceNewItem).filter(
                InvoiceNewItem.invoice_id == invoice.bubble_id
            ).all()
        
        # Calculate base subtotal from items
        subtotal = sum(item.total_price for item in items) if items else Decimal(0)
        invoice.subtotal = subtotal
        
        # Calculate discount amount from discount items
        discount_items = [
            item for item in items 
            if hasattr(item, 'item_type') and item.item_type == 'discount'
        ]
        discount_from_items = sum(abs(item.total_price) for item in discount_items)
        
        # Calculate voucher amount from voucher items
        voucher_items = [
            item for item in items 
            if hasattr(item, 'item_type') and item.item_type == 'voucher'
        ]
        voucher_from_items = sum(abs(item.total_price) for item in voucher_items)
        
        invoice.discount_amount = discount_from_items
        invoice.voucher_amount = voucher_from_items
        
        # Calculate SST
        taxable_amount = subtotal
        invoice.sst_amount = (
            taxable_amount * (invoice.sst_rate / Decimal(100)) 
            if taxable_amount > 0 else Decimal(0)
        )
        
        # Calculate total
        invoice.total_amount = taxable_amount + invoice.sst_amount
    
    def create_on_the_fly(
        self,
        package_id: str,
        discount_fixed: Decimal = Decimal(0),
        discount_percent: Decimal = Decimal(0),
        apply_sst: bool = False,
        template_id: Optional[str] = None,
        voucher_code: Optional[str] = None,
        agent_markup: Decimal = Decimal(0),
        customer_name: Optional[str] = None,
        customer_phone: Optional[str] = None,
        customer_address: Optional[str] = None,
        epp_fee_amount: Optional[Decimal] = None,
        epp_fee_description: Optional[str] = None,
        created_by: Optional[int] = None
    ) -> InvoiceNew:
        """Create an invoice on the fly based on a package and other parameters"""
        
        # 1. Fetch Package
        package = self.db.query(Package).filter(
            Package.bubble_id == package_id
        ).first()
        if not package:
            raise ValueError(f"Package not found: {package_id}")
        
        # 2. Handle Customer
        customer_id = None
        if customer_name:
            customer = self.db.query(Customer).filter(
                Customer.name == customer_name
            ).first()
            if not customer:
                customer_id_str = f"cust_{secrets.token_hex(4)}"
                customer = Customer(
                    customer_id=customer_id_str,
                    name=customer_name,
                    phone=customer_phone,
                    address=customer_address,
                    created_by=created_by
                )
                self.db.add(customer)
                self.db.flush()
            customer_id = customer.id
            cust_name_snapshot = customer.name
            cust_phone_snapshot = customer.phone
            cust_address_snapshot = customer.address
            cust_email_snapshot = customer.email
        else:
            cust_name_snapshot = "Sample Quotation"
            cust_phone_snapshot = customer_phone
            cust_address_snapshot = customer_address
            cust_email_snapshot = None
        
        # 3. Handle Voucher
        voucher_amount = Decimal(0)
        if voucher_code:
            voucher = self.db.query(Voucher).filter(
                Voucher.voucher_code == voucher_code,
                Voucher.active == True
            ).first()
            if voucher:
                if voucher.discount_amount:
                    voucher_amount = voucher.discount_amount
                elif voucher.discount_percent:
                    voucher_amount = package.price * (
                        Decimal(voucher.discount_percent) / Decimal(100)
                    )
        
        # 4. Handle Template and SST
        if not template_id:
            default_template = self.db.query(InvoiceTemplate).filter(
                InvoiceTemplate.is_default == True,
                InvoiceTemplate.active == True
            ).first()
            if default_template:
                template_id = default_template.bubble_id
        
        sst_rate = Decimal(0)
        if apply_sst:
            sst_rate = Decimal(str(invoice_settings.DEFAULT_SST_RATE))
            if template_id:
                template = self.db.query(InvoiceTemplate).filter(
                    InvoiceTemplate.bubble_id == template_id
                ).first()
                if template and not template.apply_sst:
                    sst_rate = Decimal(0)
        
        # 5. Create Invoice
        bubble_id = f"inv_{secrets.token_hex(8)}"
        invoice_number = self._generate_invoice_number()
        
        invoice = InvoiceNew(
            bubble_id=bubble_id,
            invoice_number=invoice_number,
            invoice_date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            customer_id=customer_id,
            customer_name_snapshot=cust_name_snapshot,
            customer_phone_snapshot=cust_phone_snapshot,
            customer_address_snapshot=cust_address_snapshot,
            customer_email_snapshot=cust_email_snapshot,
            package_id=package_id,
            package_name_snapshot=(
                package.name if hasattr(package, 'name') 
                else (package.invoice_desc or f"Package {package.bubble_id}")
            ),
            template_id=template_id,
            discount_fixed=discount_fixed,
            discount_percent=discount_percent,
            agent_markup=agent_markup,
            voucher_code=voucher_code,
            voucher_amount=voucher_amount,
            sst_rate=sst_rate,
            status="draft",
            created_by=created_by,
            share_token=secrets.token_urlsafe(16),
            share_enabled=True,
            share_expires_at=datetime.now(timezone.utc) + timedelta(
                days=invoice_settings.SHARE_LINK_EXPIRY_DAYS
            )
        )
        
        self.db.add(invoice)
        self.db.flush()
        
        # 6. Add Items from Package
        unit_price = (package.price or Decimal(0)) + agent_markup
        item = InvoiceNewItem(
            bubble_id=f"item_{secrets.token_hex(8)}",
            invoice=invoice,
            description=(
                package.invoice_desc or 
                (package.name if hasattr(package, 'name') else f"Package {package.bubble_id}") or 
                "Package Item"
            ),
            qty=Decimal(1),
            unit_price=unit_price,
            total_price=unit_price,
            item_type="package",
            sort_order=0
        )
        self.db.add(item)
        
        # 6b. Create Discount Items
        discount_sort_order = 100
        
        if discount_fixed and discount_fixed > 0:
            fixed_discount_item = InvoiceNewItem(
                bubble_id=f"item_{secrets.token_hex(8)}",
                invoice=invoice,
                description=f"Discount (RM {discount_fixed})",
                qty=Decimal(1),
                unit_price=-discount_fixed,
                total_price=-discount_fixed,
                item_type="discount",
                sort_order=discount_sort_order
            )
            self.db.add(fixed_discount_item)
            discount_sort_order += 1
        
        if discount_percent and discount_percent > 0:
            percent_amount = package.price * (discount_percent / Decimal(100))
            percent_discount_item = InvoiceNewItem(
                bubble_id=f"item_{secrets.token_hex(8)}",
                invoice=invoice,
                description=f"Discount ({discount_percent}%)",
                qty=Decimal(1),
                unit_price=-percent_amount,
                total_price=-percent_amount,
                item_type="discount",
                sort_order=discount_sort_order
            )
            self.db.add(percent_discount_item)
            discount_sort_order += 1
        
        # 6c. Create Voucher Item
        if voucher_code and voucher_amount > 0:
            voucher_item = InvoiceNewItem(
                bubble_id=f"item_{secrets.token_hex(8)}",
                invoice=invoice,
                description=f"Voucher ({voucher_code})",
                qty=Decimal(1),
                unit_price=-voucher_amount,
                total_price=-voucher_amount,
                item_type="voucher",
                sort_order=101
            )
            self.db.add(voucher_item)
        
        # 6d. Create EPP Fee Item
        if epp_fee_amount and epp_fee_amount > 0 and epp_fee_description:
            epp_fee_decimal = (
                Decimal(str(epp_fee_amount)) 
                if not isinstance(epp_fee_amount, Decimal) 
                else epp_fee_amount
            )
            epp_fee_item = InvoiceNewItem(
                bubble_id=f"item_{secrets.token_hex(8)}",
                invoice=invoice,
                description=f"Bank Processing Fee ({epp_fee_description})",
                qty=Decimal(1),
                unit_price=epp_fee_decimal,
                total_price=epp_fee_decimal,
                item_type="epp_fee",
                sort_order=200
            )
            self.db.add(epp_fee_item)
        
        # 7. Finalize
        self._calculate_invoice_totals(invoice)
        self.db.commit()
        self.db.refresh(invoice)
        
        return invoice
    
    def get_by_id(self, bubble_id: str) -> Optional[InvoiceNew]:
        """Get invoice by ID"""
        return self.db.query(InvoiceNew).filter(InvoiceNew.bubble_id == bubble_id).first()
    
    def get_by_share_token(self, share_token: str) -> Optional[InvoiceNew]:
        """Get invoice by share token"""
        invoice = self.db.query(InvoiceNew).filter(
            InvoiceNew.share_token == share_token
        ).first()
        
        # Check if share is valid
        if invoice and invoice.share_enabled:
            if invoice.share_expires_at and invoice.share_expires_at < datetime.now(timezone.utc):
                return None
            return invoice
        
        return None
    
    def record_view(self, bubble_id: str) -> None:
        """Record that invoice was viewed via share link"""
        invoice = self.get_by_id(bubble_id)
        if invoice:
            invoice.viewed_at = datetime.now(timezone.utc)
            invoice.share_access_count += 1
            self.db.commit()
    
    def get_template(self, template_id: str) -> Optional[dict]:
        """Get template data by ID"""
        from sqlalchemy import text
        result = self.db.execute(
            text("SELECT * FROM invoice_template WHERE bubble_id = :id"),
            {"id": template_id}
        ).first()
        return result._asdict() if result else None
    
    def get_default_template_data(self) -> Optional[dict]:
        """Get default template data"""
        from sqlalchemy import text
        result = self.db.execute(
            text("SELECT * FROM invoice_template WHERE is_default = True AND active = True LIMIT 1")
        ).first()
        if not result:
            # Fallback to any active template if no default set
            result = self.db.execute(
                text("SELECT * FROM invoice_template WHERE active = True LIMIT 1")
            ).first()
        
        return result._asdict() if result else None

