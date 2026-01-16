const express = require('express');
const router = express.Router();
const chatController = require('./chatController');
const { requireAuth } = require('../../core/middleware/auth');

// Allow guests to view/chat? The requirement says "admin, sales agent, tech team".
// But typically "Invoice Office" is also accessible by customers via share token.
// The prompt says: "admin, sales agent, tech team can enter invoice-office... they can have discussion".
// It doesn't explicitly exclude the customer, but usually "internal-chat" implies internal.
// However, standard invoice chat usually involves the customer.
// Given "internal-chat conversation works like whatsapp", I will assume authenticated users for now.
// If customers need access, we'd need to check share_token.
// For now, I will use `requireAuth` as the base, assuming internal staff usage as primary request.

router.get('/api/v1/chat/threads', requireAuth, chatController.getAllThreads);
router.get('/api/v1/chat/:invoiceId', requireAuth, chatController.getChatHistory);
router.post('/api/v1/chat/:invoiceId/message', requireAuth, chatController.postMessage);
router.put('/api/v1/chat/message/:messageId/ack', requireAuth, chatController.acknowledgeTag);

module.exports = router;
