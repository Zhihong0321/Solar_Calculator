# Invoice Snapshot System: Architecture & Migration Guide

## Overview
In the ERP v2 architecture, invoices are designed to be **immutable historical records**. To achieve this, we use a "Snapshot Pattern". When an invoice is created or finalized, we copy relevant details (like Customer Name, Address, Package Name) directly into the `invoice` table columns.

This ensures that if a Customer changes their name or address in the future, **historical invoices do not change**. They preserve the state of truth at the moment of creation.

## The Problem: ERP v1 Migration
The legacy system (ERP v1 on Bubble.io) relied purely on relational links. It did not store snapshots. When an invoice was displayed, it dynamically fetched the *current* customer name.

When data was migrated to ERP v2 (PostgreSQL), the relational links (`customer_id`, `linked_customer`) were preserved, but the new snapshot columns (`customer_name_snapshot`, `package_name_snapshot`, etc.) were left **NULL** for these legacy records.

### Consequence
The new `/my-invoice` dashboard is optimized for performance. It reads from the `invoice` table directly (using snapshots) instead of performing expensive JOINs on every query. As a result, migrated invoices appear with "Unknown" customer names.

## The Solution: Batch Recompile
To fix this, we implement a "Batch Recompile" function. This is a maintenance routine that:
1.  Iterates through invoices with missing snapshots.
2.  Follows the `customer_id` (Foreign Key) to the live `customer` record.
3.  Copies the *current* customer details into the snapshot columns.
4.  Updates the invoice record.

**Note:** For legacy data, using the "current" customer name is the best available approximation of history.

## Schema Reference
- **`customer_name_snapshot`** (Text): The primary display name.
- **`customer_email_snapshot`** (Text): Archived email.
- **`customer_address_snapshot`** (Text): Archived address.
- **`customer_phone_snapshot`** (Text): Archived phone.
- **`package_name_snapshot`** (Text): Name of the solar package sold.

## Future Usage
All new invoices created via the v2 `InvoiceService` automatically populate these fields. This recompile tool is primarily for:
- Fixing migration gaps.
- Repairing data integrity if a manual database edit breaks a link.
