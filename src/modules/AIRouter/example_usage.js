/**
 * AI Router Usage Examples
 * 
 * This file demonstrates how other modules should use the AI Router.
 * 
 * KEY PRINCIPLES:
 * 1. Other modules import the router, not individual adapters
 * 2. Use OpenAI-compatible request format always
 * 3. Let the router handle provider selection
 * 4. Handle errors at the call site
 * 
 * INTEGRATION GUIDE:
 * 
 * 1. Add to your module:
 *    const { aiRouter } = require('../AIRouter/aiRouter');
 * 
 * 2. Replace direct API calls with:
 *    const response = await aiRouter.chatCompletion({ messages: [...] });
 * 
 * 3. Extract response content:
 *    const content = response.choices[0].message.content;
 * 
 * That's it! The router handles routing, quotas, and format conversion.
 */

const { aiRouter } = require('./aiRouter');

// =============================================================================
// EXAMPLE 1: Simple Text Call (Most Common)
// =============================================================================
/**
 * Basic usage - router automatically picks Google (free) or UniAPI (paid)
 * based on quota availability.
 */
async function simpleExample() {
    try {
        const response = await aiRouter.chatCompletion({
            messages: [
                { role: 'user', content: 'Write a one-sentence bedtime story about a unicorn.' }
            ]
            // Optional parameters:
            // temperature: 0.7,
            // max_tokens: 100
        });
        
        // Response is always OpenAI-compatible format
        console.log('Content:', response.choices[0].message.content);
        console.log('Provider:', response.id.startsWith('google') ? 'Google AI' : 'UniAPI');
        console.log('Model:', response.model);
        console.log('Tokens used:', response.usage);
        
        return response;
    } catch (err) {
        // Handle errors (both providers failed)
        console.error('AI call failed:', err.message);
        throw err;
    }
}

// =============================================================================
// EXAMPLE 2: Force Specific Provider
// =============================================================================
/**
 * Sometimes you need to force a specific provider:
 * - forceGoogle: Use free tier only (fails if quota exhausted)
 * - forceUniapi: Skip free tier, use paid directly
 */
async function forceProviderExample() {
    // Force Google AI - will fail if no quota instead of falling back
    try {
        const response1 = await aiRouter.chatCompletion({
            messages: [{ role: 'user', content: 'Test force Google' }]
        }, { forceGoogle: true });  // ← Options as second argument
        
        console.log('Forced Google response:', response1.choices[0].message.content);
    } catch (err) {
        console.log('Google failed (likely quota):', err.message);
    }
    
    // Force UniAPI - skip Google entirely
    const response2 = await aiRouter.chatCompletion({
        messages: [{ role: 'user', content: 'Test force UniAPI' }]
    }, { forceUniapi: true });
    
    console.log('Forced UniAPI response:', response2.choices[0].message.content);
}

// =============================================================================
// EXAMPLE 3: Multimodal (Image + Text)
// =============================================================================
/**
 * Send images along with text. Router handles format conversion internally.
 * 
 * IMPORTANT: Image must be base64-encoded data URL format:
 * data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...
 */
async function multimodalExample(imageBase64, mimeType = 'image/jpeg') {
    const response = await aiRouter.chatCompletion({
        messages: [
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'What do you see in this image?' },
                    {
                        type: 'image_url',
                        image_url: {
                            // Must be data URL format
                            url: `data:${mimeType};base64,${imageBase64}`
                        }
                    }
                ]
            }
        ]
    });
    
    return response.choices[0].message.content;
}

// =============================================================================
// EXAMPLE 4: Conversation (Multiple Messages)
// =============================================================================
async function conversationExample() {
    const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is solar energy?' },
        { role: 'assistant', content: 'Solar energy is...' },
        { role: 'user', content: 'What are the benefits?' }  // Follow-up
    ];
    
    const response = await aiRouter.chatCompletion({ messages });
    return response.choices[0].message.content;
}

// =============================================================================
// EXAMPLE 5: Check Quota Stats
// =============================================================================
/**
 * Useful for admin dashboards or monitoring.
 * Shows usage per key and remaining quota.
 */
async function checkQuota() {
    const stats = aiRouter.getStats();
    
    console.log('=== AI Quota Statistics ===');
    console.log('Date:', stats.date);
    console.log('\nGoogle AI (Free Tier):');
    console.log('  Total calls today:', stats.google.total);
    
    stats.google.byKey.forEach(key => {
        console.log(`  ${key.key}: ${key.used}/${key.limit} (remaining: ${key.remaining})`);
    });
    
    console.log('\nUniAPI (Paid Fallback):');
    console.log('  Total calls today:', stats.uniapi.total);
    
    return stats;
}

// =============================================================================
// EXAMPLE 6: Error Handling Pattern
// =============================================================================
/**
 * Recommended error handling pattern for production code.
 */
async function robustCallExample() {
    const MAX_RETRIES = 2;
    let lastError;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await aiRouter.chatCompletion({
                messages: [{ role: 'user', content: 'Process this document' }]
            });
            
            // Success - return result
            return response.choices[0].message.content;
            
        } catch (err) {
            lastError = err;
            console.error(`Attempt ${attempt} failed:`, err.message);
            
            // Don't retry on client errors (4xx)
            if (err.message.includes('400') || err.message.includes('401')) {
                break;
            }
            
            // Wait before retry
            if (attempt < MAX_RETRIES) {
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }
    }
    
    // All retries failed
    throw new Error(`Failed after ${MAX_RETRIES} attempts: ${lastError.message}`);
}

// =============================================================================
// EXAMPLE 7: Extracting and Parsing JSON
// =============================================================================
/**
 * Common pattern: Ask AI to return JSON, then parse it.
 */
async function extractJsonExample(documentText) {
    const prompt = `
Analyze this text and extract information.
Return ONLY valid JSON in this format:
{
    "name": "extracted name",
    "date": "extracted date",
    "amount": 123.45
}

Text to analyze:
${documentText}
`;

    const response = await aiRouter.chatCompletion({
        messages: [{ role: 'user', content: prompt }]
    });
    
    const content = response.choices[0].message.content;
    
    // Clean up markdown code blocks if present
    const cleanJson = content
        .replace(/```json\n?/g, '')  // Remove ```json
        .replace(/\n?```/g, '')      // Remove ```
        .trim();
    
    try {
        return JSON.parse(cleanJson);
    } catch (e) {
        console.error('Failed to parse AI response as JSON:', content);
        throw new Error('Invalid JSON response from AI');
    }
}

// =============================================================================
// RUN EXAMPLES (if called directly)
// =============================================================================
if (require.main === module) {
    console.log('Running AI Router examples...\n');
    
    // Run examples sequentially
    (async () => {
        try {
            await checkQuota();
            console.log('\n---\n');
            
            await simpleExample();
            console.log('\n---\n');
            
            await checkQuota();  // Show updated stats
            
        } catch (err) {
            console.error('Example failed:', err.message);
        }
    })();
}

// =============================================================================
// EXPORTS
// =============================================================================
module.exports = {
    simpleExample,
    forceProviderExample,
    multimodalExample,
    conversationExample,
    checkQuota,
    robustCallExample,
    extractJsonExample
};
