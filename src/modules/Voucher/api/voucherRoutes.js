const express = require('express');
const router = express.Router();
const voucherRepo = require('../services/voucherRepo');
const pool = require('../../../core/database/pool');
const { requireAuth } = require('../../../core/middleware/auth');

function toBoolean(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
    if (typeof value === 'number') return value === 1;
    return fallback;
}

function normalizeCategoryPayload(body = {}) {
    return {
        name: String(body.name || '').trim(),
        description: body.description || null,
        active: body.active === undefined ? true : toBoolean(body.active, true),
        disabled: body.disabled === undefined ? false : toBoolean(body.disabled, false),
        max_selectable: body.max_selectable !== undefined ? parseInt(body.max_selectable, 10) : 1,
        min_package_amount: body.min_package_amount === '' || body.min_package_amount === null || body.min_package_amount === undefined
            ? null
            : parseFloat(body.min_package_amount),
        min_panel_quantity: body.min_panel_quantity === '' || body.min_panel_quantity === null || body.min_panel_quantity === undefined
            ? null
            : parseInt(body.min_panel_quantity, 10),
        package_type_scope: body.package_type_scope || 'all',
        sort_order: body.sort_order !== undefined ? parseInt(body.sort_order, 10) : 0
    };
}

/**
 * Voucher Category Management
 */
router.get('/api/voucher-categories', requireAuth, async (req, res) => {
    try {
        const status = req.query.status || 'all';
        const categories = await voucherRepo.getAllVoucherCategories(pool, status);
        res.json({ success: true, categories });
    } catch (err) {
        console.error('Error fetching voucher categories:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch voucher categories' });
    }
});

router.get('/api/voucher-categories/:id', requireAuth, async (req, res) => {
    try {
        const category = await voucherRepo.getVoucherCategoryById(pool, req.params.id);
        if (!category) {
            return res.status(404).json({ success: false, error: 'Voucher category not found' });
        }
        res.json({ success: true, category });
    } catch (err) {
        console.error('Error fetching voucher category:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch voucher category' });
    }
});

router.post('/api/voucher-categories', requireAuth, async (req, res) => {
    try {
        const payload = normalizeCategoryPayload(req.body);
        if (!payload.name) {
            return res.status(400).json({ success: false, error: 'Category name is required' });
        }

        const exists = await voucherRepo.checkVoucherCategoryNameExists(pool, payload.name);
        if (exists) {
            return res.status(400).json({ success: false, error: 'Category name already exists' });
        }

        const category = await voucherRepo.createVoucherCategory(pool, {
            ...payload,
            created_by: req.user?.bubbleId || req.user?.userId || null
        });

        res.status(201).json({ success: true, category });
    } catch (err) {
        console.error('Error creating voucher category:', err);
        res.status(500).json({ success: false, error: err.message || 'Failed to create voucher category' });
    }
});

router.put('/api/voucher-categories/:id', requireAuth, async (req, res) => {
    try {
        const payload = normalizeCategoryPayload(req.body);
        if (!payload.name) {
            return res.status(400).json({ success: false, error: 'Category name is required' });
        }

        const exists = await voucherRepo.checkVoucherCategoryNameExists(pool, payload.name, req.params.id);
        if (exists) {
            return res.status(400).json({ success: false, error: 'Category name already exists' });
        }

        const category = await voucherRepo.updateVoucherCategory(pool, req.params.id, payload);
        if (!category) {
            return res.status(404).json({ success: false, error: 'Voucher category not found' });
        }

        res.json({ success: true, category });
    } catch (err) {
        console.error('Error updating voucher category:', err);
        res.status(500).json({ success: false, error: err.message || 'Failed to update voucher category' });
    }
});

router.patch('/api/voucher-categories/:id/toggle', requireAuth, async (req, res) => {
    try {
        const active = await voucherRepo.toggleVoucherCategoryStatus(pool, req.params.id);
        if (active === null) {
            return res.status(404).json({ success: false, error: 'Voucher category not found' });
        }
        res.json({ success: true, active });
    } catch (err) {
        console.error('Error toggling voucher category status:', err);
        res.status(500).json({ success: false, error: 'Failed to toggle voucher category status' });
    }
});

router.patch('/api/voucher-categories/:id/disable', requireAuth, async (req, res) => {
    try {
        const disabled = toBoolean(req.body?.disabled, false);
        const category = await voucherRepo.setVoucherCategoryDisabled(pool, req.params.id, disabled);
        if (!category) {
            return res.status(404).json({ success: false, error: 'Voucher category not found' });
        }
        res.json({ success: true, category });
    } catch (err) {
        console.error('Error setting voucher category disabled state:', err);
        res.status(500).json({ success: false, error: 'Failed to update disabled state' });
    }
});

router.delete('/api/voucher-categories/:id', requireAuth, async (req, res) => {
    try {
        const success = await voucherRepo.deleteVoucherCategory(pool, req.params.id);
        if (!success) {
            return res.status(404).json({ success: false, error: 'Voucher category not found' });
        }
        res.json({ success: true, message: 'Voucher category deleted successfully' });
    } catch (err) {
        console.error('Error deleting voucher category:', err);
        res.status(500).json({ success: false, error: 'Failed to delete voucher category' });
    }
});

router.post('/api/voucher-categories/:id/restore', requireAuth, async (req, res) => {
    try {
        const success = await voucherRepo.restoreVoucherCategory(pool, req.params.id);
        if (!success) {
            return res.status(404).json({ success: false, error: 'Voucher category not found' });
        }
        res.json({ success: true, message: 'Voucher category restored successfully' });
    } catch (err) {
        console.error('Error restoring voucher category:', err);
        res.status(500).json({ success: false, error: 'Failed to restore voucher category' });
    }
});

/**
 * Voucher Step APIs
 * Consumption endpoints for post-submit flow.
 */
router.get('/api/vouchers/step/:invoiceId/categories', requireAuth, async (req, res) => {
    try {
        const data = await voucherRepo.getVoucherGroupsForInvoiceStep(pool, req.params.invoiceId);
        res.json({ success: true, data });
    } catch (err) {
        console.error('Error loading voucher step categories:', err);
        if (err.message === 'Invoice not found') {
            return res.status(404).json({ success: false, error: err.message });
        }
        res.status(500).json({ success: false, error: 'Failed to load voucher categories for invoice' });
    }
});

router.get('/api/vouchers/step/:invoiceId/selections', requireAuth, async (req, res) => {
    try {
        const selections = await voucherRepo.getInvoiceVoucherSelections(pool, req.params.invoiceId);
        res.json({ success: true, selections });
    } catch (err) {
        console.error('Error loading invoice voucher selections:', err);
        res.status(500).json({ success: false, error: 'Failed to load invoice voucher selections' });
    }
});

router.put('/api/vouchers/step/:invoiceId/selections', requireAuth, async (req, res) => {
    try {
        const voucherBubbleIds = Array.isArray(req.body?.voucherBubbleIds) ? req.body.voucherBubbleIds : [];
        const selections = await voucherRepo.replaceInvoiceVoucherSelections(pool, {
            invoiceId: req.params.invoiceId,
            voucherBubbleIds,
            createdBy: req.user?.bubbleId || req.user?.userId || null
        });

        res.json({ success: true, selections });
    } catch (err) {
        console.error('Error saving invoice voucher selections:', err);
        res.status(400).json({ success: false, error: err.message || 'Failed to save selections' });
    }
});

/**
 * Existing voucher APIs (backward compatibility)
 */
router.get('/api/vouchers_v2', requireAuth, async (req, res) => {
    try {
        const status = req.query.status || 'all';
        const vouchers = await voucherRepo.getAllVouchers(pool, status);
        res.json(vouchers);
    } catch (err) {
        console.error('Error fetching vouchers v2:', err);
        res.status(500).json({ error: 'Failed' });
    }
});

router.get('/api/vouchers', requireAuth, async (req, res) => {
    try {
        const status = req.query.status || 'active';
        const vouchers = await voucherRepo.getAllVouchers(pool, status);
        res.json({ success: true, vouchers: vouchers || [] });
    } catch (err) {
        console.error('Error fetching vouchers:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch vouchers' });
    }
});

router.post('/api/vouchers/:id/restore', requireAuth, async (req, res) => {
    try {
        const success = await voucherRepo.restoreVoucher(pool, req.params.id);
        if (!success) {
            return res.status(404).json({ error: 'Voucher not found' });
        }
        res.json({ success: true, message: 'Voucher restored successfully' });
    } catch (err) {
        console.error('Error restoring voucher:', err);
        res.status(500).json({ error: 'Failed to restore voucher' });
    }
});

router.get('/api/vouchers/:id', requireAuth, async (req, res) => {
    try {
        const voucher = await voucherRepo.getVoucherById(pool, req.params.id);
        if (!voucher) {
            return res.status(404).json({ error: 'Voucher not found' });
        }
        res.json(voucher);
    } catch (err) {
        console.error('Error fetching voucher:', err);
        res.status(500).json({ error: 'Failed to fetch voucher' });
    }
});

router.post('/api/vouchers', requireAuth, async (req, res) => {
    try {
        const voucherCode = String(req.body?.voucher_code || '').trim().toUpperCase();
        if (!voucherCode) {
            return res.status(400).json({ error: 'voucher_code is required' });
        }

        if (await voucherRepo.checkVoucherCodeExists(pool, voucherCode)) {
            return res.status(400).json({ error: 'This voucher code already exists.' });
        }

        const data = {
            ...req.body,
            voucher_code: voucherCode,
            active: req.body?.active === undefined ? true : toBoolean(req.body.active, true),
            public: req.body?.public === undefined ? true : toBoolean(req.body.public, true),
            created_by: req.user?.bubbleId || req.user?.userId || null
        };

        const voucher = await voucherRepo.createVoucher(pool, data);
        res.status(201).json(voucher);
    } catch (err) {
        console.error('Error creating voucher:', err);
        res.status(500).json({ error: 'Failed to create voucher' });
    }
});

router.patch('/api/vouchers/:id/toggle', requireAuth, async (req, res) => {
    try {
        const newStatus = await voucherRepo.toggleVoucherStatus(pool, req.params.id);
        if (newStatus === null) {
            return res.status(404).json({ error: 'Voucher not found' });
        }
        res.json({ success: true, active: newStatus });
    } catch (err) {
        console.error('Error toggling voucher:', err);
        res.status(500).json({ error: 'Failed to toggle status' });
    }
});

router.put('/api/vouchers/:id', requireAuth, async (req, res) => {
    try {
        const voucherCode = String(req.body?.voucher_code || '').trim().toUpperCase();
        if (!voucherCode) {
            return res.status(400).json({ error: 'voucher_code is required' });
        }

        if (await voucherRepo.checkVoucherCodeExists(pool, voucherCode, req.params.id)) {
            return res.status(400).json({ error: 'This voucher code is already in use by another voucher.' });
        }

        const voucher = await voucherRepo.updateVoucher(pool, req.params.id, {
            ...req.body,
            voucher_code: voucherCode,
            active: toBoolean(req.body?.active, false),
            public: toBoolean(req.body?.public, false)
        });

        if (!voucher) {
            return res.status(404).json({ error: 'Voucher not found' });
        }
        res.json(voucher);
    } catch (err) {
        console.error('Error updating voucher:', err);
        res.status(500).json({ error: 'Failed to update voucher' });
    }
});

router.delete('/api/vouchers/:id', requireAuth, async (req, res) => {
    try {
        const success = await voucherRepo.deleteVoucher(pool, req.params.id);
        if (!success) {
            return res.status(404).json({ error: 'Voucher not found' });
        }
        res.json({ success: true, message: 'Voucher deleted successfully' });
    } catch (err) {
        console.error('Error deleting voucher:', err);
        res.status(500).json({ error: 'Failed to delete voucher' });
    }
});

module.exports = router;
