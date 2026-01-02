"""
SQLAlchemy models for invoice creation.
These models should match your existing database schema.
If your calculator app already has these models, you can skip this file.
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Numeric, Text, ForeignKey, ARRAY
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base  # Adjust import path as needed


class InvoiceNew(Base):
    """Invoice model - matches invoice_new table"""
    __tablename__ = "invoice_new"

    id = Column(Integer, primary_key=True, index=True)
    bubble_id = Column(String, unique=True, nullable=False, index=True)
    template_id = Column(String)
    customer_id = Column(Integer, ForeignKey("customer.id"), index=True)
    customer_name_snapshot = Column(String, nullable=False)
    customer_address_snapshot = Column(Text)
    customer_phone_snapshot = Column(String)
    customer_email_snapshot = Column(String)
    agent_id = Column(String)
    agent_name_snapshot = Column(String)
    package_id = Column(String)
    package_name_snapshot = Column(String)
    invoice_number = Column(String, unique=True, nullable=False, index=True)
    invoice_date = Column(String, nullable=False)
    due_date = Column(String)
    subtotal = Column(Numeric(15, 2), nullable=False, default=0)
    agent_markup = Column(Numeric(15, 2), default=0)
    sst_rate = Column(Numeric(5, 2), default=0)
    sst_amount = Column(Numeric(15, 2), nullable=False, default=0)
    discount_amount = Column(Numeric(15, 2), nullable=False, default=0)
    discount_fixed = Column(Numeric(15, 2), default=0)
    discount_percent = Column(Numeric(5, 2))
    voucher_code = Column(String)
    voucher_amount = Column(Numeric(15, 2), default=0)
    total_amount = Column(Numeric(15, 2), nullable=False, default=0)
    status = Column(String, default="draft")
    paid_amount = Column(Numeric(15, 2), default=0)
    internal_notes = Column(Text)
    customer_notes = Column(Text)
    share_token = Column(String, unique=True, index=True)
    share_enabled = Column(Boolean, default=False)
    share_expires_at = Column(DateTime(timezone=True))
    share_access_count = Column(Integer, default=0)
    linked_old_invoice = Column(String)
    migration_status = Column(String, default="new")
    created_by = Column(Integer, ForeignKey("user.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    sent_at = Column(DateTime(timezone=True))
    viewed_at = Column(DateTime(timezone=True))
    paid_at = Column(DateTime(timezone=True))

    items = relationship("InvoiceNewItem", back_populates="invoice", cascade="all, delete-orphan")
    payments = relationship("InvoicePaymentNew", back_populates="invoice", cascade="all, delete-orphan")

    def to_dict(self):
        """Convert model to dictionary"""
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}


class InvoiceNewItem(Base):
    """Invoice item model - matches invoice_new_item table"""
    __tablename__ = "invoice_new_item"

    id = Column(Integer, primary_key=True, index=True)
    bubble_id = Column(String, unique=True, nullable=False, index=True)
    invoice_id = Column(String, ForeignKey("invoice_new.bubble_id", ondelete="CASCADE"), index=True)
    product_id = Column(String)
    product_name_snapshot = Column(String)
    description = Column(Text, nullable=False)
    qty = Column(Numeric(10, 2), nullable=False)
    unit_price = Column(Numeric(15, 2), nullable=False)
    discount_percent = Column(Numeric(5, 2), default=0)
    total_price = Column(Numeric(15, 2), nullable=False)
    item_type = Column(String, default="package")
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    invoice = relationship("InvoiceNew", back_populates="items")


class InvoicePaymentNew(Base):
    """Invoice payment model - matches invoice_payment_new table"""
    __tablename__ = "invoice_payment_new"

    id = Column(Integer, primary_key=True, index=True)
    bubble_id = Column(String, unique=True, nullable=False, index=True)
    invoice_id = Column(String, ForeignKey("invoice_new.bubble_id", ondelete="CASCADE"), index=True)
    amount = Column(Numeric(15, 2), nullable=False)
    payment_method = Column(String)
    payment_date = Column(String, nullable=False)
    reference_no = Column(String)
    bank_name = Column(String)
    notes = Column(Text)
    status = Column(String, default="pending")
    verified_by = Column(Integer, ForeignKey("user.id"))
    verified_at = Column(DateTime(timezone=True))
    attachment_urls = Column(ARRAY(String))
    created_by = Column(Integer, ForeignKey("user.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    invoice = relationship("InvoiceNew", back_populates="payments")


class Package(Base):
    """Package model - matches package table"""
    __tablename__ = "package"

    id = Column(Integer, primary_key=True, index=True)
    bubble_id = Column(String, unique=True, nullable=False, index=True)
    name = Column(String)
    price = Column(Numeric)
    panel = Column(String)
    panel_qty = Column(Integer)
    invoice_desc = Column(Text)
    type = Column(String)
    active = Column(Boolean)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Customer(Base):
    """Customer model - matches customer table"""
    __tablename__ = "customer"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    phone = Column(String)
    email = Column(String)
    address = Column(Text)
    created_by = Column(Integer, ForeignKey("user.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class InvoiceTemplate(Base):
    """Invoice template model - matches invoice_template table"""
    __tablename__ = "invoice_template"

    id = Column(Integer, primary_key=True, index=True)
    bubble_id = Column(String, unique=True, nullable=False, index=True)
    template_name = Column(String, nullable=False)
    company_name = Column(String, nullable=False)
    company_address = Column(Text, nullable=False)
    company_phone = Column(String)
    company_email = Column(String)
    sst_registration_no = Column(String)
    bank_name = Column(String)
    bank_account_no = Column(String)
    bank_account_name = Column(String)
    logo_url = Column(String)
    terms_and_conditions = Column(Text)
    disclaimer = Column(Text)
    apply_sst = Column(Boolean, default=False)
    active = Column(Boolean, default=True)
    is_default = Column(Boolean, default=False)
    created_by = Column(Integer, ForeignKey("user.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Voucher(Base):
    """Voucher model - matches voucher table"""
    __tablename__ = "voucher"

    id = Column(Integer, primary_key=True, index=True)
    bubble_id = Column(String, unique=True, nullable=False, index=True)
    voucher_code = Column(String, unique=True, index=True)
    title = Column(String)
    discount_amount = Column(Numeric(15, 2))
    discount_percent = Column(Integer)
    invoice_description = Column(Text)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

