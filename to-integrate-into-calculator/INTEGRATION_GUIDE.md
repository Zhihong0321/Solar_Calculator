# Integration Guide: Invoice Creation for Calculator App

This guide will help you integrate the invoice creation functionality into your calculator app.

## Prerequisites

- Calculator app is a FastAPI application
- Calculator app already connects to the same PostgreSQL database
- Calculator app has FastAPI, SQLAlchemy, Pydantic, Jinja2 installed

## Step 1: Copy Files to Calculator App

Copy all files from this folder to your calculator app:

```
calculator-app/
├── app/
│   ├── routes/
│   │   └── invoice_creation.py        # Copy from routes/
│   ├── api/
│   │   └── invoice_api.py            # Copy from api/
│   ├── repositories/
│   │   └── invoice_repo.py            # Copy from repositories/
│   ├── schemas/
│   │   └── invoice_schema.py         # Copy from schemas/
│   ├── models/
│   │   └── invoice_models.py          # Copy from models/
│   ├── templates/
│   │   └── create_invoice.html        # Copy from templates/
│   ├── config.py                      # Merge with your existing config.py
│   ├── database.py                    # Update if needed
│   └── utils/
│       └── security.py                # Copy from utils/
```

## Step 2: Update Configuration

### 2.1 Update `config.py`

Add these settings to your existing `config.py`:

```python
# Invoice Settings
INVOICE_NUMBER_PREFIX: str = "INV"
INVOICE_NUMBER_LENGTH: int = 6
DEFAULT_SST_RATE: float = 8.0
SHARE_LINK_EXPIRY_DAYS: int = 7
```

### 2.2 Update `database.py`

Ensure your `database.py` exports:
- `get_db()` - Database session dependency
- `Base` - SQLAlchemy Base
- `SessionLocal` - Database session factory

The provided `database.py` is a simplified version. If your calculator app already has database setup, you can skip copying it and just ensure these exports exist.

## Step 3: Register Routes in Main App

In your main FastAPI app file (usually `main.py` or `app.py`), add:

```python
from fastapi import FastAPI
from app.routes import invoice_creation
from app.api import invoice_api
from app.api import public_invoice  # For viewing invoices via share token

app = FastAPI()

# Register invoice creation route (HTML page)
app.include_router(invoice_creation.router)

# Register invoice API routes
app.include_router(invoice_api.router)

# Register public invoice view routes (REQUIRED for share links to work)
app.include_router(public_invoice.router)
```

## Step 4: Update Template Paths

If your template directory structure is different, update the template path in `routes/invoice_creation.py`:

```python
# Find this line:
template_dir = os.path.join(base_dir, "app", "templates")

# Update to match your structure, e.g.:
template_dir = os.path.join(base_dir, "templates")
```

## Step 5: Update Base URL for Invoice Links

In `api/invoice_api.py`, the invoice share link uses `request.base_url`. This should work automatically, but if you need a custom base URL, update:

```python
# In create_invoice_on_the_fly function:
base_url = str(request.base_url).rstrip("/")
# Or set a custom URL:
base_url = "https://calculator.atap.solar"  # Your calculator domain
```

## Step 6: Test the Integration

### 6.1 Test the Invoice Creation Page

1. Start your calculator app
2. Navigate to: `http://localhost:PORT/create-invoice?package_id=YOUR_PACKAGE_ID`
3. You should see the invoice creation form

### 6.2 Test Invoice Creation API

```bash
curl -X POST "http://localhost:PORT/api/v1/invoices/on-the-fly" \
  -H "Content-Type: application/json" \
  -d '{
    "package_id": "YOUR_PACKAGE_ID",
    "customer_name": "Test Customer",
    "discount_given": "500 10%",
    "apply_sst": false
  }'
```

### 6.3 Update Calculator Links

In your calculator app, update any links that point to `quote.atap.solar/create-invoice` to point to your own domain:

```python
# OLD:
invoice_url = f"https://quote.atap.solar/create-invoice?package_id={package_id}"

# NEW:
invoice_url = f"https://calculator.atap.solar/create-invoice?package_id={package_id}"
# Or if using relative URLs:
invoice_url = f"/create-invoice?package_id={package_id}"
```

## Step 7: Optional Customizations

### 7.1 Add Authentication (Optional)

If you want to require authentication for invoice creation, wrap the routes:

```python
from app.middleware.auth import get_current_user  # Your auth dependency

@app.get("/create-invoice", response_class=HTMLResponse)
async def create_invoice_page(
    request: Request,
    current_user: User = Depends(get_current_user),  # Add this
    # ... rest of parameters
):
    # ... rest of code
```

### 7.2 Customize Template Styling

Edit `templates/create_invoice.html` to match your calculator app's design system.

### 7.3 Add Logging

Add logging to track invoice creation:

```python
import logging
logger = logging.getLogger(__name__)

# In create_invoice_on_the_fly:
logger.info(f"Invoice created: {invoice.invoice_number} for package {package_id}")
```

## Troubleshooting

### Issue: Template not found

**Solution:** Check that `templates/create_invoice.html` exists and the path in `invoice_creation.py` is correct.

### Issue: Database connection error

**Solution:** Ensure your database connection settings match the shared PostgreSQL database.

### Issue: Package not found

**Solution:** Verify the `package_id` exists in the `package` table and your database connection is working.

### Issue: Import errors

**Solution:** Ensure all dependencies are installed and Python paths are correct. Check that all model imports match your database schema.

## Verification Checklist

- [ ] All files copied to calculator app
- [ ] Configuration updated
- [ ] Routes registered in main app
- [ ] Template path correct
- [ ] Database connection working
- [ ] Invoice creation page loads
- [ ] Invoice creation API works
- [ ] Calculator links updated to use new URL
- [ ] Tested with real package_id
- [ ] Invoice share link works

## Support

If you encounter issues:
1. Check the error logs
2. Verify database connection
3. Ensure all dependencies are installed
4. Check that database tables exist
5. Verify package_id exists in database

## Next Steps

After integration:
1. Update all calculator links to use the new invoice creation URL
2. Test thoroughly with real data
3. Monitor for any errors
4. Consider adding analytics/logging

