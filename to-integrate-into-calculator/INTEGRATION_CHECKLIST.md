# Integration Checklist

Use this checklist to ensure a complete and successful integration.

## Pre-Integration

- [ ] Read `README.md` to understand the package structure
- [ ] Read `QUICK_START.md` for overview
- [ ] Read `INTEGRATION_GUIDE.md` for detailed instructions
- [ ] Verify calculator app uses FastAPI
- [ ] Verify calculator app connects to same PostgreSQL database
- [ ] Verify required dependencies are installed (FastAPI, SQLAlchemy, Pydantic, Jinja2)

## File Copying

- [ ] Copy `routes/invoice_creation.py` to calculator app
- [ ] Copy `api/invoice_api.py` to calculator app
- [ ] Copy `api/public_invoice.py` to calculator app (REQUIRED for share links)
- [ ] Copy `repositories/invoice_repo.py` to calculator app
- [ ] Copy `schemas/invoice_schema.py` to calculator app
- [ ] Copy `models/invoice_models.py` (if needed) to calculator app
- [ ] Copy `templates/create_invoice.html` to calculator app
- [ ] Copy `utils/security.py` to calculator app
- [ ] Copy `utils/html_generator.py` to calculator app (REQUIRED for invoice view)
- [ ] Copy `utils/pdf_generator.py` to calculator app (REQUIRED for PDF download)

## Configuration

- [ ] Add invoice settings to `config.py`:
  - [ ] `INVOICE_NUMBER_PREFIX`
  - [ ] `INVOICE_NUMBER_LENGTH`
  - [ ] `DEFAULT_SST_RATE`
  - [ ] `SHARE_LINK_EXPIRY_DAYS`
- [ ] Verify database connection settings match shared PostgreSQL
- [ ] Update template directory path if needed

## Code Integration

- [ ] Register `invoice_creation.router` in main FastAPI app
- [ ] Register `invoice_api.router` in main FastAPI app
- [ ] Register `public_invoice.router` in main FastAPI app (REQUIRED for share links)
- [ ] Fix all import paths to match calculator app structure:
  - [ ] Database imports (`from app.database import get_db`)
  - [ ] Config imports (`from app.config import ...`)
  - [ ] Model imports (`from app.models.invoice_models import ...`)
  - [ ] Schema imports (`from app.schemas.invoice_schema import ...`)
  - [ ] Repository imports (`from app.repositories.invoice_repo import ...`)

## Link Updates

- [ ] Find all calculator code that generates invoice links
- [ ] Update links from `quote.atap.solar/create-invoice` to `/create-invoice` or `calculator.atap.solar/create-invoice`
- [ ] Test that links work correctly

## Testing

- [ ] Start calculator app locally
- [ ] Test invoice creation page loads: `/create-invoice`
- [ ] Test with package_id parameter: `/create-invoice?package_id=TEST_ID`
- [ ] Test package lookup works
- [ ] Test invoice creation form submission
- [ ] Test API endpoint: `POST /api/v1/invoices/on-the-fly`
- [ ] Verify invoice created in database
- [ ] Verify invoice share link works
- [ ] Test with real package_id from database
- [ ] Test error handling (invalid package_id, etc.)

## Database Verification

- [ ] Verify `package` table exists and is accessible
- [ ] Verify `customer` table exists and is accessible
- [ ] Verify `invoice_template` table exists and is accessible
- [ ] Verify `voucher` table exists and is accessible
- [ ] Verify `invoice_new` table exists and is accessible
- [ ] Verify `invoice_new_item` table exists and is accessible
- [ ] Verify `invoice_payment_new` table exists and is accessible
- [ ] Install `weasyprint` dependency: `pip install weasyprint` (for PDF generation)

## Production Deployment

- [ ] Test in staging environment
- [ ] Update production calculator links
- [ ] Deploy to production
- [ ] Monitor for errors
- [ ] Verify production invoice creation works
- [ ] Test production invoice share links

## Post-Deployment

- [ ] Monitor error logs
- [ ] Verify invoice creation statistics
- [ ] Check database performance
- [ ] Gather user feedback
- [ ] Document any customizations made

## Troubleshooting

If issues occur:
- [ ] Check error logs
- [ ] Verify database connection
- [ ] Verify all imports are correct
- [ ] Verify template path is correct
- [ ] Verify package_id exists in database
- [ ] Check INTEGRATION_GUIDE.md troubleshooting section

## Completion

- [ ] All checklist items completed
- [ ] Integration tested and working
- [ ] Documentation updated
- [ ] Team notified of changes

---

**Integration Date:** _______________  
**Integrated By:** _______________  
**Tested By:** _______________  
**Deployed To Production:** _______________

