const express = require('express');
const emailService = require('../services/emailService');
const { requireAuth } = require('../../../core/middleware/auth');
const pool = require('../../../core/database/pool');

const router = express.Router();

// Middleware to resolve agent_bubble_id from the authenticated user
const resolveAgent = async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.id;
    const bubbleId = req.user.bubbleId || req.user.bubble_id;
    
    if (!userId && !bubbleId) {
      return res.status(401).json({ error: 'Invalid session data' });
    }

    const query = 'SELECT linked_agent_profile FROM "user" WHERE id::text = $1 OR (bubble_id = $2 AND bubble_id IS NOT NULL AND bubble_id != \'\') LIMIT 1';
    const { rows } = await pool.query(query, [String(userId || ''), String(bubbleId || '')]);
    
    if (rows.length === 0 || !rows[0].linked_agent_profile) {
      return res.status(403).json({ error: 'No agent profile linked to this user.' });
    }
    
    req.agentBubbleId = rows[0].linked_agent_profile;
    next();
  } catch (err) {
    console.error('Error resolving agent:', err);
    res.status(500).json({ error: 'Internal server error resolving agent.' });
  }
};

/**
 * GET /api/email/accounts
 * List all email accounts claimed by the agent
 */
router.get('/api/email/accounts', requireAuth, resolveAgent, async (req, res) => {
  try {
    const accounts = await emailService.getAgentEmailAccounts(req.agentBubbleId);
    res.json({ success: true, accounts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/email/accounts
 * Claim a new email account
 */
router.post('/api/email/accounts', requireAuth, resolveAgent, async (req, res) => {
  const { prefix } = req.body;
  try {
    const account = await emailService.claimEmailAccount(req.agentBubbleId, prefix);
    res.json({ success: true, account });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/email/received
 * List received emails for a specific account
 */
router.get('/api/email/received', requireAuth, resolveAgent, async (req, res) => {
  const { email, limit, offset } = req.query;
  try {
    // Security check: ensure agent owns this email
    const owned = await emailService.isEmailOwnedByAgent(email, req.agentBubbleId);
    if (!owned) {
      return res.status(403).json({ error: 'Unauthorized access to this email account.' });
    }

    const emails = await emailService.getReceivedEmails(email, parseInt(limit) || 50, parseInt(offset) || 0);
    res.json({ success: true, emails });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/email/sent
 * List sent emails for a specific account
 */
router.get('/api/email/sent', requireAuth, resolveAgent, async (req, res) => {
  const { email, limit, offset } = req.query;
  try {
    // Security check: ensure agent owns this email
    const owned = await emailService.isEmailOwnedByAgent(email, req.agentBubbleId);
    if (!owned) {
      return res.status(403).json({ error: 'Unauthorized access to this email account.' });
    }

    const emails = await emailService.getSentEmails(email, parseInt(limit) || 50, parseInt(offset) || 0);
    res.json({ success: true, emails });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/email/details/:id
 * Get full details of an email
 */
router.get('/api/email/details/:id', requireAuth, resolveAgent, async (req, res) => {
  const { id } = req.params;
  const { type, email } = req.query; // email is needed for security check
  try {
    // Security check: ensure agent owns the account associated with this email
    const owned = await emailService.isEmailOwnedByAgent(email, req.agentBubbleId);
    if (!owned) {
      return res.status(403).json({ error: 'Unauthorized access to this email account.' });
    }

    const emailDetails = await emailService.getEmailDetails(id, type);
    
    if (!emailDetails) {
        return res.status(404).json({ error: 'Email not found.' });
    }
    
    // Double check that the email matches the to/from address
    if (type === 'received' && emailDetails.to_email !== email) {
        return res.status(403).json({ error: 'Email address mismatch.' });
    }
    if (type === 'sent' && emailDetails.from_email !== email) {
        return res.status(403).json({ error: 'Email address mismatch.' });
    }

    res.json({ success: true, email: emailDetails });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
