const express = require('express');
const emailService = require('../services/emailService');
const { requireAuth } = require('../../../core/middleware/auth');
const pool = require('../../../core/database/pool');
const { resolveAuthenticatedUserRecord, resolveAgentBubbleId } = require('../../../core/auth/userIdentity');

const router = express.Router();

// Middleware to resolve agent_bubble_id from the authenticated user
const resolveAgent = async (req, res, next) => {
  try {
    const user = await resolveAuthenticatedUserRecord(pool, req);
    const agentBubbleId = await resolveAgentBubbleId(pool, req);

    if (!user || !agentBubbleId) {
      return res.status(403).json({ error: 'No agent profile linked to this user.' });
    }

    req.agentBubbleId = agentBubbleId;
    req.userAccessLevel = user.access_level || [];
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
 * GET /api/email/shared/accounts
 * List predefined shared inboxes available to authenticated users
 */
router.get('/api/email/shared/accounts', requireAuth, async (req, res) => {
  try {
    const accounts = emailService.getSharedEmailAccounts();
    res.json({ success: true, accounts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/email/shared/received
 * List received emails for an allowlisted shared inbox
 */
router.get('/api/email/shared/received', requireAuth, async (req, res) => {
  const { email, limit, offset } = req.query;
  try {
    if (!emailService.isSharedEmailAccount(email)) {
      return res.status(403).json({ error: 'Unauthorized access to this shared inbox.' });
    }

    const normalizedEmail = emailService.normalizeEmail(email);
    const emails = await emailService.getReceivedEmails(normalizedEmail, parseInt(limit) || 50, parseInt(offset) || 0);
    res.json({ success: true, emails });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/email/shared/details/:id
 * Get full details of a received email from an allowlisted shared inbox
 */
router.get('/api/email/shared/details/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { email } = req.query;
  try {
    if (!emailService.isSharedEmailAccount(email)) {
      return res.status(403).json({ error: 'Unauthorized access to this shared inbox.' });
    }

    const normalizedEmail = emailService.normalizeEmail(email);
    const emailDetails = await emailService.getEmailDetails(id, 'received', { markAsRead: false });

    if (!emailDetails) {
      return res.status(404).json({ error: 'Email not found.' });
    }

    if (emailService.normalizeEmail(emailDetails.to_email) !== normalizedEmail) {
      return res.status(403).json({ error: 'Email address mismatch.' });
    }

    res.json({ success: true, email: emailDetails });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/email/accounts
 * Claim a new email account
 */
router.post('/api/email/accounts', requireAuth, resolveAgent, async (req, res) => {
  const { prefix, domain } = req.body;
  try {
    const isSuperAdmin = (req.userAccessLevel || []).includes('superadmin');
    const account = await emailService.claimEmailAccount(req.agentBubbleId, prefix, domain, isSuperAdmin);
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

/**
 * POST /api/email/send
 * Send a new email
 */
router.post('/api/email/send', requireAuth, resolveAgent, async (req, res) => {
  const { from, to, subject, text, html, attachments } = req.body;
  try {
    // Security check: ensure agent owns the "from" email
    const owned = await emailService.isEmailOwnedByAgent(from, req.agentBubbleId);
    if (!owned) {
      return res.status(403).json({ error: 'Unauthorized: You do not own this email account.' });
    }

    const result = await emailService.sendEmail({ from, to, subject, text, html, attachments });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/email/stats
 * Get overall email statistics
 */
router.get('/api/email/stats', requireAuth, async (req, res) => {
  try {
    const stats = await emailService.getEmailStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
