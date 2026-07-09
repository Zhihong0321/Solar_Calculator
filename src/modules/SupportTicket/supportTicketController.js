const multer = require('multer');
const path = require('path');
const fs = require('fs');
const supportTicketService = require('./supportTicketService');
const { getRequestUserBubbleId, getRequestLegacyUserId } = require('../../core/auth/userIdentity');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = process.env.RAILWAY_VOLUME_MOUNT_PATH
      ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'support_ticket_uploads')
      : path.resolve(__dirname, '../../../storage/support_ticket_uploads');

    try {
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
    } catch (err) {}

    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

exports.uploadImages = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
}).array('images', 6);

const getAbsoluteUrl = (req, filename) => {
  let protocol = req.protocol;
  if (req.headers['x-forwarded-proto']) {
    protocol = req.headers['x-forwarded-proto'].split(',')[0].trim();
  }
  const host = req.get('host');
  return `${protocol}://${host}/uploads/support_ticket_uploads/${filename}`;
};

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
    const { status, technician_remark, link_customer } = req.body;
    const updated = await supportTicketService.updateTicket(req.params.id, { status, technician_remark, link_customer });
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
    const { title, problem_description, customer_id } = req.body;
    const createdBy = getRequestUserBubbleId(req) || getRequestLegacyUserId(req);

    const images = (req.files || []).map((file) => getAbsoluteUrl(req, file.filename));

    const ticket = await supportTicketService.createTicket({
      title,
      problem_description,
      link_customer: customer_id || null,
      created_by: createdBy,
      images: images.length ? images : null,
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
