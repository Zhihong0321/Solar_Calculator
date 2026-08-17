const express = require('express');
const router = express.Router();

const supportTicketController = require('./supportTicketController');
const supportTicketService = require('./supportTicketService');
const pool = require('../../core/database/pool');
const { requireAuth } = require('../../core/middleware/auth');
const { getRequestUserBubbleId, getRequestLegacyUserId } = require('../../core/auth/userIdentity');

const requireAdmin = async (req, res, next) => {
  try {
    const identity = getRequestUserBubbleId(req) || getRequestLegacyUserId(req);
    const result = await pool.query(
      'SELECT access_level FROM "user" WHERE bubble_id = $1 OR id::text = $1 LIMIT 1',
      [String(identity)]
    );
    const user = result.rows[0];
    if (!user || !supportTicketService.hasAdminAccess(user)) {
      return res.status(403).json({ error: 'Access Denied: Support staff only' });
    }
    return next();
  } catch (err) {
    return res.status(500).json({ error: 'Authorization error' });
  }
};

router.get('/api/support-tickets', requireAuth, requireAdmin, supportTicketController.listTickets);
router.post('/api/support-tickets', requireAuth, supportTicketController.uploadMedia, supportTicketController.createTicket);
router.get('/api/support-tickets/gdrive-config', requireAuth, supportTicketController.getGoogleDriveConfig);
router.get('/api/support-tickets/mine', requireAuth, supportTicketController.listMyTickets);
router.post('/api/support-tickets/sync', requireAuth, requireAdmin, supportTicketController.syncFromBubble);

router.get('/api/support-tickets/notification-numbers', requireAuth, requireAdmin, supportTicketController.listNotificationNumbers);
router.post('/api/support-tickets/notification-numbers', requireAuth, requireAdmin, supportTicketController.addNotificationNumber);
router.delete('/api/support-tickets/notification-numbers/:id', requireAuth, requireAdmin, supportTicketController.deleteNotificationNumber);

router.get('/api/support-tickets/customers/search', requireAuth, requireAdmin, supportTicketController.searchCustomers);

router.get('/api/support-tickets/:id', requireAuth, requireAdmin, supportTicketController.getTicket);
router.patch('/api/support-tickets/:id', requireAuth, requireAdmin, supportTicketController.updateTicket);
router.delete('/api/support-tickets/:id', requireAuth, requireAdmin, supportTicketController.deleteTicket);
router.post('/api/support-tickets/:id/restore', requireAuth, requireAdmin, supportTicketController.restoreTicket);

module.exports = router;
