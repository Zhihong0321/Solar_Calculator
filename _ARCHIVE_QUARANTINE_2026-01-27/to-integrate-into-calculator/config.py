"""
Configuration settings for invoice creation.
Merge these settings into your existing config.py file.
"""
from pydantic_settings import BaseSettings
from typing import Optional


class InvoiceSettings(BaseSettings):
    """Invoice-specific settings"""
    
    # Invoice Settings
    INVOICE_NUMBER_PREFIX: str = "INV"
    INVOICE_NUMBER_LENGTH: int = 6
    DEFAULT_SST_RATE: float = 8.0
    SHARE_LINK_EXPIRY_DAYS: int = 7
    
    # Database - Use your existing database configuration
    # These should match your calculator app's database settings
    DATABASE_URL: Optional[str] = None
    DATABASE_PRIVATE_URL: Optional[str] = None
    
    class Config:
        env_file = ".env"
        case_sensitive = True


# Create instance - merge with your existing settings
invoice_settings = InvoiceSettings()

