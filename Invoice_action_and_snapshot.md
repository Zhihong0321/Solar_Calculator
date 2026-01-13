# Invoice Action and Snapshot Documentation

## Overview

The Invoice Action system tracks all changes made to invoices (creation, version updates) and stores full snapshots of the invoice state at each action point. This provides a complete audit trail and ability to view historical versions of invoices.

## Database Schema

### 1. invoice_action Table (Legacy Log)

| Column | Type | Description |
|---------|-------|-------------|
| id | integer | Auto-increment primary key |
| bubble_id | varchar(255) | Action record ID (format: `act_XXXXXXXXXXXX`) |
| invoice_id | varchar(255) | Reference to invoice.bubble_id |
| action_type | varchar(50) | Type of action: `INVOICE_CREATED`, `INVOICE_VERSIONED` |
| details | jsonb | JSONB field containing action metadata and full snapshot |
| created_by | varchar(255) | User ID who performed the action |
| created_at | timestamp | When the action occurred |

### 2. invoice_snapshot Table (New Architecture)

This table stores the high-integrity version history of every invoice.

| Column | Type | Description |
|---------|-------|-------------|
| id | integer | Auto-increment primary key |
| invoice_id | integer | Foreign Key to `invoice.id` |
| version | integer | Version number (1, 2, 3...) |
| snapshot_data | jsonb | Full JSON object of the invoice state |
| created_by | varchar(255) | User ID who created this snapshot |
| created_at | timestamp | When the snapshot was taken |

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
  "id": 158,
  "bubble_id": "inv_9f34474630192402",
  "invoice_number": "INV-000001",
  "customer_id": 49,
  "customer_name_snapshot": "Test User",
  "customer_phone_snapshot": null,
  "customer_address_snapshot": null,
  "package_id": "1703833647950x572894707690242050",
  "package_name_snapshot": "STRING SAJ JINKO 8 PCS",
  "invoice_date": "2025-12-29T00:00:00.000Z",
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

### Header Fields (invoice table)

| Field | Type | Description |
|--------|-------|-------------|
| bubble_id | string | Invoice unique ID |
| invoice_number | string | Human-readable invoice number |
| customer_id | integer | Link to Customer table |
| customer_name_snapshot | text/null | Customer name at time of action |
| customer_phone_snapshot | text/null | Customer phone at time of action |
| customer_address_snapshot | text/null | Customer address at time of action |
| package_id | string/null | Package bubble_id |
| package_name_snapshot | text/null | Package name at time of action |
| invoice_date | timestamp | Invoice date |
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
| root_id | text | Root invoice bubble_id (first in chain) |
| parent_id | text/null | Parent invoice bubble_id |
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

**Location:** `services/invoiceRepo.js` - `logInvoiceAction()`

```javascript
async function logInvoiceAction(client, invoiceId, actionType, createdBy, extraDetails = {}) {
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

  // 3. Insert action record (Legacy)
  await client.query(
    `INSERT INTO invoice_action (bubble_id, invoice_id, action_type, details, created_by, created_at)`,
    `VALUES ($1, $2, $3, $4, $5, NOW())`,
    [actionId, invoiceId, actionType, JSON.stringify(details), createdBy]
  );
  
  // 4. Insert Snapshot Record (New)
  const invoiceIntId = snapshot.id;
  const version = snapshot.version || 1;
  await client.query(
    `INSERT INTO invoice_snapshot (invoice_id, version, snapshot_data, created_by, created_at)`,
    `VALUES ($1, $2, $3, $4, NOW())`,
    [invoiceIntId, version, JSON.stringify(snapshot), createdBy]
  );
}
```

## Summary

- Invoice Action provides complete audit trail
- Snapshots store full invoice state (header + items + template)
- Actions logged for INVOICE_CREATED and INVOICE_VERSIONED
- Snapshots are read-only, viewable via HTML or JSON API
- Security: Users can only view their own actions
- Template handling ensures snapshots always render correctly