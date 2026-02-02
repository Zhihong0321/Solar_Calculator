const express = require('express');
const path = require('path');
const pool = require('../../../core/database/pool');
const { requireAuth } = require('../../../core/middleware/auth');
const referralRepo = require('../services/referralRepo');

const router = express.Router();

/**
 * PAGE ROUTE
 * GET /referral-dashboard/:shareToken
 * Customer referral dashboard page
 */
router.get('/referral-dashboard/:shareToken', async (req, res) => {
  res.sendFile(path.join(__dirname, '../../../../public/templates/referral_dashboard.html'));
});

/**
 * API ROUTES
 */

/**
 * GET /api/v1/referrals/my-referrals
 * Get all referrals for the logged-in agent
 */
router.get('/api/v1/referrals/my-referrals', requireAuth, async (req, res) => {
  let client = null;
  try {
    const userId = req.user.userId;
    client = await pool.connect();
    
    const referrals = await referralRepo.getReferralsByAgentId(client, userId);
    
    res.json({ success: true, data: referrals });
  } catch (err) {
    console.error('[Referral API] Error fetching agent referrals:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * GET /api/v1/referrals/by-token/:shareToken
 * Get referrals for a customer via invoice share token
 */
router.get('/api/v1/referrals/by-token/:shareToken', async (req, res) => {
  let client = null;
  try {
    const { shareToken } = req.params;
    client = await pool.connect();
    
    const customerId = await referralRepo.getCustomerIdFromShareToken(client, shareToken);
    if (!customerId) {
      return res.status(404).json({ success: false, error: 'Invalid share token or customer not found' });
    }
    
    const referrals = await referralRepo.getReferralsByCustomerId(client, customerId);
    
    res.json({ success: true, data: { referrals, customerId } });
  } catch (err) {
    console.error('[Referral API] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * POST /api/v1/referrals
 * Create a new referral via share token
 */
router.post('/api/v1/referrals', async (req, res) => {
  let client = null;
  try {
    const { shareToken, name, relationship, mobileNumber } = req.body;
    
    if (!shareToken || !name || !mobileNumber) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: shareToken, name, mobileNumber' 
      });
    }
    
    // Validate mobile number format (Malaysian format: start with 0, 10-11 digits)
    if (!/^0\d{9,10}$/.test(mobileNumber)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid mobile number format. Must start with 0 and be 10-11 digits.' 
      });
    }
    
    client = await pool.connect();
    
    // Get customer ID and agent ID
    const customerId = await referralRepo.getCustomerIdFromShareToken(client, shareToken);
    if (!customerId) {
      return res.status(404).json({ success: false, error: 'Invalid share token' });
    }
    
    const agentId = await referralRepo.getAgentIdFromCustomer(client, customerId);
    
    // Create referral
    const referral = await referralRepo.createReferral(client, {
      customerId,
      agentId,
      name,
      relationship,
      mobileNumber
    });
    
    res.json({ success: true, data: referral });
  } catch (err) {
    console.error('Error creating referral:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * PUT /api/v1/referrals/:bubbleId/status
 * Update referral status (agent only)
 */
router.put('/api/v1/referrals/:bubbleId/status', requireAuth, async (req, res) => {
  let client = null;
  try {
    const { bubbleId } = req.params;
    const { status, linkedInvoice, dealValue } = req.body;
    const userId = req.user.userId;
    
    client = await pool.connect();
    
    // Verify ownership
    const referral = await referralRepo.getReferralByBubbleId(client, bubbleId);
    if (!referral) {
      return res.status(404).json({ success: false, error: 'Referral not found' });
    }
    
    if (referral.linked_agent !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    // Calculate commission if deal value provided
    let commissionEarned = null;
    if (dealValue && status === 'Successful') {
      commissionEarned = parseFloat(dealValue) * 0.02; // 2% commission
    }
    
    const updated = await referralRepo.updateReferralStatus(client, bubbleId, {
      status,
      linkedInvoice,
      dealValue,
      commissionEarned
    });
    
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[Referral API] Error updating referral:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
