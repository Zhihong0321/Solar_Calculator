const multer = require('multer');
const path = require('path');
const supportTicketService = require('./supportTicketService');
const googleDriveService = require('./googleDriveService');
const { storageDriver } = require('../../core/upload');
const { getRequestUserBubbleId, getRequestLegacyUserId } = require('../../core/auth/userIdentity');

// Memory storage — buffers go to Google Drive / storageDriver (R2 or disk)
exports.uploadMedia = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
}).fields([
  { name: 'images', maxCount: 6 },
  { name: 'video', maxCount: 1 }
]);

// Backwards compatibility alias
exports.uploadImages = exports.uploadMedia;

function buildUploadFilename(originalname) {
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
  return uniqueSuffix + path.extname(originalname || '');
}

exports.listTickets = async (req, res) => {
  try {
    const { status, search, limit, offset } = req.query;
    const tickets = await supportTicketService.listTickets({
      status: status || undefined,
      search: search || undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
    const counts = await supportTicketService.getStatusCounts();
    res.json({ success: true, tickets, counts });
  } catch (err) {
    console.error('[SupportTicket] List error:', err);
    res.status(500).json({ error: 'Failed to load support tickets' });
  }
};

exports.listMyTickets = async (req, res) => {
  try {
    const identity = getRequestUserBubbleId(req) || getRequestLegacyUserId(req);
    if (!identity) return res.status(401).json({ error: 'Unauthorized' });

    const tickets = await supportTicketService.listMyTickets(identity);
    res.json({ success: true, tickets });
  } catch (err) {
    console.error('[SupportTicket] List mine error:', err);
    res.status(500).json({ error: 'Failed to load your support tickets' });
  }
};

exports.getTicket = async (req, res) => {
  try {
    const ticket = await supportTicketService.getTicketById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ success: true, ticket });
  } catch (err) {
    console.error('[SupportTicket] Get error:', err);
    res.status(500).json({ error: 'Failed to load ticket' });
  }
};

exports.updateTicket = async (req, res) => {
  try {
    const { status, technician_remark, link_customer, video_url } = req.body;
    const updated = await supportTicketService.updateTicket(req.params.id, { status, technician_remark, link_customer, video_url });
    if (!updated) return res.status(404).json({ error: 'Ticket not found' });
    const ticket = await supportTicketService.getTicketById(updated.id);
    res.json({ success: true, ticket: ticket || updated });
  } catch (err) {
    console.error('[SupportTicket] Update error:', err);
    res.status(400).json({ error: err.message || 'Failed to update ticket' });
  }
};

exports.deleteTicket = async (req, res) => {
  try {
    const ok = await supportTicketService.softDeleteTicket(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[SupportTicket] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete ticket' });
  }
};

exports.restoreTicket = async (req, res) => {
  try {
    const ok = await supportTicketService.restoreTicket(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[SupportTicket] Restore error:', err);
    res.status(500).json({ error: 'Failed to restore ticket' });
  }
};

exports.searchCustomers = async (req, res) => {
  try {
    const customers = await supportTicketService.searchCustomers(req.query.q, 10);
    res.json({ success: true, customers });
  } catch (err) {
    console.error('[SupportTicket] Customer search error:', err);
    res.status(500).json({ error: 'Failed to search customers' });
  }
};

exports.createTicket = async (req, res) => {
  try {
    const { title, problem_description, customer_id, video_url: bodyVideoUrl } = req.body;
    const createdBy = getRequestUserBubbleId(req) || getRequestLegacyUserId(req);
    // Without this the insert silently stores created_by = NULL and the ticket becomes
    // an orphan nobody can trace back to the submitter.
    if (!createdBy) return res.status(401).json({ error: 'Unauthorized' });

    if (!customer_id || !String(customer_id).trim()) {
      return res.status(400).json({ error: 'A linked customer is required' });
    }

    // Extract image files and video files from req.files
    const imageFiles = req.files
      ? (Array.isArray(req.files) ? req.files : (req.files['images'] || []))
      : [];
    const videoFiles = req.files && !Array.isArray(req.files) ? (req.files['video'] || []) : [];

    const stored = await Promise.all(imageFiles.map((file) => storageDriver.put(file.buffer, {
      subdir: 'support_ticket_uploads',
      filename: buildUploadFilename(file.originalname),
      mimeType: file.mimetype,
      req,
    })));
    const images = stored.map((s) => s.url);

    // Handle video file upload or pasted video URL
    let finalVideoUrl = typeof bodyVideoUrl === 'string' && bodyVideoUrl.trim() ? bodyVideoUrl.trim() : null;
    if (videoFiles.length > 0) {
      const videoFile = videoFiles[0];
      const uploadResult = await googleDriveService.uploadVideo({
        buffer: videoFile.buffer,
        originalname: videoFile.originalname,
        mimeType: videoFile.mimetype,
        req,
      });
      finalVideoUrl = uploadResult.url;
    }

    const ticket = await supportTicketService.createTicket({
      title,
      problem_description,
      link_customer: customer_id || null,
      created_by: createdBy,
      images: images.length ? images : null,
      video_url: finalVideoUrl,
    });

    res.json({ success: true, ticket });

    supportTicketService.getTicketById(ticket.id)
      .then((enriched) => supportTicketService.notifySupportTeam(enriched || ticket))
      .catch((err) => console.error('[SupportTicket] Notify support team failed:', err.message));
  } catch (err) {
    console.error('[SupportTicket] Create error:', err);
    res.status(400).json({ error: err.message || 'Failed to submit support ticket' });
  }
};

exports.getGoogleDriveConfig = (req, res) => {
  res.json({
    success: true,
    folder_url: googleDriveService.getSharedFolderUrl(),
    has_credentials: googleDriveService.hasCredentials(),
  });
};

exports.listNotificationNumbers = async (req, res) => {
  try {
    const numbers = await supportTicketService.listNotificationNumbers();
    res.json({ success: true, numbers });
  } catch (err) {
    console.error('[SupportTicket] List notification numbers error:', err);
    res.status(500).json({ error: 'Failed to load notification numbers' });
  }
};

exports.addNotificationNumber = async (req, res) => {
  try {
    const { phone_number, label } = req.body;
    const entry = await supportTicketService.addNotificationNumber({ phone_number, label });
    res.json({ success: true, entry });
  } catch (err) {
    console.error('[SupportTicket] Add notification number error:', err);
    res.status(400).json({ error: err.message || 'Failed to add notification number' });
  }
};

exports.deleteNotificationNumber = async (req, res) => {
  try {
    const deleted = await supportTicketService.deleteNotificationNumber(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Notification number not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[SupportTicket] Delete notification number error:', err);
    res.status(500).json({ error: 'Failed to delete notification number' });
  }
};

exports.syncFromBubble = async (req, res) => {
  try {
    const result = await supportTicketService.syncFromBubble();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[SupportTicket] Sync error:', err);
    res.status(500).json({ error: err.message || 'Failed to sync support tickets' });
  }
};
