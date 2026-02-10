/**
 * AI Router HTTP API Routes
 * 
 * Provides REST endpoints for external access to the AI Router.
 * This allows non-Node.js services or frontend apps to use the router.
 * 
 * MOUNTING:
 *   const aiRoutes = require('./src/modules/AIRouter/routerRoutes');
 *   app.use('/api/ai', aiRoutes);
 * 
 * ENDPOINTS:
 *   POST /api/ai/chat   - Chat completion
 *   GET  /api/ai/stats  - Get quota statistics
 *   POST /api/ai/reset  - Reset quota counters (admin)
 * 
 * AUTHENTICATION:
 *   Currently no auth - add middleware as needed:
 *   router.use(authMiddleware);
 */

const express = require('express');
const router = express.Router();
const { aiRouter } = require('./aiRouter');

/**
 * POST /api/ai/chat
 * 
 * OpenAI-compatible chat completion endpoint.
 * 
 * Request Body:
 *   {
 *     "messages": [
 *       { "role": "user", "content": "Hello!" }
 *     ],
 *     "temperature": 0.7,      // optional
 *     "max_tokens": 200,       // optional
 *     "force_provider": "uniapi" // optional: "google" | "uniapi"
 *   }
 * 
 * Response:
 *   {
 *     "id": "google-1234567890",
 *     "object": "chat.completion",
 *     "created": 1234567890,
 *     "model": "gemini-3-flash-preview",
 *     "choices": [...],
 *     "usage": { "prompt_tokens": 10, ... }
 *   }
 * 
 * Error Response:
 *   {
 *     "error": "AI request failed",
 *     "message": "..."
 *   }
 */
router.post('/chat', async (req, res) => {
    try {
        const { messages, temperature, max_tokens, force_provider } = req.body;
        
        // Validation
        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({
                error: 'Invalid request: messages array required'
            });
        }
        
        if (messages.length === 0) {
            return res.status(400).json({
                error: 'Invalid request: messages cannot be empty'
            });
        }
        
        // Build options
        const options = {};
        if (force_provider === 'google') options.forceGoogle = true;
        if (force_provider === 'uniapi') options.forceUniapi = true;
        
        // Call router
        const response = await aiRouter.chatCompletion({
            messages,
            temperature,
            max_tokens
        }, options);
        
        res.json(response);
        
    } catch (err) {
        console.error('[AI Router API] Error:', err.message);
        res.status(500).json({
            error: 'AI request failed',
            message: err.message
        });
    }
});

/**
 * GET /api/ai/stats
 * 
 * Get current quota usage statistics.
 * Useful for monitoring dashboards.
 * 
 * Response:
 *   {
 *     "date": "2026-01-30",
 *     "google": {
 *       "total": 45,
 *       "byKey": [
 *         { "key": "key_1", "used": 12, "limit": 120, "remaining": 108 },
 *         ...
 *       ]
 *     },
 *     "uniapi": {
 *       "total": 5
 *     }
 *   }
 */
router.get('/stats', (req, res) => {
    try {
        const stats = aiRouter.getStats();
        res.json(stats);
    } catch (err) {
        console.error('[AI Router API] Stats error:', err.message);
        res.status(500).json({
            error: 'Failed to get stats',
            message: err.message
        });
    }
});

/**
 * POST /api/ai/reset
 * 
 * Reset quota counters.
 * WARNING: This clears all usage tracking!
 * 
 * TODO: Add authentication before using in production!
 * 
 * Response:
 *   { "message": "Quota counters reset" }
 */
router.post('/reset', (req, res) => {
    // SECURITY WARNING: Add auth middleware!
    // Example:
    // if (!req.user || !req.user.isAdmin) {
    //     return res.status(403).json({ error: 'Forbidden' });
    // }
    
    try {
        aiRouter.resetQuota();
        res.json({ message: 'Quota counters reset' });
    } catch (err) {
        console.error('[AI Router API] Reset error:', err.message);
        res.status(500).json({
            error: 'Failed to reset quota',
            message: err.message
        });
    }
});

/**
 * Health check endpoint
 * GET /api/ai/health
 */
router.get('/health', (req, res) => {
    const stats = aiRouter.getStats();
    res.json({
        status: 'ok',
        date: stats.date,
        google: {
            configured: true,
            totalCalls: stats.google.total
        },
        uniapi: {
            configured: true,
            totalCalls: stats.uniapi.total
        }
    });
});

module.exports = router;
