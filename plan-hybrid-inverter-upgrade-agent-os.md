# Hybrid Inverter Upgrade — Agent OS Feature Plan

**Date:** 2026-04-14  
**Author:** Zhihong  
**Target App:** Agent OS (Sales Agent app)  
**Reference Data:** EE-Admin-v5 (this repo, read-only reference for schema)

---

## WHY

Agents currently create invoices linked to a standard catalog package (string inverter). When a customer wants to upgrade to a hybrid inverter, there is no structured workflow — agents either manually edit the invoice or it doesn't happen at all.

This feature gives agents a guided, price-controlled upgrade path directly inside the invoice flow. The upgrade price is governed by the `hybrid_inverter_upgrade_rule` catalog managed in EE-Admin, so pricing stays consistent and admin-controlled.

---

## WHAT

When an agent opens an invoice, the system detects if the linked package contains a string inverter that has an available hybrid upgrade rule. If yes, the agent sees an "Upgrade to Hybrid" option. The agent selects the upgrade, and the system:

1. Clones the original package
2. Swaps the inverter to the hybrid model
3. Updates the package price (original + upgrade fee)
4. Marks the new package as `special = true` (custom, not a catalog package)
5. Replaces the invoice item's `linked_package` with the new custom package

The invoice total updates automatically. The original catalog package is never touched.

---

## CONSTRAINTS

- Never modify an existing package row — they are shared across invoices
- Never add line items for the upgrade fee — it is baked into the new package price
- The upgrade rules are read from `hybrid_inverter_upgrade_rule` (active = true only)
- Only one upgrade per invoice item (cannot upgrade twice)
- The custom package lives in the local Postgres DB only — it does not sync to Bubble

---

## DATA FLOW

```
Invoice
└── invoice_item (is_a_package = true)
      └── linked_package → [original catalog package]
                              ├── inverter_1 → product.bubble_id
                              └── price

Detection:
  package.inverter_1 (or 2/3/4)
    → match product.bubble_id
    → against hybrid_inverter_upgrade_rule.from_product_bubble_id
    → returns available upgrade rules

On Upgrade:
  1. Clone package row (new bubble_id: "hiup_${uuid}")
  2. Swap inverter_1 → rule.to_product_bubble_id
  3. Update invoice_desc → replace inverter line with hybrid inverter name
  4. Update price → original_price + rule.price_amount
  5. Set special = true, active = true
  6. Set package_name → "[HYBRID] {original_package_name}"
  7. UPDATE invoice_item.linked_package → new package bubble_id
```

---

## DATABASE

### No existing tables are altered.

### New table: `hybrid_inverter_upgrade_application`

Tracks every upgrade applied to an invoice item. Used for audit trail and to detect "already upgraded" state.

```sql
CREATE TABLE hybrid_inverter_upgrade_application (
  id                        bigserial PRIMARY KEY,
  bubble_id                 text NOT NULL UNIQUE,         -- "hiua_${uuid}"
  invoice_item_bubble_id    text NOT NULL,                -- invoice_item.bubble_id
  invoice_bubble_id         text NOT NULL,                -- invoice.bubble_id
  original_package_bubble_id text NOT NULL,               -- the catalog package before upgrade
  new_package_bubble_id     text NOT NULL,                -- the cloned custom package
  upgrade_rule_bubble_id    text NOT NULL,                -- hybrid_inverter_upgrade_rule.bubble_id
  upgrade_price_amount      numeric(12,2) NOT NULL,       -- price_amount at time of application
  applied_by                text,                         -- agent bubble_id or user id
  applied_at                timestamp with time zone DEFAULT now(),
  notes                     text,
  created_at                timestamp with time zone DEFAULT now(),
  updated_at                timestamp with time zone DEFAULT now()
);
```

---

## BUILD STEPS

### Step 1 — Schema migration (Agent OS DB)
- Add `hybrid_inverter_upgrade_application` table via migration file
- No changes to any existing table

---

### Step 2 — Server actions: detection

**`detectHybridUpgradeOptions(invoiceItemBubbleId)`**

1. Load the `invoice_item` by bubble_id → get `linked_package`
2. Load the `package` → read `inverter_1`, `inverter_2`, `inverter_3`, `inverter_4`
3. For each non-null inverter field, query `hybrid_inverter_upgrade_rule` where:
   - `from_product_bubble_id = inverter_x`
   - `active = true`
4. Also check `hybrid_inverter_upgrade_application` — if a row exists for this `invoice_item_bubble_id`, return `{ already_upgraded: true, application: ... }`
5. Return:
   ```ts
   {
     already_upgraded: boolean,
     original_package: { bubble_id, package_name, price, inverter_1 },
     upgrade_options: Array<{
       rule_bubble_id,
       phase_scope,           // "single_phase" | "three_phase"
       from_model_code,
       from_product_name_snapshot,
       to_model_code,
       to_product_name_snapshot,
       price_amount,          // the upgrade delta
       new_total_price,       // original_price + price_amount
       stock_ready,
     }>
   }
   ```

---

### Step 3 — Server actions: apply upgrade

**`applyHybridInverterUpgrade(invoiceItemBubbleId, upgradeRuleBubbleId, appliedBy?)`**

1. Load invoice_item → get `linked_package` bubble_id
2. Load original package row
3. Load upgrade rule by `upgradeRuleBubbleId`
4. Guard: check `hybrid_inverter_upgrade_application` — abort if already upgraded
5. Clone the package:
   - Generate new `bubble_id`: `hiup_${uuid}`
   - Copy all fields from original package
   - Swap `inverter_1` → `rule.to_product_bubble_id`
   - Update `invoice_desc` → replace the from-inverter line with to-inverter name
   - Set `price` → `original_price + rule.price_amount`
   - Set `special = true`
   - Set `package_name` → `[HYBRID] ${original_package_name}`
   - Set `active = true`
   - Clear `last_synced_at` (this is a local-only package)
6. INSERT new package row
7. UPDATE `invoice_item.linked_package` → new package bubble_id
8. INSERT `hybrid_inverter_upgrade_application` row
9. Revalidate invoice path
10. Return `{ success: true, new_package_bubble_id }`

---

### Step 4 — UI: Upgrade button on invoice item

On the invoice detail page, for each invoice item where `is_a_package = true`:

- Call `detectHybridUpgradeOptions()` on load
- If no upgrade options found → show nothing (silent)
- If `already_upgraded = true` → show a read-only badge "Hybrid Upgraded" with the applied rule info
- If upgrade options available → show "Upgrade to Hybrid" button

---

### Step 5 — UI: Upgrade selection modal

When agent clicks "Upgrade to Hybrid":

```
┌─────────────────────────────────────────────┐
│  Upgrade to Hybrid Inverter                 │
│                                             │
│  Current: [1P] SAJ R5 5KW String Inverter   │
│  Package: STRING SAJ JINKO 8 PCS — RM 19,100│
│                                             │
│  Select upgrade:                            │
│  ○ Single Phase → SAJ H2 5KW   +RM 875      │
│    New total: RM 19,975                     │
│    ⚠ Stock not ready                        │
│                                             │
│  ○ Three Phase → SAJ H2 8KW   +RM 3,330     │
│    New total: RM 22,430                     │
│    ⚠ Stock not ready                        │
│                                             │
│  [Cancel]              [Apply Upgrade]      │
└─────────────────────────────────────────────┘
```

- Show `stock_ready` warning if false (agent can still proceed)
- Confirm before applying
- On success: refresh invoice, show "Hybrid Upgraded" badge

---

### Step 6 — invoice_desc cloning logic (important detail)

The `invoice_desc` is a multiline text block. Each line is a product/service description. The upgrade needs to find and replace the inverter line.

Strategy:
- The original package has `from_product_name_snapshot` (e.g. `[1P] SAJ R5 5KW String Inverter`)
- Search `invoice_desc` for a line containing that name
- Replace it with `to_product_name_snapshot` (e.g. `[1P] SAJ H2 5KW SINGLE PHASE Hybird Inverter`)
- If no match found → append the new inverter line and append a note that original line was not replaced

---

### Step 7 — Reversal (optional, future)

Not in scope for v1. But the `hybrid_inverter_upgrade_application` table has everything needed to reverse:
- Restore `invoice_item.linked_package` → `original_package_bubble_id`
- Delete or deactivate the custom package
- Delete the application row

---

## SUMMARY TABLE

| What | Where | Operation |
|------|-------|-----------|
| Detect upgrade options | Server action | READ package + READ rules |
| Clone package | Server action | INSERT new package row |
| Swap invoice item | Server action | UPDATE invoice_item.linked_package |
| Record audit trail | Server action | INSERT hybrid_inverter_upgrade_application |
| Show upgrade UI | Invoice detail page | New button + modal |
| Mark custom package | package.special | = true (existing convention) |

---

## FILES TO CREATE IN AGENT OS

```
src/
  db/
    migrations/
      XXXX_add_hybrid_upgrade_application.sql
  app/
    invoices/
      [id]/
        hybrid-upgrade/
          actions.ts        ← detectHybridUpgradeOptions, applyHybridInverterUpgrade
          UpgradeModal.tsx  ← selection modal UI
          UpgradeBadge.tsx  ← read-only "already upgraded" state
```

---

## OPEN QUESTIONS FOR AGENT OS DEV

1. Does Agent OS have its own local copy of `hybrid_inverter_upgrade_rule`, or does it query EE-Admin's DB directly?
2. Does Agent OS sync the `package` table from Bubble, same as EE-Admin?
3. Is there an existing invoice detail page in Agent OS to attach the upgrade button to?
4. Should the custom package (`hiup_*`) be excluded from the package search/switch UI so agents don't accidentally select it for other invoices?
