# Quick Start Guide

## 🚀 Fast Integration (5 Minutes)

### Step 1: Copy Files
Copy all folders/files from `to-integrate-into-calculator/` to your calculator app:

```
calculator-app/
├── app/
│   ├── routes/
│   │   └── invoice_creation.py        ← Copy from routes/
│   ├── api/
│   │   └── invoice_api.py            ← Copy from api/
│   ├── repositories/
│   │   └── invoice_repo.py            ← Copy from repositories/
│   ├── schemas/
│   │   └── invoice_schema.py         ← Copy from schemas/
│   ├── models/
│   │   └── invoice_models.py         ← Copy from models/ (if needed)
│   ├── templates/
│   │   └── create_invoice.html        ← Copy from templates/
│   └── utils/
│       └── security.py                ← Copy from utils/
```

### Step 2: Update Config
Add to your `app/config.py`:

```python
# Invoice Settings
INVOICE_NUMBER_PREFIX: str = "INV"
INVOICE_NUMBER_LENGTH: int = 6
DEFAULT_SST_RATE: float = 8.0
SHARE_LINK_EXPIRY_DAYS: int = 7
```

### Step 3: Register Routes
In your `main.py` or `app.py`:

```python
from app.routes import invoice_creation
from app.api import invoice_api
from app.api import public_invoice  # For viewing invoices via share token

app.include_router(invoice_creation.router)
app.include_router(invoice_api.router)
app.include_router(public_invoice.router)  # Required for invoice share links to work
```

### Step 4: Fix Imports
Update import paths in all copied files to match your project structure:
- `from app.database import get_db` → Your database import
- `from app.config import invoice_settings` → Your config import
- `from app.models.invoice_models import ...` → Your models import

### Step 5: Update Calculator Links
Find all places in your calculator that generate invoice links:

```python
# OLD:
invoice_url = f"https://quote.atap.solar/create-invoice?package_id={package_id}"

# NEW:
invoice_url = f"/create-invoice?package_id={package_id}"  # Relative URL
# OR
invoice_url = f"https://calculator.atap.solar/create-invoice?package_id={package_id}"  # Absolute URL
```

### Step 6: Test
1. Start your calculator app
2. Visit: `http://localhost:PORT/create-invoice?package_id=YOUR_PACKAGE_ID`
3. Fill out the form and create an invoice
4. Verify invoice is created in database

## ✅ Done!

Your calculator app now has invoice creation functionality without requiring separate authentication.

## Need Help?

See `INTEGRATION_GUIDE.md` for detailed instructions and troubleshooting.

