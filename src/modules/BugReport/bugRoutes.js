const adminRoles = bugService.ADMIN_ROLES;
const requireAdmin = async (req, res, next) => {
    try {
        const userRes = await pool.query('SELECT access_level FROM "user" WHERE id = $1', [req.user.userId]);
        const userLevels = userRes.rows[0]?.access_level || [];
        const hasAccess = userLevels.some(r => adminRoles.includes(r.toLowerCase().trim()));
        if (!hasAccess) return res.status(403).json({ error: 'Access Denied: IT Admins only' });
        next();
    } catch (err) {
        res.status(500).json({ error: 'Authorization error' });
    }
};

// Regular user routes
router.get('/my-thread', bugController.getMyChatHistory);
router.post('/my-thread/message', bugController.postMessage);

// Admin routes (IT Head)
router.get('/threads', requireAdmin, bugController.getAllThreads);
router.get('/thread/:threadId', requireAdmin, bugController.getAdminChatHistory);
router.post('/thread/:threadId/message', requireAdmin, bugController.postMessage);

module.exports = router;
