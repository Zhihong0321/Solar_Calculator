const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bugService = require('./bugService');
const pool = require('../../core/database/pool');
const { aiRouter } = require('../AIRouter/aiRouter');

// --- Multer Config ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = process.env.RAILWAY_VOLUME_MOUNT_PATH 
      ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'bug_uploads')
      : path.resolve(__dirname, '../../../storage/bug_uploads');
    
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

const getAbsoluteUrl = (req, filename) => {
  let protocol = req.protocol;
  if (req.headers['x-forwarded-proto']) {
    protocol = req.headers['x-forwarded-proto'].split(',')[0].trim();
  }
  const host = req.get('host');
  return `${protocol}://${host}/uploads/bug_uploads/${filename}`;
};

const getFullUser = async (userId) => {
  const res = await pool.query('SELECT id as "userId", name, access_level, email FROM "user" WHERE id = $1', [userId]);
  return res.rows[0];
};

const SYSTEM_PROMPT = `You are a helpful IT Support Agent. 
Your goal is to assist users in reporting system bugs. 
Politely ask them for steps to reproduce the bug, what device they are using, and ask them to attach a screenshot if possible. 
Acknowledge the bug once you have sufficient info, and let them know the Head of IT will review it. 
Keep your responses very concise and friendly. Format your replies simply using plaintext, like WhatsApp messages.`;

exports.getAllThreads = async (req, res) => {
  try {
    const user = await getFullUser(req.user.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });

    const threads = await bugService.getAllBugThreads(user);
    res.json({ success: true, threads });
  } catch (err) {
    console.error('Get All Threads Error:', err);
    res.status(500).json({ error: 'Failed to load bug threads' });
  }
};

exports.getMyChatHistory = async (req, res) => {
  try {
    const user = await getFullUser(req.user.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });

    const thread = await bugService.getThread(user.userId);
    const messages = await bugService.getMessages(thread.id);
    
    res.json({ 
      success: true, 
      threadId: thread.id, 
      messages, 
      currentUserId: String(user.userId),
      customerName: user.name || 'User', 
      agentName: 'System Bug Agent' 
    });
  } catch (err) {
    console.error('Chat History Error:', err);
    res.status(500).json({ error: 'Failed to load chat history' });
  }
};

exports.getAdminChatHistory = async (req, res) => {
    try {
      const { threadId } = req.params;
      const user = await getFullUser(req.user.userId);
      if (!user) return res.status(401).json({ error: 'User not found' });
  
      const hasAdminAccess = user.access_level && user.access_level.some(role => bugService.ADMIN_ROLES.includes(role));
      if (!hasAdminAccess) return res.status(403).json({ error: 'Unauthorized' });
  
      const messages = await bugService.getMessages(threadId);
      
      res.json({ 
        success: true, 
        threadId, 
        messages, 
        currentUserId: String(user.userId)
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load chat history' });
    }
  };

exports.postMessage = async (req, res) => {
  const processRequest = async (req, res) => {
    try {
      const { messageType, content } = req.body;
      const isAdminReplyStr = req.body.isAdminReply;
      const isAdminReply = typeof isAdminReplyStr === 'string' ? isAdminReplyStr === 'true' : !!isAdminReplyStr;
      
      const threadId = req.params.threadId || (await bugService.getThread(req.user.userId)).id;

      const userProfile = await getFullUser(req.user.userId);
      if (!userProfile) return res.status(401).json({ error: 'User not found' });

      // Always use the primary integer ID as sender_id for consistency
      const senderId = String(userProfile.userId);
      const senderName = userProfile.name || userProfile.email || 'User';

      let finalContent = content || '';
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

      const resolvedMessageType = req.file ? (req.file.mimetype.startsWith('image/') ? 'image' : 'file') : (messageType || 'text');

      const savedMessage = await bugService.addMessage({
        threadId,
        senderId,
        senderName: isAdminReply ? `IT Admin (${senderName})` : senderName,
        messageType: resolvedMessageType,
        content: finalContent,
        fileMeta
      });

      // Avoid triggering AI if it's an IT admin replying
      if (!isAdminReply) {
          // Trigger AI Agent using history
          const allMsgs = await bugService.getMessages(threadId);
          const aiMessagesContext = [
              { role: 'system', content: SYSTEM_PROMPT }
          ];

          allMsgs.forEach(m => {
              if (m.sender_id === 'SYSTEM_AI') {
                  aiMessagesContext.push({ role: 'assistant', content: m.content || 'Attached a file' });
              } else {
                  let txt = m.content || 'User uploaded a file/image';
                  aiMessagesContext.push({ role: 'user', content: txt });
              }
          });

          try {
              console.log("[BugReport] Calling AI Router with messages count:", aiMessagesContext.length);
              const aiResponse = await aiRouter.chatCompletion({
                  messages: aiMessagesContext,
                  temperature: 0.5
              });
              
              if (aiResponse && aiResponse.choices && aiResponse.choices.length > 0) {
                  let replyTxt = aiResponse.choices[0].message.content;
                  if (typeof replyTxt === 'object') replyTxt = JSON.stringify(replyTxt); // Fallback if AI replies in JSON struct accidentally

                  await bugService.addSystemMessage(threadId, replyTxt);
              }
          } catch(aiErr) {
              console.error("[BugReport] AI integration error:", aiErr);
              await bugService.addSystemMessage(threadId, "Sorry, I am currently disconnected from my AI servers. Your report has been logged anyway.");
          }
      }

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
