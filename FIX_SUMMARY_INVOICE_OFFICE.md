# Fix Summary: Invoice Office - App/Admin Missing

## Issue
The user reported "app missing, admin missing" in the Invoice Office. This corresponds to the status badges "APP: MISSING" and "ADMIN: MISSING" appearing in the SEDA Registration section. This state occurs when the invoice is not linked to a SEDA registration record, which can happen if the auto-creation failed or for legacy invoices.

## Resolution
I have implemented a "self-healing" mechanism in the Invoice Office API (`GET /api/v1/invoice-office/:bubbleId`).

### Changes
1.  **Modified `src/modules/Invoicing/api/routes.js`**:
    *   Imported `sedaService`.
    *   Updated the route logic to check if SEDA registration is missing.
    *   If missing AND the invoice has a linked customer (`linked_customer`), the system now automatically calls `sedaService.ensureSedaRegistration`.
    *   This creates the missing SEDA record, links it to the invoice and customer, and returns it immediately.

## Outcome
When you refresh the Invoice Office page for an affected invoice:
1.  The system will detect the missing SEDA record.
2.  It will automatically create a new draft application.
3.  The status badges will update to **APP: DRAFT** and **ADMIN: PENDING**.
4.  The "Go to SEDA Form" button will become functional.

## Verification
-   Verified code syntax with `node -c`.
-   Confirmed `ensureSedaRegistration` signature matches the call.
-   Confirmed `invoice.linked_customer` provides the necessary Customer Bubble ID.
