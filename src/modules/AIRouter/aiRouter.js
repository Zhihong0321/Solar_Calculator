/**
 * AI Router Module - UNIAPI ONLY
 *
 * UniAPI is kept in the codebase, but the workflow is disabled by default so
 * the rest of the app can keep running while the external service is down.
 * Re-enable it by setting `UNIAPI_WORKFLOW_DISABLED=false`.
 */

const CONFIG = {
    uniapi: {
        enabled: process.env.UNIAPI_WORKFLOW_DISABLED === 'false',
        apiKey: process.env.UNIAPI_KEY || process.env.OPENAI_API_KEY,
        baseUrl: 'https://api.uniapi.io/v1',
        model: 'gemini-3-flash-preview',
    }
};

class UniapiWorkflowDisabledError extends Error {
    constructor(message = 'UniAPI workflow is temporarily disabled') {
        super(message);
        this.name = 'UniapiWorkflowDisabledError';
        this.code = 'UNIAPI_WORKFLOW_DISABLED';
        this.statusCode = 503;
    }
}

class UniapiAdapter {
    async call(openaiRequest) {
        if (!CONFIG.uniapi.enabled) {
            throw new UniapiWorkflowDisabledError();
        }

        if (!CONFIG.uniapi.apiKey) {
            throw new Error('UniAPI not configured');
        }

        const url = `${CONFIG.uniapi.baseUrl}/chat/completions`;

        const payload = {
            model: CONFIG.uniapi.model,
            messages: openaiRequest.messages,
            temperature: openaiRequest.temperature,
            max_tokens: openaiRequest.max_tokens,
            response_format: openaiRequest.response_format || undefined
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

    isUniapiWorkflowEnabled() {
        return CONFIG.uniapi.enabled && Boolean(CONFIG.uniapi.apiKey);
    }

    async chatCompletion(request, options = {}) {
        try {
            if (!this.isUniapiWorkflowEnabled()) {
                throw new UniapiWorkflowDisabledError();
            }

            console.log('[AI Router] Using UniAPI');
            return await this.uniapiAdapter.call(request);
        } catch (err) {
            if (err instanceof UniapiWorkflowDisabledError || err.code === 'UNIAPI_WORKFLOW_DISABLED') {
                console.warn('[AI Router] UniAPI workflow disabled:', err.message);
                throw err;
            }

            console.error('[AI Router] UniAPI error:', err.message);
            throw new Error(`AI processing failed: ${err.message}`);
        }
    }

    // Stub methods to prevent breakage in adminRoutes
    getStats() {
        return {
            date: new Date().toISOString().split('T')[0],
            google: { total: 0, byKey: [] },
            uniapi: {
                total: 0,
                enabled: this.isUniapiWorkflowEnabled(),
                status: this.isUniapiWorkflowEnabled() ? 'enabled' : 'disabled'
            }
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
    CONFIG,
    UniapiWorkflowDisabledError
};
