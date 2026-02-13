/**
 * Customer Routes Module
 * Handles customer management endpoints
 */
const express = require('express');
const path = require('path');
const pool = require('../../../core/database/pool');
const { requireAuth } = require('../../../core/middleware/auth');
const fs = require('fs');
const https = require('https');
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
 * POST /api/customers/check-whatsapp
 * Check if a user is on WhatsApp (Proxy to avoid CORS)
 */
router.post('/api/customers/check-whatsapp', requireAuth, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Phone number is required' });
    }

    const externalApiUrl = 'https://whatsapp-api-server-production-c15f.up.railway.app/api/check-user';

    // Create a promise to handle the https request
    const checkWhatsAppUser = () => {
      return new Promise((resolve, reject) => {
        const request = https.request(externalApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        }, (response) => {
          let data = '';

          response.on('data', (chunk) => {
            data += chunk;
          });

          response.on('end', () => {
            try {
              if (response.statusCode >= 200 && response.statusCode < 300) {
                resolve(JSON.parse(data));
              } else {
                reject(new Error(`External API returned ${response.statusCode}: ${data}`));
              }
            } catch (e) {
              reject(new Error('Failed to parse external API response'));
            }
          });
        });

        request.on('error', (err) => {
          reject(err);
        });

        request.write(JSON.stringify({ phone }));
        request.end();
      });
    };

    const result = await checkWhatsAppUser();
    res.json(result);

  } catch (err) {
    console.error('Error checking WhatsApp user:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to connect to WhatsApp API server',
      details: err.message
    });
  }
});


/**
 * POST /api/customers/whatsapp-photo
 * Download and store WhatsApp profile picture
 */
router.post('/api/customers/whatsapp-photo', requireAuth, async (req, res) => {
  try {
    const { photoUrl, phone } = req.body;
    if (!photoUrl || !phone) {
      return res.status(400).json({ success: false, error: 'Photo URL and phone required' });
    }

    const storagePath = process.env.RAILWAY_VOLUME_MOUNT_PATH
      ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'customer_profiles')
      : path.resolve(__dirname, '../../../../storage/customer_profiles');

    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }

    const filename = `wa_${phone}_${Date.now()}.jpg`;
    const filepath = path.join(storagePath, filename);

    const file = fs.createWriteStream(filepath);

    https.get(photoUrl, (response) => {
      if (response.statusCode !== 200) {
        res.status(500).json({ success: false, error: `Failed to download image: ${response.statusCode}` });
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        const publicUrl = `/uploads/customer_profiles/${filename}`;
        res.json({ success: true, localUrl: publicUrl });
      });
    }).on('error', (err) => {
      fs.unlink(filepath, () => { }); // Delete temp file
      console.error('Error saving WhatsApp photo:', err);
      res.status(500).json({ success: false, error: 'Failed to save profile picture' });
    });

  } catch (err) {
    console.error('Error saving WhatsApp photo:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

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

router.post('/api/customers', requireAuth, async (req, res) => {
  let client = null;
  try {
    const userId = req.user.userId;
    const { name, phone, email, address, city, state, postcode, profilePicture, leadSource, remark } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    if (!leadSource) {
      return res.status(400).json({ success: false, error: 'Lead source is required' });
    }

    client = await pool.connect();
    const customer = await customerRepo.createCustomer(client, {
      name, phone, email, address, city, state, postcode, userId, profilePicture, leadSource, remark
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
    const { name, phone, email, address, city, state, postcode, profilePicture, leadSource, remark } = req.body;

    client = await pool.connect();
    const customer = await customerRepo.updateCustomer(client, id, {
      name, phone, email, address, city, state, postcode, userId, profilePicture, leadSource, remark
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