"""
Security utilities for invoice creation.
"""
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

# Import from your config - adjust path as needed
# from app.config import invoice_settings
# Or define constants here:
INVOICE_NUMBER_PREFIX = "INV"
INVOICE_NUMBER_LENGTH = 6
SHARE_LINK_EXPIRY_DAYS = 7


def generate_share_token() -> str:
    """Generate a unique share token for invoice sharing"""
    return secrets.token_urlsafe(32)


def generate_invoice_number() -> str:
    """Generate a unique invoice number (placeholder - actual implementation queries DB)"""
    return f"{INVOICE_NUMBER_PREFIX}-{secrets.token_hex(4).upper()}"

