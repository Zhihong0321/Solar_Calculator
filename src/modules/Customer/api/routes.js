/**
 * Customer Routes Module
 * Handles customer management endpoints
 */
const express = require('express');
const path = require('path');
const pool = require('../../../core/database/pool');
const { requireAuth } = require('../../../core/middleware/auth');
const customerRepo = require('../services/customerRepo');

const router = express.Router();

// --- Pages ---

/**
 * GET /my-customers
 * Serve My Customers page
 */
router.get('/my-customers', requireAuth, (req, res) => {
  const templatePath = path.join(__dirname, '../../../../public', 'templates', 'my_customers.html');
  res.sendFile(templatePath);
});

// --- API ---

/**
 * GET /api/customers
 * List customers
 */
router.get('/api/customers', requireAuth, async (req, res) => {
  let client = null;
  try {
    const userId = req.user.userId;
    const { limit, offset, search } = req.query;
    
    client = await pool.connect();
    const result = await customerRepo.getCustomersByUserId(client, userId, { limit, offset, search });
    
    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('Error fetching customers:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * POST /api/customers
 * Create customer
 */
router.post('/api/customers', requireAuth, async (req, res) => {
  let client = null;
  try {
    const userId = req.user.userId;
    const { name, phone, email, address, city, state, postcode } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    client = await pool.connect();
    const customer = await customerRepo.createCustomer(client, {
      name, phone, email, address, city, state, postcode, userId
    });
    
    res.json({
      success: true,
      data: customer
    });
  } catch (err) {
    console.error('Error creating customer:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * PUT /api/customers/:id
 * Update customer
 */
router.put('/api/customers/:id', requireAuth, async (req, res) => {
  let client = null;
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const { name, phone, email, address, city, state, postcode } = req.body;

    client = await pool.connect();
    const customer = await customerRepo.updateCustomer(client, id, {
      name, phone, email, address, city, state, postcode, userId
    });
    
    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found or permission denied' });
    }

    res.json({
      success: true,
      data: customer
    });
  } catch (err) {
    console.error('Error updating customer:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * DELETE /api/customers/:id
 * Delete customer
 */
router.delete('/api/customers/:id', requireAuth, async (req, res) => {
  let client = null;
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    client = await pool.connect();
    await customerRepo.deleteCustomer(client, id, userId);
    
    res.json({
      success: true,
      message: 'Customer deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting customer:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * GET /api/customers/:id/history
 * Get customer history
 */
router.get('/api/customers/:id/history', requireAuth, async (req, res) => {
  let client = null;
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    client = await pool.connect();
    const history = await customerRepo.getCustomerHistory(client, id, userId);
    
    res.json({
      success: true,
      data: history
    });
  } catch (err) {
    console.error('Error fetching customer history:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;