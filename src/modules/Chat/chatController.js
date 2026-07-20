const multer = require('multer');
const path = require('path');
const chatService = require('./chatService');
const pool = require('../../core/database/pool');
const { storageDriver } = require('../../core/upload');
const { getRequestUserBubbleId, getRequestLegacyUserId } = require('../../core/auth/userIdentity');

// --- Multer Config ---
// Memory storage — the buffer goes straight to storageDriver.put (R2 or disk),
// never touching the Railway volume directly.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
}).single('file');

function buildUploadFilename(originalname) {
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
  return uniqueSuffix + path.extname(originalname || '');
}

// Helper to get full user profile from DB
const getFullUser = async (userIdentity) => {
  const res = await pool.query(
    'SELECT id as "userId", bubble_id as "bubbleId", access_level, email FROM "user" WHERE bubble_id = $1 OR id::text = $1 LIMIT 1',
    [String(userIdentity)]
  );
  return res.rows[0];
};

function getRequestUserIdentity(req) {
  return getRequestUserBubbleId(req) || getRequestLegacyUserId(req);
}

exports.getAllThreads = async (req, res) => {
  try {
    const user = await getFullUser(getRequestUserIdentity(req));
    if (!user) return res.status(401).json({ error: 'User not found' });

    const threads = await chatService.getChatThreads(user);
    const pendingCount = await chatService.getPendingTagsCount(user.userId);
    
    res.json({ success: true, threads, pendingCount });
  } catch (err) {
    console.error('Get All Threads Error:', err);
    res.status(500).json({ error: 'Failed to load chat threads' });
  }
};

exports.getChatHistory = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    if (!invoiceId) return res.status(400).json({ error: 'Invoice ID required' });

    const user = await getFullUser(getRequestUserIdentity(req));
    if (!user) return res.status(401).json({ error: 'User not found' });

    const thread = await chatService.getThread(invoiceId);
    const messages = await chatService.getMessages(thread.id, user.userId);
    const customerName = await chatService.getInvoiceCustomerName(invoiceId);
    const agentName = await chatService.getInvoiceAgentName(invoiceId);
    
    res.json({ 
      success: true, 
      threadId: thread.id, 
      messages, 
      currentUserId: String(user.userId),
      customerName, 
      agentName 
    });
  } catch (err) {
    console.error('Chat History Error:', err);
    res.status(500).json({ error: 'Failed to load chat history' });
  }
};

exports.postMessage = async (req, res) => {
  const processRequest = async (req, res) => {
    try {
      const { invoiceId } = req.params;
      const { messageType, content, tagRole } = req.body;
      
      const userProfile = await getFullUser(getRequestUserIdentity(req));
      if (!userProfile) return res.status(401).json({ error: 'User not found' });

      if (!invoiceId) return res.status(400).json({ error: 'Invoice ID required' });

      // Always use the primary integer ID as sender_id for consistency
      const senderId = String(userProfile.userId);
      const senderName = req.user.name || userProfile.email || 'User';

      const thread = await chatService.getThread(invoiceId);

      let finalContent = content;
      let fileMeta = null;

      if (req.file) {
        const stored = await storageDriver.put(req.file.buffer, {
          subdir: 'chat_uploads',
          filename: buildUploadFilename(req.file.originalname),
          mimeType: req.file.mimetype,
          req,
        });
        finalContent = stored.url;
        fileMeta = {
          originalName: req.file.originalname,
          mimetype: stored.mimeType,
          size: stored.bytes,
          filename: stored.filename
        };
      }

      // Ensure messageType is correctly identified
      const resolvedMessageType = req.file ? (req.file.mimetype.startsWith('image/') ? 'image' : 'file') : (messageType || 'text');

      const savedMessage = await chatService.addMessage({
        threadId: thread.id,
        senderId,
        senderName,
        messageType: resolvedMessageType,
        content: finalContent || (resolvedMessageType === 'tag' ? `TAG: ${tagRole}` : ''),
        fileMeta,
        tagRole: resolvedMessageType === 'tag' ? tagRole : null
      });

      res.json({ success: true, message: savedMessage });

    } catch (dbErr) {
      console.error('Post Message Error:', dbErr);
      res.status(500).json({ error: 'Failed to post message' });
    }
  };

  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    upload(req, res, function (err) {
      if (err) return res.status(400).json({ error: `Upload error: ${err.message}` });
      processRequest(req, res);
    });
  } else {
    processRequest(req, res);
  }
};

exports.acknowledgeTag = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userProfile = await getFullUser(getRequestUserIdentity(req));
    if (!userProfile) return res.status(401).json({ error: 'User not found' });
    const userId = userProfile.userId;
    
    const updated = await chatService.acknowledgeTag(messageId, userId);
    res.json({ success: true, assignment: updated });
  } catch (err) {
    console.error('Ack Tag Error:', err);
    res.status(500).json({ error: 'Failed to acknowledge tag' });
  }
};
