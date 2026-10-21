const path = require('path');
const express = require('express');
const pool = require('../../core/database/pool');
const { requireAuth } = require('../../core/middleware/auth');
const {
  getCanonicalUserIdentity,
  getRequestUserBubbleId,
  getRequestLegacyUserId
} = require('../../core/auth/userIdentity');

const router = express.Router();

const MAX_TITLE = 100;
const MAX_DESCRIPTION = 300;
const MAX_URL = 2000;
const CATEGORIES = ['Sales - Competition', 'Sales - Tools & Report', 'Other'];

function normalizeUrl(raw) {
  const value = String(raw || '').trim();
  if (!value || value.length > MAX_URL) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch (err) {
    return null;
  }
}

// Returns { fields } on success or { error } with a message for a 400 response.
function parseToolInput(body) {
  const title = String(body?.title || '').trim();
  const shortDescription = String(body?.shortDescription || '').trim();
  const url = normalizeUrl(body?.url);
  const category = String(body?.category || '').trim();

  if (!title || title.length > MAX_TITLE) {
    return { error: `Title is required (max ${MAX_TITLE} characters).` };
  }
  if (!CATEGORIES.includes(category)) {
    return { error: 'Please choose a category.' };
  }
  if (!shortDescription || shortDescription.length > MAX_DESCRIPTION) {
    return { error: `Short description is required (max ${MAX_DESCRIPTION} characters).` };
  }
  if (!url) {
    return { error: 'URL must be a valid link starting with http:// or https://.' };
  }
  return { fields: { title, shortDescription, url, category } };
}

function parseToolId(raw) {
  const id = Number.parseInt(raw, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function getRequestIdentities(req) {
  return [getRequestUserBubbleId(req), getRequestLegacyUserId(req)].filter(Boolean);
}

router.get('/external-tools', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', '..', 'public', 'templates', 'external_tools.html'));
});

router.get('/api/external-tools', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.id, t.title, t.short_description, t.url, t.category, t.created_at, u.name AS author_name,
              t.created_by = ANY($1::text[]) AS is_owner
       FROM external_tool t
       LEFT JOIN LATERAL (
         SELECT name FROM "user"
         WHERE bubble_id = t.created_by OR id::text = t.created_by
         LIMIT 1
       ) u ON true
       ORDER BY t.created_at DESC, t.id DESC`,
      [getRequestIdentities(req)]
    );
    res.set('Cache-Control', 'no-store');
    return res.json({ success: true, categories: CATEGORIES, tools: result.rows });
  } catch (err) {
    console.error('[External Tools] Failed to list tools:', err);
    return res.status(500).json({ success: false, error: 'Failed to load external tools.' });
  }
});

router.post('/api/external-tools', requireAuth, express.json(), async (req, res) => {
  try {
    const createdBy = getCanonicalUserIdentity(req);
    if (!createdBy) {
      return res.status(401).json({ success: false, error: 'Invalid session data.' });
    }

    const { fields, error } = parseToolInput(req.body);
    if (error) {
      return res.status(400).json({ success: false, error });
    }
    const { title, shortDescription, url, category } = fields;

    const result = await pool.query(
      `INSERT INTO external_tool (title, short_description, url, category, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [title, shortDescription, url, category, createdBy]
    );
    return res.status(201).json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error('[External Tools] Failed to publish tool:', err);
    return res.status(500).json({ success: false, error: 'Failed to publish the tool.' });
  }
});

router.put('/api/external-tools/:id', requireAuth, express.json(), async (req, res) => {
  try {
    const identities = getRequestIdentities(req);
    if (identities.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid session data.' });
    }

    const id = parseToolId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: 'Invalid tool id.' });
    }

    const { fields, error } = parseToolInput(req.body);
    if (error) {
      return res.status(400).json({ success: false, error });
    }
    const { title, shortDescription, url, category } = fields;

    // Only the owner can edit; someone else's id behaves like a missing one.
    const result = await pool.query(
      `UPDATE external_tool
       SET title = $1, short_description = $2, url = $3, category = $4
       WHERE id = $5 AND created_by = ANY($6::text[])`,
      [title, shortDescription, url, category, id, identities]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Tool not found, or you are not its owner.' });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('[External Tools] Failed to update tool:', err);
    return res.status(500).json({ success: false, error: 'Failed to update the tool.' });
  }
});

router.delete('/api/external-tools/:id', requireAuth, async (req, res) => {
  try {
    const identities = getRequestIdentities(req);
    if (identities.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid session data.' });
    }

    const id = parseToolId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, error: 'Invalid tool id.' });
    }

    // Only the owner can delete; someone else's id behaves like a missing one.
    const result = await pool.query(
      `DELETE FROM external_tool WHERE id = $1 AND created_by = ANY($2::text[])`,
      [id, identities]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Tool not found, or you are not its owner.' });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('[External Tools] Failed to delete tool:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete the tool.' });
  }
});

module.exports = router;
