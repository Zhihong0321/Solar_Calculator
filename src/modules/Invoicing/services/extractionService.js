/**
 * Extraction Service Module
 * Integration with External Extraction API
 */

// API Key Rotation Pool
const API_KEYS = [
    'AIzaSyDoAVsk8yqPC7qCB0krie0G4beXhO4gDpI', // Key 1 (Primary)
    process.env.GOOGLE_AI_KEY_2,               // Key 2
    process.env.GOOGLE_AI_KEY_3,               // Key 3
    process.env.GOOGLE_AI_KEY_4                // Key 4
].filter(key => key); // Remove undefined/null keys

let currentKeyIndex = 0;

/**
 * Get next API key in rotation (Round-Robin)
 */
function getApiKey() {
    if (API_KEYS.length === 0) {
        throw new Error('No Google AI API keys configured.');
    }
    const key = API_KEYS[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
    return key;
}

const MODEL = 'gemini-3-flash-preview'; 

/**
 * Execute Gemini API call with auto-retry across available keys
 * @param {object} payload - The request body
 * @param {string} taskName - For logging context
 */
async function callGeminiWithRetry(payload, taskName) {
    let lastError = null;
    
    // Try as many times as we have keys
    // We loop through the count of keys to give every key a chance
    const maxRetries = API_KEYS.length;

    for (let i = 0; i < maxRetries; i++) {
        const apiKey = getApiKey();
        const keyMask = `...${apiKey.slice(-4)}`;
        
        try {
            console.log(`[ExtractionService] ${taskName} - Attempt ${i + 1}/${maxRetries} using Key ${keyMask}`);
            
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errText = await res.text();
                // 429: Too Many Requests (Quota)
                // 403: Forbidden (Key invalid/expired)
                // 503: Service Unavailable (Overload)
                if (res.status === 429 || res.status === 403 || res.status >= 500) {
                    console.warn(`[ExtractionService] Attempt failed (${res.status}) with Key ${keyMask}. Switching to next key...`);
                    lastError = new Error(`Gemini API Error: ${res.status} - ${errText}`);
                    continue; // Try next key
                }
                // For other errors (400 Bad Request), fail immediately as retrying won't help
                throw new Error(`Gemini API Error: ${res.status} - ${errText}`);
            }

            // Success
            return await res.json();

        } catch (err) {
            lastError = err;
            // If it's a fetch error (network), we might want to retry
            console.warn(`[ExtractionService] Network/Fetch error with Key ${keyMask}:`, err.message);
        }
    }

    throw new Error(`All API keys failed. Last error: ${lastError ? lastError.message : 'Unknown error'}`);
}

/**
 * Extract data from TNB Bill
 * @param {Buffer} fileBuffer 
 * @param {string} filename 
 */
async function extractTnb(fileBuffer, filename) {
    try {
        console.log(`[ExtractionService] Processing TNB Bill: ${filename} (${fileBuffer.length} bytes)`);

        const base64Data = fileBuffer.toString('base64');
        const mimeType = filename && filename.toLowerCase().endsWith('.png') ? 'image/png' : 
                         filename && filename.toLowerCase().endsWith('.jpg') ? 'image/jpeg' : 
                         filename && filename.toLowerCase().endsWith('.jpeg') ? 'image/jpeg' : 'application/pdf';

        const promptText = `
        You are an AI assistant specialized in data extraction from documents.
        Extract the following information from the provided Tenaga Nasional Berhad (TNB) electricity bill.

        Fields to extract:
        1. customer_name: The name of the account holder.
        2. address: The full service address.
        3. tnb_account: The 12-digit account number.
        4. state: The state of the service address (e.g., Selangor, Kuala Lumpur, Johor, etc.).

        Output Requirement:
        - Return ONLY valid JSON.
        - No Markdown code blocks.
        - No explanations or extra text.

        JSON Schema:
        {
          "customer_name": "string",
          "address": "string",
          "tnb_account": "string",
          "state": "string"
        }
        `;

        const payload = {
            contents: [{
                parts: [
                    { text: promptText },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: base64Data
                        }
                    }
                ]
            }]
        };

        const jsonResponse = await callGeminiWithRetry(payload, 'Extract TNB');
        
        let extractedData = {};
        if (jsonResponse.candidates && jsonResponse.candidates[0].content && jsonResponse.candidates[0].content.parts[0].text) {
            const text = jsonResponse.candidates[0].content.parts[0].text;
            try {
                const cleanJson = text.replace(/```json\n?|\n?```/g, '').trim();
                extractedData = JSON.parse(cleanJson);
            } catch (e) {
                console.error('[ExtractionService] JSON Parse Error:', e);
                throw new Error('Failed to parse extraction result');
            }
        } else {
             throw new Error('No content in Gemini response');
        }

        console.log('[ExtractionService] Extraction Success', extractedData);
        
        return {
            status: "success",
            data: extractedData
        };

    } catch (err) {
        console.error('[ExtractionService] TNB Error:', err);
        throw err;
    }
}

/**
 * Extract data from MyKad
 * @param {Buffer} fileBuffer 
 * @param {string} filename 
 */
async function extractMykad(fileBuffer, filename) {
    try {
        console.log(`[ExtractionService] Processing MyKad: ${filename} (${fileBuffer.length} bytes)`);

        const base64Data = fileBuffer.toString('base64');
        const mimeType = filename && filename.toLowerCase().endsWith('.png') ? 'image/png' : 
                         filename && filename.toLowerCase().endsWith('.jpg') ? 'image/jpeg' : 
                         filename && filename.toLowerCase().endsWith('.jpeg') ? 'image/jpeg' : 'application/pdf';

        const promptText = `
        You are an AI assistant specialized in data extraction from documents.
        Extract the following information from the provided Malaysian Identity Card (MyKad).

        Fields to extract:
        1. customer_name: The full name of the cardholder.
        2. mykad_id: The 12-digit IC number (Remove any hyphens or dashes).
        3. address: The full address on the MyKad.

        Output Requirement:
        - Return ONLY valid JSON.
        - No Markdown code blocks.
        - No explanations or extra text.
        - Ensure 'mykad_id' contains ONLY numbers.

        JSON Schema:
        {
          "customer_name": "string",
          "mykad_id": "string",
          "address": "string"
        }
        `;

        const payload = {
            contents: [{
                parts: [
                    { text: promptText },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: base64Data
                        }
                    }
                ]
            }]
        };

        const jsonResponse = await callGeminiWithRetry(payload, 'Extract MyKad');
        
        let extractedData = {};
        if (jsonResponse.candidates && jsonResponse.candidates[0].content && jsonResponse.candidates[0].content.parts[0].text) {
            const text = jsonResponse.candidates[0].content.parts[0].text;
            try {
                const cleanJson = text.replace(/```json\n?|\n?```/g, '').trim();
                extractedData = JSON.parse(cleanJson);
            } catch (e) {
                console.error('[ExtractionService] JSON Parse Error:', e);
                throw new Error('Failed to parse extraction result');
            }
        } else {
             throw new Error('No content in Gemini response');
        }

        console.log('[ExtractionService] MyKad Extraction Success', extractedData);
        
        return {
            status: "success",
            data: extractedData
        };

    } catch (err) {
        console.error('[ExtractionService] MyKad Error:', err);
        throw err;
    }
}

module.exports = {
    extractTnb,
    extractMykad,
    API_KEYS, // Export for Health Check
    MODEL     // Export for Health Check
};