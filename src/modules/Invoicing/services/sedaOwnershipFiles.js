'use strict';

// Production property_ownership_prove is TEXT, not TEXT[]. Keep legacy URL
// values readable and persist multiple files as JSON text in the same column.
function ownershipFiles(value) {
    if (Array.isArray(value)) return value.filter(url => typeof url === 'string' && url.trim());
    if (typeof value !== 'string' || !value.trim()) return [];
    const text = value.trim();
    if (text.startsWith('[')) return ownershipFiles(JSON.parse(text));
    return [text];
}

const OWNERSHIP_LIST_SQL = `CASE
    WHEN property_ownership_prove IS NULL OR btrim(property_ownership_prove) = '' THEN '[]'::jsonb
    WHEN left(btrim(property_ownership_prove), 1) = '[' THEN property_ownership_prove::jsonb
    ELSE jsonb_build_array(property_ownership_prove)
END`;

function appendOwnershipFileSql() {
    return `UPDATE seda_registration
        SET property_ownership_prove = ((${OWNERSHIP_LIST_SQL}) || jsonb_build_array($1::text))::text,
            modified_date = NOW(), updated_at = NOW()
        WHERE bubble_id = $2
          AND jsonb_array_length(${OWNERSHIP_LIST_SQL}) < $3`;
}

function removeOwnershipFileSql() {
    return `UPDATE seda_registration
        SET property_ownership_prove = (
            SELECT COALESCE(jsonb_agg(file_url ORDER BY position), '[]'::jsonb)::text
            FROM jsonb_array_elements_text(${OWNERSHIP_LIST_SQL}) WITH ORDINALITY AS files(file_url, position)
            WHERE file_url <> $1::text
        ), modified_date = NOW(), updated_at = NOW()
        WHERE bubble_id = $2`;
}

module.exports = { ownershipFiles, OWNERSHIP_LIST_SQL, appendOwnershipFileSql, removeOwnershipFileSql };
