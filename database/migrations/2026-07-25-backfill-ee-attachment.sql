-- Backfill legacy invoice upload columns into ee_attachment.
--
-- Sources:
--   invoice.linked_roof_image     (text[])  -> doc_type 'roof_angle'
--   invoice.site_assessment_image (text[])  -> doc_type 'site_other'
--   recycle_bin_upload rows for those two field_keys -> same, with deleted_at set
--
-- 'site_other' rather than one of the eight real slots: the legacy column was an
-- undifferentiated dump, and relabelling those photos as (say) 'house_front'
-- would be inventing information. Agents can reclassify from the UI.
--
-- IDEMPOTENT AND RE-RUNNABLE. Guarded on (owner_type, owner_id, file_url), so
-- running it twice is a no-op. That matters: agents keep uploading through the
-- old endpoint until the new checklist UI ships, so this is run once now and
-- again at cutover to sweep up whatever arrived in between.
--
-- uploaded_at is set from invoice.created_at, not NOW(). The real upload time
-- was never recorded on the array columns; defaulting would claim every legacy
-- photo was taken on backfill day. metadata_json.uploaded_at_imputed marks it.
--
-- pv_system_drawing is deliberately NOT backfilled — that section keeps its own
-- UI and its Engineering-request flow, and still reads the legacy column.

-- ─── 1. Active roof images ───────────────────────────────────────────────────
INSERT INTO ee_attachment (
    owner_type, owner_id, linked_customer, module,
    category, doc_type, sort_order,
    file_url, storage_subdir, storage_key, original_filename, mime_type,
    uploaded_at, metadata_json
)
SELECT
    'invoice',
    i.bubble_id,
    i.linked_customer,
    'invoice-office',
    'site_assessment',
    'roof_angle',
    f.ord - 1,
    f.url,
    'roof_images',
    'roof_images/' || regexp_replace(split_part(f.url, '?', 1), '^.*/', ''),
    regexp_replace(split_part(f.url, '?', 1), '^.*/', ''),
    CASE lower(regexp_replace(split_part(f.url, '?', 1), '^.*\.', ''))
        WHEN 'jpg'  THEN 'image/jpeg'
        WHEN 'jpeg' THEN 'image/jpeg'
        WHEN 'png'  THEN 'image/png'
        WHEN 'webp' THEN 'image/webp'
        WHEN 'gif'  THEN 'image/gif'
        WHEN 'heic' THEN 'image/heic'
        WHEN 'heif' THEN 'image/heif'
        WHEN 'pdf'  THEN 'application/pdf'
        ELSE NULL
    END,
    COALESCE(i.created_at, NOW()),
    jsonb_build_object(
        'backfill', jsonb_build_object('source', 'invoice.linked_roof_image', 'ordinal', f.ord),
        'uploaded_at_imputed', true
    )
FROM invoice i
CROSS JOIN LATERAL unnest(i.linked_roof_image) WITH ORDINALITY AS f(url, ord)
WHERE i.linked_roof_image IS NOT NULL
  AND f.url IS NOT NULL
  AND btrim(f.url) <> ''
  AND NOT EXISTS (
      SELECT 1 FROM ee_attachment a
      WHERE a.owner_type = 'invoice' AND a.owner_id = i.bubble_id AND a.file_url = f.url
  );

-- ─── 2. Active site assessment images ────────────────────────────────────────
INSERT INTO ee_attachment (
    owner_type, owner_id, linked_customer, module,
    category, doc_type, sort_order,
    file_url, storage_subdir, storage_key, original_filename, mime_type,
    uploaded_at, metadata_json
)
SELECT
    'invoice',
    i.bubble_id,
    i.linked_customer,
    'invoice-office',
    'site_assessment',
    'site_other',
    f.ord - 1,
    f.url,
    'site_assessment_images',
    'site_assessment_images/' || regexp_replace(split_part(f.url, '?', 1), '^.*/', ''),
    regexp_replace(split_part(f.url, '?', 1), '^.*/', ''),
    CASE lower(regexp_replace(split_part(f.url, '?', 1), '^.*\.', ''))
        WHEN 'jpg'  THEN 'image/jpeg'
        WHEN 'jpeg' THEN 'image/jpeg'
        WHEN 'png'  THEN 'image/png'
        WHEN 'webp' THEN 'image/webp'
        WHEN 'gif'  THEN 'image/gif'
        WHEN 'heic' THEN 'image/heic'
        WHEN 'heif' THEN 'image/heif'
        WHEN 'pdf'  THEN 'application/pdf'
        ELSE NULL
    END,
    COALESCE(i.created_at, NOW()),
    jsonb_build_object(
        'backfill', jsonb_build_object('source', 'invoice.site_assessment_image', 'ordinal', f.ord),
        'uploaded_at_imputed', true
    )
FROM invoice i
CROSS JOIN LATERAL unnest(i.site_assessment_image) WITH ORDINALITY AS f(url, ord)
WHERE i.site_assessment_image IS NOT NULL
  AND f.url IS NOT NULL
  AND btrim(f.url) <> ''
  AND NOT EXISTS (
      SELECT 1 FROM ee_attachment a
      WHERE a.owner_type = 'invoice' AND a.owner_id = i.bubble_id AND a.file_url = f.url
  );

-- ─── 3. Soft-deleted files still sitting in the recycle bin ──────────────────
-- Runs last on purpose: the NOT EXISTS guard means a URL that is both active and
-- present in the recycle bin (restore/re-delete churn) keeps its active row.
INSERT INTO ee_attachment (
    owner_type, owner_id, linked_customer, module,
    category, doc_type, sort_order,
    file_url, storage_subdir, storage_key, original_filename, mime_type,
    uploaded_at,
    deleted_at, deleted_by, deleted_by_name,
    metadata_json
)
SELECT
    'invoice',
    r.linked_record_id,
    i.linked_customer,
    'invoice-office',
    'site_assessment',
    CASE r.field_key WHEN 'roof_images' THEN 'roof_angle' ELSE 'site_other' END,
    0,
    r.file_url,
    r.storage_subdir,
    COALESCE(r.storage_subdir, '') || '/' || regexp_replace(split_part(r.file_url, '?', 1), '^.*/', ''),
    COALESCE(r.original_filename, regexp_replace(split_part(r.file_url, '?', 1), '^.*/', '')),
    r.mime_type,
    COALESCE(i.created_at, r.deleted_at),
    r.deleted_at,
    r.deleted_by,
    r.deleted_by_name,
    jsonb_build_object(
        'backfill', jsonb_build_object('source', 'recycle_bin_upload', 'recycle_bin_id', r.id),
        'uploaded_at_imputed', true
    )
FROM recycle_bin_upload r
LEFT JOIN invoice i ON i.bubble_id = r.linked_record_id
WHERE r.linked_record_type = 'invoice'
  AND r.field_key IN ('roof_images', 'site_assessment_images')
  AND r.restored_at IS NULL
  AND r.purged_at IS NULL
  AND r.file_url IS NOT NULL
  AND btrim(r.file_url) <> ''
  AND NOT EXISTS (
      SELECT 1 FROM ee_attachment a
      WHERE a.owner_type = 'invoice' AND a.owner_id = r.linked_record_id AND a.file_url = r.file_url
  );

-- ─── 4. Derive any still-missing mime types from the file extension ──────────
-- recycle_bin_upload.mime_type was never populated: softDeleteInvoiceOfficeFile
-- builds its entry without a mimeType, so every recycle-bin row imported above
-- arrives with a NULL. The UI needs it to choose an image tile vs a PDF row.
UPDATE ee_attachment
SET mime_type = CASE lower(regexp_replace(split_part(file_url, '?', 1), '^.*\.', ''))
        WHEN 'jpg'  THEN 'image/jpeg'
        WHEN 'jpeg' THEN 'image/jpeg'
        WHEN 'png'  THEN 'image/png'
        WHEN 'webp' THEN 'image/webp'
        WHEN 'gif'  THEN 'image/gif'
        WHEN 'heic' THEN 'image/heic'
        WHEN 'heif' THEN 'image/heif'
        WHEN 'pdf'  THEN 'application/pdf'
        ELSE NULL
    END
WHERE mime_type IS NULL;
