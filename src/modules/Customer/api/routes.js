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
const { getRequestUserBubbleId, getRequestLegacyUserId } = require('../../../core/auth/userIdentity');

const router = express.Router();
const WHATSAPP_API_DISABLED = process.env.WHATSAPP_API_DISABLED !== 'false';
const WHATSAPP_API_BASE_URL = process.env.WHATSAPP_API_URL || 'https://whatsapp-api-server-production-c15f.up.railway.app';
const WHATSAPP_API_CHECK_TIMEOUT_MS = Number(process.env.WHATSAPP_API_TIMEOUT_MS || 10000);

function parseMaybeJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

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

    if (WHATSAPP_API_DISABLED) {
      return res.json({
        success: false,
        disabled: true,
        isWhatsAppUser: false,
        ready: false,
        error: 'WhatsApp integration temporarily disabled'
      });
    }

    const externalApiUrl = new URL('/api/check-user', WHATSAPP_API_BASE_URL).toString();

    // Create a promise to handle the https request
    const checkWhatsAppUser = () => {
      return new Promise((resolve, reject) => {
        const request = https.request(externalApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: WHATSAPP_API_CHECK_TIMEOUT_MS
        }, (response) => {
          let data = '';

          response.on('data', (chunk) => {
            data += chunk;
          });

          response.on('end', () => {
            try {
              const payload = parseMaybeJson(data) || {};
              const isNotReady = response.statusCode === 400 && /WhatsApp not ready/i.test(data);

              if (isNotReady) {
                resolve({
                  success: false,
                  isWhatsAppUser: false,
                  ready: false,
                  error: 'WhatsApp service is not ready'
                });
                return;
              }

              if (response.statusCode >= 200 && response.statusCode < 300) {
                resolve(payload);
              } else {
                reject(new Error(`External API returned ${response.statusCode}: ${data}`));
              }
            } catch (e) {
              reject(new Error(`Failed to parse external API response: ${e.message}`));
            }
          });
        });

        request.on('error', (err) => {
          reject(err);
        });

        request.setTimeout(WHATSAPP_API_CHECK_TIMEOUT_MS, () => {
          request.destroy(new Error('WhatsApp API request timed out'));
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

    if (WHATSAPP_API_DISABLED) {
      return res.json({
        success: false,
        disabled: true,
        error: 'WhatsApp integration temporarily disabled'
      });
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
    const userId = getRequestUserBubbleId(req) || getRequestLegacyUserId(req);
    const { limit, offset, search } = req.query;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

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
    const userId = getRequestUserBubbleId(req) || getRequestLegacyUserId(req);
    const { name, phone, email, address, city, state, postcode, profilePicture, leadSource, remark } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    if (!leadSource) {
      return res.status(400).json({ success: false, error: 'Lead source is required' });
    }

    if (!remark?.trim()) {
      return res.status(400).json({ success: false, error: 'Remark is required' });
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
    const userId = getRequestUserBubbleId(req) || getRequestLegacyUserId(req);
    const { id } = req.params;
    const { name, phone, email, address, city, state, postcode, profilePicture, leadSource, remark } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

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
    const userId = getRequestUserBubbleId(req) || getRequestLegacyUserId(req);
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

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
    const userId = getRequestUserBubbleId(req) || getRequestLegacyUserId(req);
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

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
