# Bubble `support_ticket` — Reference Schema

> Source: Bubble Data API (live)  
> Endpoint: `https://eternalgy.com/api/1.1/obj/support_ticket`  
> API object name: `support_ticket`  
> Records captured: **107**  
> Date range: 2025-05-16 to 2026-06-27  
> Generated: 2026-07-01

---

## 1. Record Count & Status Distribution

| Status            | Count |
|-------------------|-------|
| `solved`          | 91    |
| `read by support` | 5     |
| `processing`      | 3     |
| *(blank)*         | 1     |
| **Total**         | **107** |

Observed option values: `solved`, `read by support`, `processing`, `unread` (the last 7 records all use `unread`).

---

## 2. Field Schema

| Bubble field ID | API response key | Display label | Type | Notes |
|-----------------|------------------|---------------|------|-------|
| `_id` | `_id` | unique ID | `text` | Primary Bubble ID. Stable external ID. |
| `title_text` | `Title` | Title | `text` | Short subject of the ticket. |
| `problem_description_text` | `Problem description` | Problem description | `text` | Long-form description from the customer. |
| `technician_remark_text` | `technician remark` | technician remark | `text` | Internal technician notes / resolution notes. |
| `status_option_support_ticket_status` | `status` | status | `option.support_ticket_status` | Current ticket state. |
| `link_customer_custom_customer_profile` | `link customer` | link customer | `custom.customer_profile` | Foreign key → `customer_profile._id`. 94/107 populated. |
| `assigned_to_user` | `Assigned to` | Assigned to | `user` | **Currently unused** (0/107 populated). |
| `images_list_image` | `images` | images | `list.image` | Array of Bubble CDN image URLs. 74/107 tickets have images. |
| `Created By` | `Created By` | Created By | `user` | Bubble user ID of the creator. |
| `Created Date` | `Created Date` | Created Date | `date` | ISO 8601 UTC. |
| `Modified Date` | `Modified Date` | Modified Date | `date` | ISO 8601 UTC. |
| `Slug` | `Slug` | Slug | `text` | Auto-generated Bubble slug. |

---

## 3. Sample Record (latest solved)

```json
{
  "_id": "1747401122419x864000907806244900",
  "status": "solved",
  "Created By": "1695099960487x712701335658012500",
  "Created Date": "2025-05-16T13:12:02.957Z",
  "Title": "Solar System Trip",
  "Modified Date": "2025-11-04T11:06:56.951Z",
  "technician remark": "16/5/2025-breaker operating failure. sugest to change the breaker if the issue occur.\n\n22/5/2025-will close this ticket. Please open new ticket if the issue happen again.\n\n\nAlready replace the breaker\n",
  "Problem description": "Solar breaker trip",
  "link customer": "1709120502385x475631024142024700"
}
```

---

## 4. Sample Record (with images)

```json
{
  "_id": "1772699802850x409888290872492000",
  "status": "read by support",
  "Created By": "1705557637059x292766633570082050",
  "Created Date": "2026-03-05T08:36:43.578Z",
  "Title": "Leaking issue ",
  "Modified Date": "2026-03-30T10:28:46.669Z",
  "images": [
    "//a317bcce3a4814c60687fe307b0dbe6b.cdn.bubble.io/f1772699630817x517059587896036900/PHOTO-2026-03-05-15-56-35.jpeg",
    "//a317bcce3a4814c60687fe307b0dbe6b.cdn.bubble.io/f1772699641216x232116395732721700/PHOTO-2026-03-05-15-56-37%202.jpeg",
    "//a317bcce3a4814c60687fe307b0dbe6b.cdn.bubble.io/f1772699649727x267239852913876640/PHOTO-2026-03-05-15-56-36%202.jpeg",
    "//a317bcce3a4814c60687fe307b0dbe6b.cdn.bubble.io/f1772699658629x119508311986330500/PHOTO-2026-03-05-15-56-37.jpeg"
  ],
  "Problem description": "This house installation date : 25/2/2026 located at KLUANG \n\nIn the past few days, there has been a water leakage issue in the master bedroom and wardrobe there \n\nPlease arrange to come and inspect the issue \nThanks ",
  "link customer": "1770044112956x683037043559759900"
}
```

---

## 5. Field Usage Summary

| Field | Populated | Notes |
|-------|-----------|-------|
| `_id` | 107/107 | Always present. |
| `Title` | 107/107 | Always present. |
| `Problem description` | 107/107 | Always present. |
| `technician remark` | 85/107 | Often empty for unread/processing tickets. |
| `status` | 106/107 | One record has no status. |
| `link customer` | 94/107 | Required for most tickets; 13 unlinked. |
| `Assigned to` | 0/107 | Not used historically. |
| `images` | 74/107 | Array of 1–6 CDN URLs when present. |
| `Created By` | 107/107 | 20 distinct Bubble users created tickets. |
| `Created Date` / `Modified Date` | 107/107 | System timestamps. |

---

## 6. Relationship Map

```
support_ticket._id                         (primary)
├── support_ticket.status                  option set
├── support_ticket.Created By      ──────► user._id
├── support_ticket.Assigned to     ──────► user._id   (unused)
├── support_ticket.link customer   ──────► customer_profile._id
└── support_ticket.images[]                Bubble CDN URLs (no DB relation)
```

---

## 7. Migration Notes for ERP

- **Primary key**: Use Bubble `_id` as `bubble_id` in the ERP table, or map it to a new serial PK while keeping `bubble_id` unique.
- **Status options**: Map Bubble option values to an ERP enum. Suggested: `unread`, `read by support`, `processing`, `solved`. Consider adding `closed`/`cancelled` if the ERP needs them.
- **Customer link**: The `link customer` value is the Bubble `customer_profile._id`. The ERP must either (a) already have those customer profiles migrated with the same `bubble_id`, or (b) keep a nullable `customer_bubble_id` column and resolve after customer migration.
- **Creator / assignee**: Bubble `Created By` and `Assigned to` are Bubble `user._id`s. The ERP likely uses `user.bubble_id` as canonical identity (per project memory). Resolve creators via `user.bubble_id`.
- **Images**: Store as an array of URLs, or download to ERP storage and store local paths. Bubble CDN URLs are protocol-relative (`//...`); prefix with `https:` for storage.
- **Text fields**: `Title`, `Problem description`, and `technician remark` are plain text with line breaks. No rich formatting detected.
- **Timestamps**: Preserve `Created Date` and `Modified Date` as `created_at` / `updated_at` rather than regenerating them.
- **Soft delete**: Bubble has no built-in `deleted` flag. All 107 records appear active.

---

## 8. Suggested ERP Table Shape (Draft)

```sql
CREATE TABLE support_ticket (
  id SERIAL PRIMARY KEY,
  bubble_id VARCHAR(255) NOT NULL UNIQUE,
  title TEXT NOT NULL,
  problem_description TEXT,
  technician_remark TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'unread',
  customer_bubble_id VARCHAR(255) REFERENCES customer(bubble_id),
  created_by_bubble_id VARCHAR(255),
  assigned_to_bubble_id VARCHAR(255),
  images JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  migrated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

> This is a starting schema only — finalize field lengths, constraints, and foreign keys once the ERP `customer` and `user` table shapes are confirmed.

---

## 9. Open Questions Before Migration

1. Should `Assigned to` be enabled in the ERP, or remain unused like in Bubble?
2. Should images be hot-linked to Bubble CDN or downloaded into the ERP file store?
3. Are there any customer profiles linked by tickets that no longer exist in Bubble? (13 tickets have no customer link.)
4. Do the 20 distinct Bubble creator user IDs exist in the ERP `user` table?
5. Should the ERP expose a customer-facing ticket portal, or keep this internal-only?
