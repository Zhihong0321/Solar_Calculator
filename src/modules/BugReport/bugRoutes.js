const express = require('express');
const router = express.Router();

const bugController = require('./bugController');
const bugService = require('./bugService');
const pool = require('../../core/database/pool');
const { requireAuth } = require('../../core/middleware/auth');

const adminRoles = bugService.ADMIN_ROLES.map((role) => role.toLowerCase());

const requireAdmin = async (req, res, next) => {
  try {
    const userRes = await pool.query(
      'SELECT access_level FROM "user" WHERE id = $1',
      [req.user.userId]
    );
    const userLevels = (userRes.rows[0]?.access_level || []).map((role) =>
      String(role).toLowerCase().trim()
    );
    const hasAccess = userLevels.some((role) => adminRoles.includes(role));

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access Denied: IT Admins only' });
    }

    return next();
  } catch (err) {
    return res.status(500).json({ error: 'Authorization error' });
  }
};

router.get('/my-thread', requireAuth, bugController.getMyChatHistory);
router.post('/my-thread/message', requireAuth, bugController.postMessage);

router.get('/threads', requireAuth, requireAdmin, bugController.getAllThreads);
router.get('/thread/:threadId', requireAuth, requireAdmin, bugController.getAdminChatHistory);
router.post('/thread/:threadId/message', requireAuth, requireAdmin, bugController.postMessage);

module.exports = router;
