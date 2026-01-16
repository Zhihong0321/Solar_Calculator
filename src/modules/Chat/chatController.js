const multer = require('multer');
const path = require('path');
const chatService = require('./chatService');

// --- Multer Config ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = process.env.RAILWAY_VOLUME_MOUNT_PATH 
      ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'chat_uploads')
      : path.join(__dirname, '../../../storage/chat_uploads');
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 3 * 1024 * 1024 // 3MB Global Limit (Validation refine in handler)
  },
  fileFilter: (req, file, cb) => {
    // Basic filter, more specific checks in handler if needed
    cb(null, true);
  }
}).single('file'); // 'file' is the field name

// --- Controller ---

// Helper to get Absolute URL
const getAbsoluteUrl = (req, filename) => {
  let protocol = req.protocol;
  // Handle proxy headers safely
  if (req.headers['x-forwarded-proto']) {
    protocol = req.headers['x-forwarded-proto'].split(',')[0].trim();
  }
  const host = req.get('host');
  return `${protocol}://${host}/uploads/chat_uploads/${filename}`;
};

exports.getAllThreads = async (req, res) => {
  try {
    const threads = await chatService.getChatThreads();
    res.json({ success: true, threads });
  } catch (err) {
    console.error('Get All Threads Error:', err);
    res.status(500).json({ error: 'Failed to load chat threads' });
  }
};

exports.getChatHistory = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    if (!invoiceId) return res.status(400).json({ error: 'Invoice ID required' });

    const thread = await chatService.getThread(invoiceId);
    const messages = await chatService.getMessages(thread.id);
    const customerName = await chatService.getInvoiceCustomerName(invoiceId);
    
    // Determine current user ID
    const currentUserId = req.user ? String(req.user.userId) : null;

    res.json({ success: true, threadId: thread.id, messages, currentUserId, customerName });
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
      const user = req.user; 

      if (!invoiceId) return res.status(400).json({ error: 'Invoice ID required' });

      // Identify Sender
      const senderId = user ? String(user.userId) : 'guest';
      const senderName = user ? (user.name || 'User') : 'Guest';

      const thread = await chatService.getThread(invoiceId);

      let finalContent = content;
      let fileMeta = null;

      // Handle File Upload
      if (req.file) {
        const isImage = req.file.mimetype.startsWith('image/');
        const limit = isImage ? 1 * 1024 * 1024 : 3 * 1024 * 1024;

        if (req.file.size > limit) {
           // Should delete file if validation fails in production
        }

        finalContent = getAbsoluteUrl(req, req.file.filename);
        fileMeta = {
          originalName: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          filename: req.file.filename
        };
      }

      const savedMessage = await chatService.addMessage({
        threadId: thread.id,
        senderId,
        senderName,
        messageType: req.file ? (req.file.mimetype.startsWith('image/') ? 'image' : 'file') : (messageType || 'text'),
        content: finalContent,
        fileMeta,
        tagRole: messageType === 'tag' ? tagRole : null
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
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      } else if (err) {
        return res.status(500).json({ error: `Unknown upload error: ${err.message}` });
      }
      processRequest(req, res);
    });
  } else {
    // JSON or other (handled by express.json())
    processRequest(req, res);
  }
};

exports.acknowledgeTag = async (req, res) => {
  try {
    const { messageId } = req.params;
    const user = req.user;
    
    const updated = await chatService.acknowledgeTag(messageId, user.userId);
    res.json({ success: true, message: updated });
  } catch (err) {
    console.error('Ack Tag Error:', err);
    res.status(500).json({ error: 'Failed to acknowledge tag' });
  }
};
