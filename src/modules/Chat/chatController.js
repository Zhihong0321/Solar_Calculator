const multer = require('multer');
const path = require('path');
const fs = require('fs');
const chatService = require('./chatService');
const pool = require('../../core/database/pool');

// --- Multer Config ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = process.env.RAILWAY_VOLUME_MOUNT_PATH 
      ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'chat_uploads')
      : path.resolve(__dirname, '../../../storage/chat_uploads');
    
    try {
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
    } catch (err) {}
    
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
}).single('file');

// Helper to get Absolute URL
const getAbsoluteUrl = (req, filename) => {
  let protocol = req.protocol;
  if (req.headers['x-forwarded-proto']) {
    protocol = req.headers['x-forwarded-proto'].split(',')[0].trim();
  }
  const host = req.get('host');
  return `${protocol}://${host}/uploads/chat_uploads/${filename}`;
};

// Helper to get full user profile from DB
const getFullUser = async (userId) => {
  const res = await pool.query('SELECT id as "userId", bubble_id as "bubbleId", access_level, email FROM "user" WHERE id = $1', [userId]);
  return res.rows[0];
};

exports.getAllThreads = async (req, res) => {
  try {
    const user = await getFullUser(req.user.userId);
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

    const user = await getFullUser(req.user.userId);
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
      
      const userProfile = await getFullUser(req.user.userId);
      if (!userProfile) return res.status(401).json({ error: 'User not found' });

      if (!invoiceId) return res.status(400).json({ error: 'Invoice ID required' });

      // Always use the primary integer ID as sender_id for consistency
      const senderId = String(userProfile.userId);
      const senderName = req.user.name || userProfile.email || 'User';

      const thread = await chatService.getThread(invoiceId);

      let finalContent = content;
      let fileMeta = null;

      if (req.file) {
        finalContent = getAbsoluteUrl(req, req.file.filename);
        fileMeta = {
          originalName: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          filename: req.file.filename
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
    const userId = req.user.userId;
    
    const updated = await chatService.acknowledgeTag(messageId, userId);
    res.json({ success: true, assignment: updated });
  } catch (err) {
    console.error('Ack Tag Error:', err);
    res.status(500).json({ error: 'Failed to acknowledge tag' });
  }
};