/**
 * AI Router Module - UNIAPI ONLY
 * 
 * Simplified to use only UniAPI as per user request.
 */

const CONFIG = {
    uniapi: {
        enabled: true,
        apiKey: process.env.UNIAPI_KEY || process.env.OPENAI_API_KEY,
        baseUrl: 'https://api.uniapi.io/v1',
        model: 'gemini-3-flash-preview',
    }
};

class UniapiAdapter {
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
            response_format: { type: 'json_object' }
        };

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

        return await res.json();
    }
}

class AIRouter {
    constructor() {
        this.uniapiAdapter = new UniapiAdapter();
    }

    async chatCompletion(request, options = {}) {
        try {
            console.log('[AI Router] Using UniAPI (SOLO API ROUTE)');
            return await this.uniapiAdapter.call(request);
        } catch (err) {
            console.error('[AI Router] UniAPI error:', err.message);
            throw new Error(`AI processing failed: ${err.message}`);
        }
    }

    // Stub methods to prevent breakage in adminRoutes
    getStats() {
        return {
            date: new Date().toISOString().split('T')[0],
            google: { total: 0, byKey: [] },
            uniapi: { total: 'tracked globally in UniAPI dashboard' }
        };
    }

    resetQuota() {
        return this.getStats();
    }
}

const aiRouter = new AIRouter();

module.exports = {
    aiRouter,
    AIRouter,
    UniapiAdapter,
    CONFIG
};
