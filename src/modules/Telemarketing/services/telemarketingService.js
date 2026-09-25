const pool = require('../../../core/database/pool');
const { getRequestUserBubbleId } = require('../../../core/auth/userIdentity');

const EE_AUTO_BASE_URL = process.env.EE_AUTO_BASE_URL || 'https://ee-auto.up.railway.app';

/**
 * Resolves the Telemarketer UID from request context.
 * Checks in order:
 * 1. Explicit query ?uid= or header X-Telemarketer-UID
 * 2. Authenticated user's Bubble ID
 * 3. Authenticated user's Agent Name from DB
 * 4. Fallback to default user if testing
 */
async function resolveTelemarketerUid(req) {
  const explicitUid = req.query?.uid || req.headers?.['x-telemarketer-uid'];
  if (explicitUid && String(explicitUid).trim() !== '') {
    return String(explicitUid).trim();
  }

  const bubbleId = getRequestUserBubbleId(req);
  if (bubbleId) {
    // Check if the bubbleId is valid on upstream, or get agent's name
    try {
      const upstreamCheck = await fetch(`${EE_AUTO_BASE_URL}/api/telemarketer/me?uid=${encodeURIComponent(bubbleId)}`);
      const checkData = await upstreamCheck.json();
      if (upstreamCheck.ok && checkData.ok) {
        return bubbleId;
      }
    } catch (err) {
      console.warn('[TelemarketingService] Bubble ID upstream check error:', err.message);
    }
  }

  // If bubbleId wasn't recognized directly, look up agent name in PostgreSQL
  const userId = req.user?.userId || req.user?.id;
  if (userId || bubbleId) {
    try {
      const res = await pool.query(`
        SELECT a.name, u.email 
        FROM "user" u
        LEFT JOIN agent a ON (u.linked_agent_profile = a.bubble_id OR a.linked_user_login = u.bubble_id)
        WHERE u.id::text = $1 OR (u.bubble_id = $2 AND u.bubble_id IS NOT NULL AND u.bubble_id != '')
        LIMIT 1
      `, [String(userId || ''), String(bubbleId || '')]);

      if (res.rows.length > 0) {
        const { name, email } = res.rows[0];
        if (name) {
          const testName = await fetch(`${EE_AUTO_BASE_URL}/api/telemarketer/me?uid=${encodeURIComponent(name)}`);
          const nameData = await testName.json();
          if (testName.ok && nameData.ok && nameData.telemarketer?.uid) {
            return nameData.telemarketer.uid;
          }
        }
        if (email) {
          const testEmail = await fetch(`${EE_AUTO_BASE_URL}/api/telemarketer/me?uid=${encodeURIComponent(email)}`);
          const emailData = await testEmail.json();
          if (testEmail.ok && emailData.ok && emailData.telemarketer?.uid) {
            return emailData.telemarketer.uid;
          }
        }
      }
    } catch (err) {
      console.warn('[TelemarketingService] Agent DB name resolution error:', err.message);
    }
  }

  // Fallback default
  return 'gan zhi hong';
}

/**
 * Get telemarketer profile and status counts
 */
async function getProfile(uid) {
  const url = `${EE_AUTO_BASE_URL}/api/telemarketer/me?uid=${encodeURIComponent(uid)}`;
  const resp = await fetch(url, {
    headers: { 'Accept': 'application/json' }
  });
  const data = await resp.json();
  if (!resp.ok || !data.ok) {
    const error = new Error(data.error || 'Failed to fetch telemarketer profile');
    error.status = resp.status;
    throw error;
  }
  return data;
}

/**
 * List assigned leads with pagination, status filter, and keyword search
 */
async function getLeads(uid, { status, search, limit = 50, offset = 0, sort = 'created_at' } = {}) {
  const params = new URLSearchParams();
  params.set('uid', uid);
  if (status && status !== 'all') params.set('status', status);
  if (search && String(search).trim() !== '') params.set('search', String(search).trim());
  if (limit) params.set('limit', String(limit));
  if (offset !== undefined) params.set('offset', String(offset));
  if (sort) params.set('sort', sort);

  const url = `${EE_AUTO_BASE_URL}/api/telemarketer/leads?${params.toString()}`;
  const resp = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'X-Telemarketer-UID': uid
    }
  });

  const data = await resp.json();
  if (!resp.ok || !data.ok) {
    const error = new Error(data.error || 'Failed to fetch leads');
    error.status = resp.status;
    throw error;
  }
  return data;
}

/**
 * Get detailed information for a single lead
 */
async function getLeadDetail(leadId, uid) {
  const url = `${EE_AUTO_BASE_URL}/api/telemarketer/leads/${encodeURIComponent(leadId)}`;
  const resp = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'X-Telemarketer-UID': uid
    }
  });

  const data = await resp.json();
  if (!resp.ok || !data.ok) {
    const error = new Error(data.error || 'Failed to fetch lead details');
    error.status = resp.status;
    throw error;
  }
  return data;
}

/**
 * Update lead disposition status and add/edit notes
 */
async function updateLead(leadId, uid, { leadStatus, notes, appendNotes } = {}) {
  const url = `${EE_AUTO_BASE_URL}/api/telemarketer/leads/${encodeURIComponent(leadId)}`;
  const payload = { uid };

  if (leadStatus !== undefined) payload.leadStatus = leadStatus;
  if (notes !== undefined) payload.notes = notes;
  if (appendNotes !== undefined && appendNotes.trim() !== '') payload.appendNotes = appendNotes.trim();

  const resp = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Telemarketer-UID': uid
    },
    body: JSON.stringify(payload)
  });

  const data = await resp.json();
  if (!resp.ok || !data.ok) {
    const error = new Error(data.error || 'Failed to update lead');
    error.status = resp.status;
    throw error;
  }
  return data;
}

module.exports = {
  EE_AUTO_BASE_URL,
  resolveTelemarketerUid,
  getProfile,
  getLeads,
  getLeadDetail,
  updateLead
};
