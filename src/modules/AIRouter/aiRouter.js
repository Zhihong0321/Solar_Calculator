/**
 * AI Router Module - Centralized AI Provider Management
 * 
 * =============================================================================
 * PURPOSE
 * =============================================================================
 * 
 * This module solves the "free tier + paid fallback" problem for AI API usage.
 * 
 * Problem: You have Google AI free tier (120 calls/day) but need reliability.
 * Solution: This router automatically uses free tier when available, falls back
 *           to paid UniAPI when quota exhausted - all with ONE interface.
 * 
 * =============================================================================
 * ARCHITECTURE FOR FUTURE DEVELOPERS
 * =============================================================================
 * 
 * 1. ADAPTER PATTERN
 *    - Each provider (Google, UniAPI) has an adapter class
 *    - Adapters convert between OpenAI format <-> Provider-native format
 *    - This allows adding new providers without changing consumer code
 * 
 * 2. STRATEGY PATTERN (in AIRouter class)
 *    - Decides which provider to use based on quota availability
 *    - Chain of responsibility: Try Google → If fail/quota → Try UniAPI
 * 
 * 3. SINGLETON PATTERN
 *    - `aiRouter` singleton exported at bottom
 *    - Ensures quota tracking is consistent across the app
 * 
 * 4. QUOTA MANAGEMENT
 *    - QuotaManager persists usage to filesystem (storage/ai_quota.json)
 *    - Auto-resets daily
 *    - Supports multiple Google keys for load distribution
 * 
 * =============================================================================
 * USAGE (Consumer Code - Other Modules)
 * =============================================================================
 * 
 * const { aiRouter } = require('./src/modules/AIRouter/aiRouter');
 * 
 * // Simple text call - router picks provider automatically
 * const response = await aiRouter.chatCompletion({
 *     messages: [{ role: 'user', content: 'Hello' }]
 * });
 * 
 * // Multimodal call (text + image)
 * const response = await aiRouter.chatCompletion({
 *     messages: [{
 *         role: 'user',
 *         content: [
 *             { type: 'text', text: 'Describe this' },
 *             { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,...' } }
 *         ]
 *     }]
 * });
 * 
 * // Force specific provider (optional)
 * await aiRouter.chatCompletion({ messages }, { forceGoogle: true });
 * await aiRouter.chatCompletion({ messages }, { forceUniapi: true });
 * 
 * // Check quota
 * console.log(aiRouter.getStats());
 * 
 * =============================================================================
 * ENVIRONMENT VARIABLES REQUIRED
 * =============================================================================
 * 
 * GOOGLE_AI_KEY_1    (required) Primary Google AI API key
 * GOOGLE_AI_KEY_2-4  (optional) Additional keys for load distribution
 * UNIAPI_KEY         (required for fallback) UniAPI key
 *   OR
 * OPENAI_API_KEY     (alternative) Used if UNIAPI_KEY not set
 * 
 * =============================================================================
 * QUOTA BEHAVIOR
 * =============================================================================
 * 
 * - Google free tier: 120 calls/day per key (configurable in CONFIG)
 * - When Google quota exhausted → automatic UniAPI fallback
 * - Quota persists to storage/ai_quota.json (survives server restart)
 * - Auto-resets at midnight (checks date in quota file)
 * - Multiple Google keys: router uses key with lowest usage
 * 
 * =============================================================================
 * EXTENDING THIS MODULE
 * =============================================================================
 * 
 * To add a new provider (e.g., OpenRouter, Anthropic, etc.):
 * 
 * 1. Create adapter class similar to GoogleAIAdapter or UniapiAdapter
 * 2. Add config in CONFIG constant
 * 3. Instantiate adapter in AIRouter constructor
 * 4. Add to fallback chain in chatCompletion() method
 * 5. Update QuotaManager if the new provider needs quota tracking
 * 
 * Example:
 * 
 * class OpenRouterAdapter {
 *     convertRequest(openaiRequest) { ... }
 *     convertResponse(openRouterResponse) { ... }
 *     async call(openaiRequest) { ... }
 * }
 * 
 * // In AIRouter.chatCompletion():
 * // try Google → catch try UniAPI → catch try OpenRouter
 * 
 * =============================================================================
 * @module AIRouter
 * @author AI Assistant
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

// =============================================================================
// CONFIGURATION
// =============================================================================
// Modify these constants to adjust behavior

const CONFIG = {
    // Google AI (Free Tier Configuration)
    google: {
        enabled: true,
        // Support up to 4 API keys for load distribution
        // Each key gets 120 calls/day on free tier
        apiKeys: [
            process.env.GOOGLE_AI_KEY_1,
            process.env.GOOGLE_AI_KEY_2,
            process.env.GOOGLE_AI_KEY_3,
            process.env.GOOGLE_AI_KEY_4
        ].filter(Boolean),  // Remove undefined/null keys
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        model: 'gemini-3-flash-preview',
        dailyQuota: 120,  // Free tier limit per key per day
    },
    
    // UniAPI (Paid Fallback Configuration)
    uniapi: {
        enabled: true,
        apiKey: process.env.UNIAPI_KEY || process.env.OPENAI_API_KEY,
        baseUrl: 'https://api.uniapi.io/v1',
        model: 'gemini-3-flash-preview',  // Same model, different provider
    },
    
    // Quota persistence file path
    quotaFile: path.join(__dirname, '../../../storage/ai_quota.json'),
};

// =============================================================================
// QUOTA MANAGER
// =============================================================================
/**
 * Manages daily quota tracking for Google AI API keys.
 * 
 * Responsibilities:
 * - Track usage per API key
 * - Persist to filesystem (survives server restart)
 * - Auto-reset daily
 * - Load balancing: recommend key with lowest usage
 * 
 * Data structure in ai_quota.json:
 * {
 *   "date": "2026-01-30",
 *   "google": {
 *     "key_0": 45,  // GOOGLE_AI_KEY_1 used 45 times
 *     "key_1": 30   // GOOGLE_AI_KEY_2 used 30 times
 *   },
 *   "totalGoogleCalls": 75,
 *   "totalUniapiCalls": 12
 * }
 */
class QuotaManager {
    constructor() {
        this.quotaFile = CONFIG.google.quotaFile;
        this.data = this.load();
    }
    
    /**
     * Load quota data from disk or initialize new quota for today
     * @returns {Object} Quota data
     */
    load() {
        try {
            if (fs.existsSync(this.quotaFile)) {
                const data = JSON.parse(fs.readFileSync(this.quotaFile, 'utf8'));
                const today = new Date().toISOString().split('T')[0];
                
                // Auto-reset if date changed (new day)
                if (data.date !== today) {
                    console.log('[AI Router] New day detected, resetting quota counters');
                    return this.reset();
                }
                return data;
            }
        } catch (e) {
            console.error('[AI Router] Error loading quota:', e.message);
        }
        return this.reset();
    }
    
    /**
     * Initialize fresh quota for today
     * @returns {Object} Fresh quota data
     */
    reset() {
        const data = {
            date: new Date().toISOString().split('T')[0],
            google: {},  // key index -> usage count
            totalGoogleCalls: 0,
            totalUniapiCalls: 0
        };
        this.save(data);
        return data;
    }
    
    /**
     * Persist quota data to disk
     * @param {Object} data - Quota data to save (defaults to this.data)
     */
    save(data) {
        try {
            const dir = path.dirname(this.quotaFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.quotaFile, JSON.stringify(data || this.data, null, 2));
        } catch (e) {
            console.error('[AI Router] Error saving quota:', e.message);
        }
    }
    
    /**
     * Increment Google AI usage for a specific key
     * @param {number} keyIndex - Index of the API key (0-3)
     */
    incrementGoogle(keyIndex) {
        const key = `key_${keyIndex}`;
        this.data.google[key] = (this.data.google[key] || 0) + 1;
        this.data.totalGoogleCalls++;
        this.save();
    }
    
    /**
     * Increment UniAPI usage counter
     */
    incrementUniapi() {
        this.data.totalUniapiCalls++;
        this.save();
    }
    
    /**
     * Get usage count for a specific Google key
     * @param {number} keyIndex - Index of the API key
     * @returns {number} Usage count
     */
    getGoogleUsage(keyIndex) {
        return this.data.google[`key_${keyIndex}`] || 0;
    }
    
    /**
     * Get total Google API calls today
     * @returns {number} Total calls
     */
    getTotalGoogleUsage() {
        return this.data.totalGoogleCalls;
    }
    
    /**
     * Check if ANY Google key has remaining quota
     * @returns {boolean} True if at least one key has quota left
     */
    hasGoogleQuota() {
        return CONFIG.google.apiKeys.some((_, idx) => {
            return this.getGoogleUsage(idx) < CONFIG.google.dailyQuota;
        });
    }
    
    /**
     * Get the best available Google key (lowest usage, under quota)
     * @returns {number} Key index, or -1 if no keys available
     */
    getNextAvailableKey() {
        let bestKey = -1;
        let minUsage = Infinity;
        
        CONFIG.google.apiKeys.forEach((_, idx) => {
            const usage = this.getGoogleUsage(idx);
            if (usage < CONFIG.google.dailyQuota && usage < minUsage) {
                minUsage = usage;
                bestKey = idx;
            }
        });
        
        return bestKey;
    }
    
    /**
     * Get full quota statistics for monitoring/admin
     * @returns {Object} Detailed quota stats
     */
    getStats() {
        return {
            date: this.data.date,
            google: {
                total: this.data.totalGoogleCalls,
                byKey: CONFIG.google.apiKeys.map((_, idx) => ({
                    key: `key_${idx + 1}`,
                    used: this.getGoogleUsage(idx),
                    limit: CONFIG.google.dailyQuota,
                    remaining: Math.max(0, CONFIG.google.dailyQuota - this.getGoogleUsage(idx))
                }))
            },
            uniapi: {
                total: this.data.totalUniapiCalls
            }
        };
    }
}

// =============================================================================
// GOOGLE AI ADAPTER
// =============================================================================
/**
 * Adapter for Google AI (Gemini) native API.
 * 
 * Converts OpenAI-compatible requests to Google AI format and back.
 * 
 * Google AI Native Format:
 * Request:  { contents: [{ parts: [{ text: "..." }] }] }
 * Response: { candidates: [{ content: { parts: [{ text: "..." }] } }] }
 * 
 * Supports:
 * - Text-only requests
 * - Multimodal requests (text + images)
 * - Temperature and max_tokens
 */
class GoogleAIAdapter {
    constructor() {
        this.quotaManager = new QuotaManager();
        this.currentKeyIndex = 0;
    }
    
    /**
     * Convert OpenAI format request to Google AI format
     * 
     * OpenAI format:
     * { messages: [{ role: 'user', content: '...' }] }
     * 
     * Google AI format:
     * { contents: [{ parts: [{ text: '...' }] }] }
     * 
     * @param {Object} openaiRequest - OpenAI format request
     * @returns {Object} Google AI format payload
     */
    convertRequest(openaiRequest) {
        const { messages, temperature, max_tokens } = openaiRequest;
        
        // Convert messages array to Google AI parts
        const parts = [];
        
        for (const msg of messages) {
            // Simple text content
            if (typeof msg.content === 'string') {
                parts.push({ text: msg.content });
            } 
            // Multimodal content (array of text/image)
            else if (Array.isArray(msg.content)) {
                for (const item of msg.content) {
                    if (item.type === 'text') {
                        parts.push({ text: item.text });
                    } else if (item.type === 'image_url') {
                        // Parse data:image/jpeg;base64,... format
                        const imageUrl = item.image_url.url;
                        if (imageUrl.startsWith('data:')) {
                            const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
                            if (match) {
                                parts.push({
                                    inline_data: {
                                        mime_type: match[1],
                                        data: match[2]
                                    }
                                });
                            }
                        }
                    }
                }
            }
        }
        
        const payload = {
            contents: [{ parts }]
        };
        
        // Build generation config
        payload.generationConfig = {};
        
        if (temperature !== undefined) {
            payload.generationConfig.temperature = temperature;
        }
        if (max_tokens !== undefined) {
            payload.generationConfig.maxOutputTokens = max_tokens;
        }
        
        // CRITICAL: Enforce JSON output format
        // This prevents the model from adding conversational text
        payload.generationConfig.responseMimeType = 'application/json';
        
        return payload;
    }
    
    /**
     * Convert Google AI response to OpenAI-compatible format
     * 
     * @param {Object} googleResponse - Native Google AI response
     * @returns {Object} OpenAI-compatible response
     */
    convertResponse(googleResponse) {
        const candidate = googleResponse.candidates?.[0];
        if (!candidate || !candidate.content?.parts?.[0]?.text) {
            throw new Error('Invalid response from Google AI');
        }
        
        return {
            id: `google-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: CONFIG.google.model,
            choices: [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: candidate.content.parts[0].text
                },
                finish_reason: candidate.finishReason?.toLowerCase() || 'stop'
            }],
            usage: {
                prompt_tokens: googleResponse.usageMetadata?.promptTokenCount || 0,
                completion_tokens: googleResponse.usageMetadata?.candidatesTokenCount || 0,
                total_tokens: googleResponse.usageMetadata?.totalTokenCount || 0
            }
        };
    }
    
    /**
     * Execute API call to Google AI
     * 
     * @param {Object} openaiRequest - OpenAI format request
     * @returns {Promise<Object>} OpenAI-compatible response
     * @throws {Error} GOOGLE_QUOTA_EXHAUSTED or other API errors
     */
    async call(openaiRequest) {
        if (!CONFIG.google.enabled || CONFIG.google.apiKeys.length === 0) {
            throw new Error('Google AI not configured');
        }
        
        // Get best available key
        const keyIndex = this.quotaManager.getNextAvailableKey();
        if (keyIndex === -1) {
            throw new Error('GOOGLE_QUOTA_EXHAUSTED');
        }
        
        const apiKey = CONFIG.google.apiKeys[keyIndex];
        const payload = this.convertRequest(openaiRequest);
        
        const url = `${CONFIG.google.baseUrl}/models/${CONFIG.google.model}:generateContent?key=${apiKey}`;
        
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!res.ok) {
            const errorText = await res.text();
            // Detect quota exhaustion from error response
            if (res.status === 429 || errorText.includes('quota') || errorText.includes('exhausted')) {
                throw new Error('GOOGLE_QUOTA_EXHAUSTED');
            }
            throw new Error(`Google AI Error: ${res.status} - ${errorText}`);
        }
        
        // Track successful call
        this.quotaManager.incrementGoogle(keyIndex);
        
        const json = await res.json();
        return this.convertResponse(json);
    }
}

// =============================================================================
// UNIAPI ADAPTER
// =============================================================================
/**
 * Adapter for UniAPI.io (OpenAI-compatible API).
 * 
 * UniAPI already uses OpenAI format, so minimal conversion needed.
 * Just passes through with Bearer auth header.
 */
class UniapiAdapter {
    constructor() {
        this.quotaManager = new QuotaManager();
    }
    
    /**
     * Execute API call to UniAPI
     * 
     * @param {Object} openaiRequest - OpenAI format request
     * @returns {Promise<Object>} OpenAI format response (direct from API)
     * @throws {Error} API errors
     */
    async call(openaiRequest) {
        if (!CONFIG.uniapi.enabled || !CONFIG.uniapi.apiKey) {
            throw new Error('UniAPI not configured');
        }
        
        const url = `${CONFIG.uniapi.baseUrl}/chat/completions`;
        
        const payload = {
            model: CONFIG.uniapi.model,
            messages: openaiRequest.messages,
            temperature: openaiRequest.temperature,
            max_tokens: openaiRequest.max_tokens,
            // CRITICAL: Enforce JSON output format (OpenAI-compatible)
            response_format: { type: 'json_object' }
        };
        
        // Remove undefined values from payload
        Object.keys(payload).forEach(key => {
            if (payload[key] === undefined) delete payload[key];
        });
        
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CONFIG.uniapi.apiKey}`
            },
            body: JSON.stringify(payload)
        });
        
        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`UniAPI Error: ${res.status} - ${errorText}`);
        }
        
        // Track usage
        this.quotaManager.incrementUniapi();
        
        return await res.json();
    }
}

// =============================================================================
// MAIN ROUTER CLASS
// =============================================================================
/**
 * Central AI Router - Single entry point for all AI calls.
 * 
 * IMPLEMENTATION NOTES FOR FUTURE DEVELOPERS:
 * 
 * 1. FALLBACK STRATEGY:
 *    The router implements a "try-primary-fallback" pattern:
 *    - If forceUniapi=false (default): Try Google first
 *      - If Google succeeds: return result
 *      - If Google fails with quota: fallback to UniAPI
 *      - If Google fails with other error: fallback to UniAPI
 *    - If forceUniapi=true: Skip Google, use UniAPI directly
 *    - If forceGoogle=true: Use Google only, fail if unavailable
 * 
 * 2. ERROR HANDLING:
 *    - GOOGLE_QUOTA_EXHAUSTED is a special error that triggers fallback
 *    - Other errors from Google also trigger fallback (reliability)
 *    - If UniAPI also fails, throws aggregate error
 * 
 * 3. QUOTA TRACKING:
 *    - Uses QuotaManager singleton for consistency
 *    - Google calls tracked per-key
 *    - UniAPI calls tracked globally
 * 
 * 4. EXTENDING:
 *    To add a new provider:
 *    a. Create NewProviderAdapter class
 *    b. Add to constructor: this.newAdapter = new NewProviderAdapter()
 *    c. Add to fallback chain in chatCompletion()
 *    d. Add config in CONFIG constant
 */
class AIRouter {
    constructor() {
        this.googleAdapter = new GoogleAIAdapter();
        this.uniapiAdapter = new UniapiAdapter();
        this.quotaManager = new QuotaManager();
    }
    
    /**
     * Main entry point - Unified OpenAI-compatible interface
     * 
     * This is THE method other modules use. Everything else is internal.
     * 
     * @param {Object} request - OpenAI-compatible request object
     * @param {Array} request.messages - Array of message objects with {role, content}
     * @param {number} [request.temperature] - Sampling temperature (0-2)
     * @param {number} [request.max_tokens] - Maximum tokens to generate
     * @param {Object} [options] - Router behavior options
     * @param {boolean} [options.forceUniapi=false] - Force using UniAPI (skip Google)
     * @param {boolean} [options.forceGoogle=false] - Force using Google (fail if no quota)
     * @returns {Promise<Object>} OpenAI-compatible response object
     * @throws {Error} If all providers fail
     * 
     * @example
     * // Simple usage - router decides provider
     * const response = await aiRouter.chatCompletion({
     *     messages: [{ role: 'user', content: 'Hello' }]
     * });
     * 
     * @example
     * // Force specific provider
     * const response = await aiRouter.chatCompletion(
     *     { messages: [...] },
     *     { forceUniapi: true }
     * );
     */
    async chatCompletion(request, options = {}) {
        const { forceUniapi = false, forceGoogle = false } = options;
        
        const errors = [];
        
        // ========== TRY GOOGLE AI (unless forced otherwise) ==========
        if (!forceUniapi) {
            try {
                // Check quota or force flag
                if (forceGoogle || this.quotaManager.hasGoogleQuota()) {
                    console.log('[AI Router] Using Google AI (free tier)');
                    return await this.googleAdapter.call(request);
                } else {
                    console.log('[AI Router] Google AI quota exhausted, skipping to UniAPI');
                }
            } catch (err) {
                if (err.message === 'GOOGLE_QUOTA_EXHAUSTED') {
                    console.log('[AI Router] Google AI quota exhausted, falling back to UniAPI');
                    // Fall through to UniAPI
                } else {
                    console.error('[AI Router] Google AI error:', err.message);
                    errors.push({ provider: 'google', error: err.message });
                    // Fall through to UniAPI (reliability fallback)
                }
            }
        }
        
        // ========== FALLBACK TO UNIAPI ==========
        if (!forceGoogle) {
            try {
                console.log('[AI Router] Using UniAPI (paid)');
                return await this.uniapiAdapter.call(request);
            } catch (err) {
                console.error('[AI Router] UniAPI error:', err.message);
                errors.push({ provider: 'uniapi', error: err.message });
            }
        }
        
        // ========== ALL PROVIDERS FAILED ==========
        throw new Error(`All AI providers failed: ${JSON.stringify(errors)}`);
    }
    
    /**
     * Get current quota statistics
     * 
     * Use this for monitoring, admin dashboards, or debugging.
     * 
     * @returns {Object} Quota statistics
     * @example
     * const stats = aiRouter.getStats();
     * console.log(`Google used ${stats.google.total} calls today`);
     * console.log(`UniAPI used ${stats.uniapi.total} calls today`);
     */
    getStats() {
        return this.quotaManager.getStats();
    }
    
    /**
     * Reset quota counters
     * 
     * WARNING: Only use for testing or manual reset.
     * Normally quotas auto-reset at midnight.
     * 
     * @returns {Object} Reset quota data
     */
    resetQuota() {
        return this.quotaManager.reset();
    }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================
// Use this singleton instance throughout your application

const aiRouter = new AIRouter();

module.exports = {
    // Main singleton - use this in your code
    aiRouter,
    
    // Classes exported for testing or advanced usage
    AIRouter,
    GoogleAIAdapter,
    UniapiAdapter,
    QuotaManager,
    
    // Config exported for inspection (read-only recommended)
    CONFIG
};
