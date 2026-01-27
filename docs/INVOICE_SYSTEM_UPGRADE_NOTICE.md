# Database Transition Notice: Invoice System Consolidation

**Date:** January 13, 2026
**Subject:** Retirement of `invoice_new` and Consolidation into `invoice` Table

---

## 1. Overview
To simplify financial reporting, sales tracking, and database management, the temporary `invoice_new` table has been retired. All data and active workflows have been consolidated into the primary **`invoice`** table. 

This change ensures that all invoices (Legacy Bubble invoices and New Calculator invoices) exist in a single source of truth.

## 2. Key Changes for Data Users
If you are from Finance, Sales, or IT and you previously queried `invoice_new`, please update your workflows as follows:

### Table Mapping
| Old Table (Retired) | New Table (Active) | Notes |
| :--- | :--- | :--- |
| `invoice_new` | **`invoice`** | All header data is now here. |
| `invoice_new_item` | **`invoice_new_item`** | Line items remain here but now link to `invoice.bubble_id`. |
| N/A | **`invoice_snapshot`** | **New:** Stores the full history/versions of every invoice as JSON. |

### Critical Column Mapping
The `invoice` table has been upgraded with the following columns to support the new features:

| Column Name | Description | Use Case |
| :--- | :--- | :--- |
| `invoice_number` | Human-readable ID (e.g., INV-000158) | Professional billing & search. |
| `customer_id` | **Integer** Link to Customer table | Fast, reliable SQL joins. |
| `total_amount` | Final Billing Amount (including SST) | Finance & Sales reporting. |
| `status` | Current state (draft, payment_submitted) | Workflow tracking. |
| `is_latest` | Boolean flag (TRUE/FALSE) | Filters for the most recent version of an invoice. |
| `share_token` | Secure sharing key | Public links for customers. |

---

## 3. New Feature: Invoice Snapshots
We have implemented a high-integrity **Snapshot System**. Every time an invoice is created or edited (versioned), a full copy of the invoice state (including all items and customer details at that moment) is saved in the `invoice_snapshot` table.

*   **Why?** This ensures that even if a customer changes their name or address next year, the historical invoice remains exactly as it was when it was issued.
*   **Access:** Queries can join `invoice.id` to `invoice_snapshot.invoice_id`.

---

## 4. Backward Compatibility
*   **Bubble.io Sync:** The sync from the legacy Bubble system remains fully operational. Bubble continues to write to the legacy columns (like `amount`, `linked_customer`, `case_status`), while the new system writes to the modernized columns.
*   **Legacy IDs:** The `bubble_id` (long string) is preserved and remains unique for all records.

## 5. Recommended Query Example
To get the latest invoices for a specific user with customer names:

```sql
SELECT 
    i.invoice_number, 
    i.total_amount, 
    i.status, 
    c.name as customer_name,
    i.created_at
FROM invoice i
JOIN customer c ON i.customer_id = c.id
WHERE i.is_latest = true
ORDER BY i.created_at DESC;
```

---

**Action Required:**
Please update any automated reports, Excel connectors, or SQL scripts that were pointing to `invoice_new` to point to `invoice` instead.

For technical assistance, please contact the ERP V2 development team.
