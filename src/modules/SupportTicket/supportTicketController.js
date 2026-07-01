const supportTicketService = require('./supportTicketService');

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
    const { status, technician_remark } = req.body;
    const ticket = await supportTicketService.updateTicket(req.params.id, { status, technician_remark });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ success: true, ticket });
  } catch (err) {
    console.error('[SupportTicket] Update error:', err);
    res.status(400).json({ error: err.message || 'Failed to update ticket' });
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
