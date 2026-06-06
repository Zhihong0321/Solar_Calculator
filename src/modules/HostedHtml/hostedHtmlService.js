const crypto = require('crypto');
const path = require('path');
const pool = require('../../core/database/pool');

const MAX_TITLE_LEN = 200;
const MAX_DESC_LEN = 1000;
const SLUG_LEN = 16; // 8 random bytes → 16 hex chars
const AI_OWNER_USER_ID = 'ai:hostmyapp';
const AI_OWNER_BUBBLE_ID = 'ai:hostmyapp';

function generateSlug() {
    return crypto.randomBytes(8).toString('hex');
}

function buildStoragePath(slug) {
    const root = process.env.RAILWAY_VOLUME_MOUNT_PATH
        || path.resolve(__dirname, '../../../storage');
    return path.join(root, 'hosted_html', slug, 'index.html');
}

function rowToDto(row) {
    if (!row) return null;
    return {
        id: String(row.id),
        slug: row.slug,
        friendlySlug: row.friendly_slug,
        title: row.title,
        description: row.description,
        ownerUserId: row.owner_user_id,
        ownerBubbleId: row.owner_bubble_id,
        ownerName: row.owner_name,
        sizeBytes: row.size_bytes,
        status: row.status,
        viewCount: Number(row.view_count || 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        disabledAt: row.disabled_at,
        lastViewedAt: row.last_viewed_at
    };
}

// Allowed characters for friendly slugs. Lowercase letters, digits, dashes,
// underscores. 2-64 chars. Enforced at the API layer too.
const FRIENDLY_SLUG_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const MAX_FRIENDLY_SLUG_LEN = 64;

function validateFriendlySlug(slug) {
    if (slug == null || slug === '') return null; // null/empty is allowed (i.e. unset)
    if (typeof slug !== 'string') return 'friendlySlug must be a string.';
    const trimmed = slug.trim().toLowerCase();
    if (trimmed.length === 0) return null;
    if (trimmed.length > MAX_FRIENDLY_SLUG_LEN) {
        return `friendlySlug must be ≤${MAX_FRIENDLY_SLUG_LEN} characters.`;
    }
    if (!FRIENDLY_SLUG_RE.test(trimmed)) {
        return 'friendlySlug may only contain lowercase letters, digits, dashes, and underscores (2-64 chars).';
    }
    return null;
}

function normalizeFriendlySlug(slug) {
    if (slug == null) return null;
    const trimmed = String(slug).trim().toLowerCase();
    return trimmed.length === 0 ? null : trimmed;
}

async function createHostedApp({
    ownerUserId,
    ownerBubbleId,
    ownerName,
    ownerEmail,
    title,
    description,
    friendlySlug,
    htmlContent,
    storagePath
}) {
    const slug = generateSlug();
    const sizeBytes = Buffer.byteLength(htmlContent, 'utf8');
    const friendly = normalizeFriendlySlug(friendlySlug);

    const insert = await pool.query(
        `INSERT INTO hosted_html_app
            (slug, friendly_slug, title, description, owner_user_id, owner_bubble_id, owner_name, owner_email, storage_path, size_bytes, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'published', NOW(), NOW())
         RETURNING *`,
        [slug, friendly, title, description || null, ownerUserId, ownerBubbleId || null, ownerName || null, ownerEmail || null, storagePath, sizeBytes]
    );
    return rowToDto(insert.rows[0]);
}

async function createHostedAppByAi({ creatorName, title, description, friendlySlug, htmlContent, storagePath }) {
    const slug = generateSlug();
    const sizeBytes = Buffer.byteLength(htmlContent, 'utf8');
    const friendly = normalizeFriendlySlug(friendlySlug);
    const meta = { created_via: 'api', api_key: 'hostmyapp' };

    const insert = await pool.query(
        `INSERT INTO hosted_html_app
            (slug, friendly_slug, title, description, owner_user_id, owner_bubble_id, owner_name, owner_email, storage_path, size_bytes, status, metadata_json, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, $9, 'published', $10::jsonb, NOW(), NOW())
         RETURNING *`,
        [
            slug,
            friendly,
            title,
            description || null,
            AI_OWNER_USER_ID,
            AI_OWNER_BUBBLE_ID,
            creatorName,
            storagePath,
            sizeBytes,
            JSON.stringify(meta)
        ]
    );
    return rowToDto(insert.rows[0]);
}

async function issueHostedAppByAi({ creatorName, title, description, friendlySlug, storagePath, placeholderSize }) {
    const slug = generateSlug();
    const friendly = normalizeFriendlySlug(friendlySlug);
    const meta = { created_via: 'api', api_key: 'hostmyapp', issued_only: true };

    const insert = await pool.query(
        `INSERT INTO hosted_html_app
            (slug, friendly_slug, title, description, owner_user_id, owner_bubble_id, owner_name, owner_email, storage_path, size_bytes, status, metadata_json, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, $9, 'pending', $10::jsonb, NOW(), NOW())
         RETURNING *`,
        [
            slug,
            friendly,
            title,
            description || null,
            AI_OWNER_USER_ID,
            AI_OWNER_BUBBLE_ID,
            creatorName,
            storagePath,
            placeholderSize,
            JSON.stringify(meta)
        ]
    );
    return rowToDto(insert.rows[0]);
}

async function publishIssuedAppByAi({ id, storagePath, sizeBytes, htmlContent }) {
    // htmlContent is kept off-row; the file on disk is the source of truth.
    void htmlContent;
    const result = await pool.query(
        `UPDATE hosted_html_app
            SET status = 'published',
                storage_path = $1,
                size_bytes = $2,
                disabled_at = NULL,
                updated_at = NOW(),
                metadata_json = metadata_json || jsonb_build_object('issued_only', false, 'published_via', 'api')
          WHERE id = $3 AND owner_user_id = $4
          RETURNING *`,
        [storagePath, sizeBytes, id, AI_OWNER_USER_ID]
    );
    return rowToDto(result.rows[0]);
}

async function listAppsByOwnerUserId(ownerUserId, { includeDisabled = true } = {}) {
    const params = [ownerUserId];
    let where = 'owner_user_id = $1';
    if (!includeDisabled) {
        where += " AND status = 'published'";
    }
    const result = await pool.query(
        `SELECT * FROM hosted_html_app
          WHERE ${where}
          ORDER BY created_at DESC
          LIMIT 200`,
        params
    );
    return result.rows.map(rowToDto);
}

async function getAppByIdAndOwner({ id, ownerUserId }) {
    const result = await pool.query(
        `SELECT * FROM hosted_html_app
          WHERE id = $1 AND owner_user_id = $2
          LIMIT 1`,
        [id, ownerUserId]
    );
    return rowToDto(result.rows[0]);
}

async function setStatusForOwner({ id, ownerUserId, status }) {
    const disabledClause = status === 'disabled' ? ', disabled_at = NOW()' : ', disabled_at = NULL';
    const result = await pool.query(
        `UPDATE hosted_html_app
            SET status = $1,
                updated_at = NOW()${disabledClause}
          WHERE id = $2 AND owner_user_id = $3
          RETURNING *`,
        [status, id, ownerUserId]
    );
    return rowToDto(result.rows[0]);
}

async function listMyApps({ ownerUserId, includeDisabled = true }) {
    const params = [ownerUserId];
    let where = 'owner_user_id = $1';
    if (!includeDisabled) {
        where += " AND status = 'published'";
    }
    const result = await pool.query(
        `SELECT * FROM hosted_html_app
          WHERE ${where}
          ORDER BY created_at DESC
          LIMIT 200`,
        params
    );
    return result.rows.map(rowToDto);
}

async function getAppByIdForOwner({ id, ownerUserId }) {
    const result = await pool.query(
        `SELECT * FROM hosted_html_app
          WHERE id = $1 AND owner_user_id = $2
          LIMIT 1`,
        [id, ownerUserId]
    );
    return rowToDto(result.rows[0]);
}

async function getAppBySlug(slug) {
    const result = await pool.query(
        `SELECT * FROM hosted_html_app
          WHERE slug = $1
          LIMIT 1`,
        [slug]
    );
    return rowToDto(result.rows[0]);
}

async function getAppByFriendlySlug(friendlySlug) {
    const result = await pool.query(
        `SELECT * FROM hosted_html_app
          WHERE friendly_slug = $1 AND status = 'published'
          LIMIT 1`,
        [friendlySlug]
    );
    return rowToDto(result.rows[0]);
}

async function updateApp({ id, ownerUserId, patch, newStoragePath, newSizeBytes }) {
    const fields = [];
    const values = [];
    let i = 1;

    if (typeof patch.title === 'string') {
        fields.push(`title = $${i++}`);
        values.push(patch.title);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'description')) {
        fields.push(`description = $${i++}`);
        values.push(patch.description || null);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'friendlySlug')) {
        fields.push(`friendly_slug = $${i++}`);
        values.push(normalizeFriendlySlug(patch.friendlySlug));
    }
    if (newStoragePath) {
        fields.push(`storage_path = $${i++}`);
        values.push(newStoragePath);
        fields.push(`size_bytes = $${i++}`);
        values.push(newSizeBytes);
    }
    if (fields.length === 0) return getAppByIdForOwner({ id, ownerUserId });

    fields.push(`updated_at = NOW()`);
    values.push(id, ownerUserId);

    const result = await pool.query(
        `UPDATE hosted_html_app
            SET ${fields.join(', ')}
          WHERE id = $${i++} AND owner_user_id = $${i++}
          RETURNING *`,
        values
    );
    return rowToDto(result.rows[0]);
}

async function setStatus({ id, ownerUserId, status }) {
    const disabledClause = status === 'disabled' ? ', disabled_at = NOW()' : ', disabled_at = NULL';
    const result = await pool.query(
        `UPDATE hosted_html_app
            SET status = $1,
                updated_at = NOW()${disabledClause}
          WHERE id = $2 AND owner_user_id = $3
          RETURNING *`,
        [status, id, ownerUserId]
    );
    return rowToDto(result.rows[0]);
}

async function incrementViewCount(id) {
    try {
        await pool.query(
            `UPDATE hosted_html_app
                SET view_count = view_count + 1,
                    last_viewed_at = NOW()
              WHERE id = $1`,
            [id]
        );
    } catch (err) {
        // Best-effort — don't fail the public response if counter write fails.
        console.error('[HostedHtml] incrementViewCount failed:', err.message);
    }
}

module.exports = {
    SLUG_LEN,
    MAX_TITLE_LEN,
    MAX_DESC_LEN,
    MAX_FRIENDLY_SLUG_LEN,
    FRIENDLY_SLUG_RE,
    AI_OWNER_USER_ID,
    AI_OWNER_BUBBLE_ID,
    generateSlug,
    buildStoragePath,
    validateFriendlySlug,
    normalizeFriendlySlug,
    createHostedApp,
    createHostedAppByAi,
    issueHostedAppByAi,
    publishIssuedAppByAi,
    listMyApps,
    listAppsByOwnerUserId,
    getAppByIdForOwner,
    getAppByIdAndOwner,
    getAppBySlug,
    getAppByFriendlySlug,
    updateApp,
    setStatus,
    setStatusForOwner,
    incrementViewCount
};
