# Invoice Action and Snapshot Documentation

## Overview

The Invoice Action system tracks all changes made to invoices (creation, version updates) and stores full snapshots of the invoice state at each action point. This provides a complete audit trail and ability to view historical versions of invoices.

## Database Schema

### invoice_action Table

| Column | Type | Description |
|---------|-------|-------------|
| id | integer | Auto-increment primary key |
| bubble_id | varchar(255) | Action record ID (format: `act_XXXXXXXXXXXX`) |
| invoice_id | varchar(255) | Reference to invoice_new.bubble_id |
| action_type | varchar(50) | Type of action: `INVOICE_CREATED`, `INVOICE_VERSIONED` |
| details | jsonb | JSONB field containing action metadata and full snapshot |
| created_by | varchar(255) | User ID who performed the action |
| created_at | timestamp | When the action occurred |

## JSON Structure

### details Field Structure

The `details` field in `invoice_action` is a JSONB object with the following structure:

```json
{
  "change_summary": "Created version R1 from INV-000001",
  "discount_fixed": "0.00",
  "discount_percent": "0.00",
  "total_amount": "19276.00",
  "snapshot": {
    // Full invoice snapshot object (see below)
  }
}
```

### snapshot Field Structure

The `snapshot` field is a complete representation of the invoice state including header and all items.

```json
{
  "bubble_id": "inv_9f34474630192402",
  "invoice_number": "INV-000001",
  "customer_name_snapshot": "Test User",
  "customer_phone_snapshot": null,
  "customer_address_snapshot": null,
  "package_id": "1703833647950x572894707690242050",
  "package_name_snapshot": "STRING SAJ JINKO 8 PCS",
  "invoice_date": "2025-12-29",
  "subtotal": "18276.00",
  "sst_rate": "0.00",
  "sst_amount": "0.00",
  "discount_amount": "0.00",
  "discount_fixed": "0.00",
  "discount_percent": "0.00",
  "voucher_code": null,
  "voucher_amount": "0.00",
  "total_amount": "19276.00",
  "status": "draft",
  "share_token": "abc123...",
  "agent_markup": "500.00",
  "version": 1,
  "root_id": "inv_9f34474630192402",
  "parent_id": null,
  "is_latest": true,
  "panel_qty": 8,
  "panel_rating": 620,
  "system_size_kwp": 4.96,
  "template": {
    // Template object from invoice_template table
    "bubble_id": "tpl_xxxxx",
    "template_name": "Default Template",
    "company_name": "Atap Solar",
    "company_address": "...",
    // ... all template fields
  },
  "items": [
    {
      "id": 1,
      "bubble_id": "item_26d4fdf22ffc5806",
      "invoice_id": "inv_9f34474630192402",
      "product_id": null,
      "product_name_snapshot": null,
      "description": "STRING SAJ JINKO 8 PCS",
      "qty": "1.00",
      "unit_price": "18276.00",
      "discount_percent": "0.00",
      "total_price": "18276.00",
      "sort_order": 0,
      "created_at": "2025-12-29T08:33:23.783Z",
      "item_type": "package"
    },
    // ... more items (discount, voucher, extra, bank_processing_fee, etc.)
  ]
}
```

## Snapshot Field Types

### Header Fields (invoice_new table)

| Field | Type | Description |
|--------|-------|-------------|
| bubble_id | string | Invoice unique ID |
| invoice_number | string | Human-readable invoice number |
| customer_name_snapshot | string/null | Customer name at time of action |
| customer_phone_snapshot | string/null | Customer phone at time of action |
| customer_address_snapshot | string/null | Customer address at time of action |
| package_id | string/null | Package bubble_id |
| package_name_snapshot | string/null | Package name at time of action |
| invoice_date | string | Invoice date (YYYY-MM-DD) |
| subtotal | numeric | Base amount before discounts/SST |
| sst_rate | numeric | SST percentage (e.g., 6.00) |
| sst_amount | numeric | SST amount calculated |
| discount_amount | numeric | Total discount amount |
| discount_fixed | numeric | Fixed discount portion |
| discount_percent | numeric | Percentage discount portion |
| voucher_code | string/null | Comma-separated voucher codes |
| voucher_amount | numeric | Total voucher discount |
| total_amount | numeric | Final amount including SST |
| status | string | Invoice status (draft, sent, paid, etc.) |
| share_token | string | Public share token |
| agent_markup | numeric | Agent markup amount |
| version | integer | Invoice version number |
| root_id | string | Root invoice bubble_id (first in chain) |
| parent_id | string/null | Parent invoice bubble_id |
| is_latest | boolean | Whether this is the latest version |

### Calculated Fields (added during snapshot creation)

| Field | Type | Description |
|--------|-------|-------------|
| panel_qty | integer | Number of panels (from package) |
| panel_rating | numeric | Panel watt rating (from package) |
| system_size_kwp | numeric | System size in kWp (calculated) |

### Template Object

The `template` field contains the full invoice template from `invoice_template` table:

| Field | Description |
|--------|-------------|
| bubble_id | Template ID |
| template_name | Template name |
| company_name | Company name for invoice |
| company_address | Company address |
| company_phone | Company phone |
| company_email | Company email |
| bank_name | Bank name for payment |
| bank_account_no | Bank account number |
| bank_account_name | Bank account holder name |
| terms_and_conditions | Invoice terms |
| logo_url | Company logo URL |
| ... | ... all other template fields |

### Items Array

Each item in `items` array represents a line item from `invoice_new_item` table:

| Field | Type | Description |
|--------|-------|-------------|
| id | integer | Item primary key |
| bubble_id | string | Item unique ID |
| invoice_id | string | Reference to invoice |
| product_id | string/null | Product bubble_id if applicable |
| product_name_snapshot | string/null | Product name snapshot |
| description | string | Item description |
| qty | string | Quantity |
| unit_price | string | Unit price |
| discount_percent | string | Item-level discount % |
| total_price | string | Item total |
| sort_order | integer | Display order |
| created_at | timestamp | When item was created |
| item_type | string | Type: `package`, `discount`, `voucher`, `extra`, `bank_processing_fee`, `sst`, `subtotal` |

## Action Types

### INVOICE_CREATED

Triggered when a new invoice is created via `/api/v1/invoices/on-the-fly`.

**Action details includes:**
```json
{
  "change_summary": "Invoice created",
  "discount_fixed": 0,
  "discount_percent": 0,
  "total_amount": 19276.00,
  "snapshot": { ... }
}
```

### INVOICE_VERSIONED

Triggered when a new version is created via `/api/v1/invoices/:bubbleId/version`.

**Action details includes:**
```json
{
  "change_summary": "Created version 2 from INV-000001",
  "discount_fixed": 500,
  "discount_percent": 10,
  "total_amount": 16848.40,
  "snapshot": { ... }
}
```

## API Endpoints

### 1. Get Invoice History

**Endpoint:** `GET /api/v1/invoices/:bubbleId/history`

**Description:** Retrieves all action records for an invoice family (all versions).

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "bubble_id": "act_abc123",
      "invoice_id": "inv_xyz789",
      "action_type": "INVOICE_CREATED",
      "details": { ... },
      "created_by": "user_123",
      "created_at": "2025-12-29T10:00:00Z"
    },
    {
      "bubble_id": "act_def456",
      "invoice_id": "inv_new456",
      "action_type": "INVOICE_VERSIONED",
      "details": { ... },
      "created_by": "user_123",
      "created_at": "2025-12-30T14:30:00Z"
    }
  ]
}
```

### 2. View Snapshot (HTML)

**Endpoint:** `GET /api/v1/invoices/actions/:actionId/snapshot`

**Description:** Renders the snapshot as HTML invoice page.

**Authentication:** Required. Users can only view snapshots of invoices they created.

**Response:**
- HTML (Content-Type: text/html) when viewed in browser
- JSON (Content-Type: application/json) when Accept header includes application/json

**Example:**
```
GET /api/v1/invoices/actions/act_abc123/snapshot
```

**Flow:**
1. Fetch `invoice_action` record by `actionId`
2. Check user owns the action (via `created_by`)
3. Extract `snapshot` from `details` field
4. If snapshot has `template` object, use it
5. Otherwise fetch default template
6. Generate HTML using `invoiceHtmlGenerator`
7. Return HTML to browser

### 3. View Snapshot (JSON)

**Endpoint:** Same as above, but with JSON Accept header

**Request:**
```
GET /api/v1/invoices/actions/act_abc123/snapshot
Accept: application/json
```

**Response:**
```json
{
  "success": true,
  "data": {
    "bubble_id": "inv_...",
    "invoice_number": "INV-000001",
    // ... full snapshot object
  }
}
```

## Code Flow

### Creating Invoice Action

**Location:** `services/invoiceRepo.js` - `_logInvoiceAction()`

```javascript
async function _logInvoiceAction(client, invoiceId, actionType, createdBy, extraDetails = {}) {
  // 1. Fetch full snapshot (Header + Items)
  const snapshot = await getInvoiceByBubbleId(client, invoiceId);
  
  if (!snapshot) {
    console.error(`Failed to capture snapshot for invoice ${invoiceId}`);
    return;
  }

  const actionId = `act_${crypto.randomBytes(8).toString('hex')}`;
  
  // 2. Merge snapshot into details
  const details = {
    ...extraDetails,
    snapshot: snapshot
  };

  // 3. Insert action record
  await client.query(
    `INSERT INTO invoice_action (bubble_id, invoice_id, action_type, details, created_by, created_at)`,
    `VALUES ($1, $2, $3, $4, $5, NOW())`,
    [actionId, invoiceId, actionType, JSON.stringify(details), createdBy]
  );
}
```

### Creating Invoice Version (with action logging)

**Location:** `services/invoiceRepo.js` - `createInvoiceVersionTransaction()`

```javascript
async function createInvoiceVersionTransaction(client, data) {
  // 1. Fetch original invoice
  // 2. Create new version record
  const newInvoice = await _createInvoiceVersionRecord(client, org, data, financials, voucherInfo);

  // 3. Create line items
  await _createLineItems(client, newInvoice.bubble_id, data, financials, { pkg }, voucherInfo);

  // 4. Log Action with Snapshot
  const details = {
    change_summary: `Created version ${newInvoice.version} from ${org.invoice_number}`,
    discount_fixed: data.discountFixed,
    discount_percent: data.discountPercent,
    total_amount: financials.finalTotalAmount
  };
  await _logInvoiceAction(client, newInvoice.bubble_id, 'INVOICE_VERSIONED', String(data.userId), details);

  // 5. Commit transaction
  await client.query('COMMIT');
}
```

## Frontend Usage

### History Modal (my_invoice.html)

```javascript
async function openHistoryModal(bubbleId) {
  const res = await fetch(`/api/v1/invoices/${bubbleId}/history`);
  const json = await res.json();
  
  if (json.success) {
    const actions = json.data;
    
    // Render history items
    actions.forEach(action => {
      const details = action.details || {};
      const hasSnapshot = !!details.snapshot;
      
      // Show "View Snapshot" button if snapshot exists
      if (hasSnapshot) {
        // Link to snapshot view (opens in new tab)
        const snapshotUrl = `/api/v1/invoices/actions/${action.bubble_id}/snapshot`;
        
        // Render button
        renderButton({
          text: 'View Snapshot',
          href: snapshotUrl,
          target: '_blank',
          className: 'bg-emerald-100 text-emerald-700'
        });
      }
    });
  }
}
```

### Snapshot View Button

```html
<a href="/api/v1/invoices/actions/${action.action_id}/snapshot" 
   target="_blank" 
   class="ml-auto text-xs bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full font-semibold">
   View Snapshot
</a>
```

- **Opens in new tab** (`target="_blank"`)
- **Renders full HTML invoice** using snapshot data
- **Preserves exact invoice state** at time of action
- **Cannot be modified** - snapshots are read-only

## Important Notes

### 1. Snapshot Completeness

Snapshots MUST include:
- ✓ All invoice_new header fields
- ✓ All invoice_new_item records (sorted by sort_order)
- ✓ Template object (for rendering HTML)
- ✓ Package data (panel_qty, panel_rating for system size)
- ✓ Created by user name

### 2. Template Handling

When viewing snapshot:
- If `snapshot.template` exists → Use it
- If `snapshot.template` is null → Fetch default template
- This ensures snapshot can always be rendered even if template was deleted

### 3. Security

- Users can only view snapshots of invoices they created (`created_by` check)
- Snapshot IDs (`bubble_id` in invoice_action) are separate from invoice IDs
- Use `act_` prefix to avoid confusion

### 4. Data Types in Database

**Important:** PostgreSQL numeric types are returned as strings in some cases. Always parse to number before calculations:

```javascript
const totalAmount = parseFloat(snapshot.total_amount) || 0;
const subtotal = parseFloat(snapshot.subtotal) || 0;
```

### 5. Item Types

The `items` array can contain multiple item types:

| Type | Description | Example |
|-------|-------------|----------|
| package | Main package item | "STRING SAJ JINKO 8 PCS" |
| discount | Discount item | "-RM 500.00" |
| voucher | Voucher discount | "-RM 1000.00" |
| extra | Additional items (inverters) | "SAJ Microinverter M2 1.8K" |
| bank_processing_fee | EPP fee | "RM 500.00" |
| sst | SST amount | "RM 1036.56" |
| subtotal | Subtotal line item | "RM 18276.00" |

## Testing Snapshots

### Test 1: Create Invoice and Check Snapshot

```bash
# Create invoice via API
curl -X POST http://localhost:3000/api/v1/invoices/on-the-fly \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"package_id": "...", "customer_name": "Test"}'

# Check action was created
SELECT * FROM invoice_action 
WHERE invoice_id = '<returned_bubble_id>';

# Verify snapshot structure
SELECT details->'snapshot'->'invoice_number' as invoice_number,
       jsonb_array_length(details->'snapshot'->'items') as item_count
FROM invoice_action;
```

### Test 2: Create Version and Check Snapshot

```bash
# Create version
curl -X POST http://localhost:3000/api/v1/invoices/<bubble_id>/version \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"discount_given": "500 10%"}'

# View history
curl http://localhost:3000/api/v1/invoices/<bubble_id>/history \
  -H "Authorization: Bearer <token>"

# View specific snapshot (HTML)
curl http://localhost:3000/api/v1/invoices/actions/<action_bubble_id>/snapshot \
  -H "Authorization: Bearer <token>"
```

### Test 3: Verify Snapshot Template Rendering

```bash
# Get snapshot as JSON
curl http://localhost:3000/api/v1/invoices/actions/<action_bubble_id>/snapshot \
  -H "Authorization: Bearer <token>" \
  -H "Accept: application/json"

# Check if template is present
# Expected: { "success": true, "data": { ..., "template": { ... } } }
```

## Common Issues and Solutions

### Issue: Snapshot missing template

**Problem:** `snapshot.template` is null, invoice renders with default template.

**Solution:** `getInvoiceByBubbleId` must fetch template object:

```javascript
// WRONG - doesn't include template
const snapshot = await getInvoiceByBubbleId(client, invoiceId);

// CORRECT - getInvoiceByShareToken includes template
// OR - modify getInvoiceByBubbleId to fetch template
```

**Fix:** Ensure `getInvoiceByBubbleId` fetches template like `getInvoiceByShareToken` does.

### Issue: Items not sorted

**Problem:** Items appear in random order.

**Solution:** Always fetch with ORDER BY:

```javascript
ORDER BY sort_order ASC, created_at ASC
```

### Issue: Missing calculated fields

**Problem:** `system_size_kwp` not in snapshot.

**Solution:** Calculate during snapshot creation:

```javascript
if (packageData.panel_qty && packageData.solar_output_rating) {
  invoice.system_size_kwp = (packageData.panel_qty * packageData.solar_output_rating) / 1000;
}
```

### Issue: Date parsing

**Problem:** Timestamps don't match database format.

**Solution:** Use `toISOString()` for database, format strings for display:

```javascript
invoiceDate: new Date().toISOString().split('T')[0]  // For DB
invoiceDate: '2025-12-29'  // For display
```

## Summary

- Invoice Action provides complete audit trail
- Snapshots store full invoice state (header + items + template)
- Actions logged for INVOICE_CREATED and INVOICE_VERSIONED
- Snapshots are read-only, viewable via HTML or JSON API
- Security: Users can only view their own actions
- Template handling ensures snapshots always render correctly
