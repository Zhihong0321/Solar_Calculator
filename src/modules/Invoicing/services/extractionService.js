/**
 * Extraction & Verification Service Module
 * 
 * This module handles all AI-powered document processing using the AI Router.
 * 
 * MIGRATION NOTE (2026-01-30):
 * This service was refactored to use the AI Router module instead of directly
 * calling the Google Gemini API. The AI Router provides:
 * 
 * 1. AUTOMATIC FALLBACK: Uses Google AI (free tier) first, falls back to 
 *    UniAPI (paid) when quota is exhausted
 * 2. UNIFIED INTERFACE: All AI calls use OpenAI-compatible format
 * 3. QUOTA MANAGEMENT: Automatic tracking of 120 calls/day limit per key
 * 
 * BEFORE: Direct fetch() calls to generativelanguage.googleapis.com
 * AFTER:  aiRouter.chatCompletion() with automatic provider selection
 * 
 * AI Model: gemini-3-flash-preview (via AI Router)
 * 
 * @module extractionService
 * @requires ../AIRouter/aiRouter
 */

const { aiRouter } = require('../../AIRouter/aiRouter');

/**
 * Helper: Extract JSON from AI response text
 * Handles markdown code blocks and trims whitespace
 * 
 * @param {string} text - Raw text from AI response
 * @returns {Object} Parsed JSON object
 * @throws {Error} If JSON parsing fails
 */
function extractJson(text) {
    // If response is already an object (shouldn't happen but safety check)
    if (typeof text === 'object') return text;
    
    // Clean up the text - remove markdown code blocks and extra whitespace
    let cleanJson = text
        .replace(/^```json\s*/i, '')   // Remove opening ```json
        .replace(/^```\s*/i, '')       // Remove opening ```
        .replace(/\s*```$/i, '')       // Remove closing ```
        .trim();
    
    // Try to find JSON object if there's surrounding text
    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        cleanJson = jsonMatch[0];
    }
    
    try {
        return JSON.parse(cleanJson);
    } catch (err) {
        console.error('[ExtractionService] JSON Parse Error:', err.message);
        console.error('[ExtractionService] Raw text:', text.substring(0, 200));
        throw new Error(`Invalid JSON response: ${err.message}`);
    }
}

/**
 * Helper: Build multimodal message content for image analysis
 * 
 * @param {string} prompt - Text prompt for the AI
 * @param {Buffer} fileBuffer - Image file buffer
 * @param {string} mimeType - MIME type (e.g., 'image/jpeg')
 * @returns {Array} OpenAI-compatible content array
 */
function buildMultimodalContent(prompt, fileBuffer, mimeType) {
    const base64Data = fileBuffer.toString('base64');
    return [
        { type: 'text', text: prompt },
        {
            type: 'image_url',
            image_url: {
                url: `data:${mimeType};base64,${base64Data}`
            }
        }
    ];
}

/**
 * STRICT system prompt for JSON-only responses
 * This is prepended to all extraction requests to enforce format
 */
const STRICT_JSON_SYSTEM_PROMPT = `You are a data extraction API. Your ONLY purpose is to extract specific fields from documents and return them as valid JSON.

CRITICAL RULES:
1. Return ONLY a JSON object - no greetings, no explanations, no markdown formatting
2. Do NOT ask follow-up questions
3. Do NOT add conversational text like "Here is the extracted data" or "What would you like next?"
4. If a field cannot be found, use empty string "" or null
5. Ensure the JSON is valid and parseable
6. Never wrap the JSON in code blocks (no \\\`\\\`\\\`json)`;

/**
 * Generic AI caller through the AI Router
 * 
 * @param {string} prompt - The prompt text
 * @param {Buffer} [fileBuffer] - Optional file buffer for multimodal
 * @param {string} [mimeType] - Optional MIME type for file
 * @param {string} taskName - Task name for error logging
 * @returns {Promise<Object>} Parsed JSON result
 * @throws {Error} If AI call or JSON parsing fails
 */
async function callAI(prompt, fileBuffer, mimeType, taskName) {
    try {
        let content;
        
        // Build message content (text-only or multimodal)
        if (fileBuffer && mimeType) {
            content = buildMultimodalContent(prompt, fileBuffer, mimeType);
        } else {
            content = prompt;
        }
        
        // Call AI through router with system prompt
        // The router now enforces JSON format at API level
        const response = await aiRouter.chatCompletion({
            messages: [
                { role: 'system', content: STRICT_JSON_SYSTEM_PROMPT },
                { role: 'user', content }
            ]
        });
        
        // Extract and parse JSON from response
        const text = response.choices[0].message.content;
        return extractJson(text);
        
    } catch (err) {
        console.error(`[ExtractionService] ${taskName} Error:`, err.message);
        throw err;
    }
}

// =============================================================================
// DOCUMENT VERIFICATION FUNCTIONS
// =============================================================================

/**
 * 1. MyKad Verification
 * Extracts name and IC number, and assesses document visibility/quality.
 * 
 * @param {Buffer} fileBuffer - Image file buffer (MyKad photo)
 * @param {string} mimeType - MIME type (default: 'image/jpeg')
 * @returns {Promise<Object>} Verification result
 * @returns {string} result.customer_name - Full name from MyKad
 * @returns {string} result.mykad_id - 12-digit IC number
 * @returns {boolean} result.quality_ok - Document clarity assessment
 * @returns {string} result.quality_remark - Quality description
 */
async function verifyMykad(fileBuffer, mimeType = 'image/jpeg') {
    const prompt = `TASK: Extract information from Malaysian MyKad (ID Card).

EXTRACT THESE EXACT FIELDS:
- customer_name: Full name as printed on MyKad
- mykad_id: 12-digit IC number (numbers only, NO dashes)
- quality_ok: Boolean - true if clearly visible, not blurry, not cut off
- quality_remark: Brief description of quality (e.g., "clear", "blurry", "glare")

STRICT OUTPUT FORMAT - RETURN ONLY THIS JSON:
{"customer_name":"","mykad_id":"","quality_ok":false,"quality_remark":""}`;

    return await callAI(prompt, fileBuffer, mimeType, 'Verify MyKad');
}

/**
 * 2. TNB Bill Verification
 * Extracts customer information and account details from TNB bill.
 * 
 * WARNING: Only extracts these 4 fields - DO NOT add other fields:
 * - customer_name, address, state, tnb_account
 * 
 * @param {Buffer} fileBuffer - PDF or image file buffer (TNB bill)
 * @param {string} mimeType - MIME type (default: 'application/pdf')
 * @returns {Promise<Object>} Extracted bill information
 * @returns {string} result.customer_name - Customer name on bill
 * @returns {string} result.address - Full billing address
 * @returns {string} result.state - Malaysian state (Johor, Melaka, Selangor, etc.)
 * @returns {string} result.tnb_account - 12-digit account number
 */
async function verifyTnbBill(fileBuffer, mimeType = 'application/pdf') {
    const prompt = `TASK: Extract information from TNB (Tenaga Nasional Berhad) electricity bill.

EXTRACT THESE EXACT 4 FIELDS ONLY:
- customer_name: Name of account holder printed on bill
- address: Complete billing address as shown on bill
- state: Malaysian state from address (Johor/Melaka/Negeri Sembilan/Selangor/Kuala Lumpur/Penang/Perak/Kedah/Kelantan/Terengganu/Pahang/Sabah/Sarawak)
- tnb_account: 12-digit TNB account number

STRICT OUTPUT FORMAT - RETURN ONLY THIS JSON:
{"customer_name":"","address":"","state":"","tnb_account":""}`;

    return await callAI(prompt, fileBuffer, mimeType, 'Verify TNB Bill');
}

/**
 * 3. TNB Meter Verification
 * Checks if the uploaded photo is a clear, valid electricity meter.
 * 
 * @param {Buffer} fileBuffer - Image file buffer (meter photo)
 * @param {string} mimeType - MIME type (default: 'image/jpeg')
 * @returns {Promise<Object>} Verification result
 * @returns {boolean} result.is_tnb_meter - Is this a TNB meter
 * @returns {boolean} result.is_clear - Is the photo clear/readable
 * @returns {string} result.remark - Status description
 */
async function verifyTnbMeter(fileBuffer, mimeType = 'image/jpeg') {
    const prompt = `TASK: Verify if this photo shows a TNB electricity meter.

EXTRACT THESE EXACT FIELDS:
- is_tnb_meter: Boolean - true if photo shows TNB electricity meter
- is_clear: Boolean - true if meter reading/serial is potentially readable
- remark: Brief status (e.g., "Clear meter", "Too dark", "Not a meter")

STRICT OUTPUT FORMAT - RETURN ONLY THIS JSON:
{"is_tnb_meter":false,"is_clear":false,"remark":""}`;

    return await callAI(prompt, fileBuffer, mimeType, 'Verify TNB Meter');
}

/**
 * 4. Property Ownership Verification
 * Cross-references Ownership Document with Applicant Name and Address.
 * 
 * @param {Buffer} fileBuffer - PDF or image file buffer (ownership document)
 * @param {string} mimeType - MIME type (default: 'application/pdf')
 * @param {Object} context - Context for verification
 * @param {string} context.name - Target name to match
 * @param {string} context.address - Target address to match
 * @returns {Promise<Object>} Verification result
 * @returns {string} result.owner_name - Name from document
 * @returns {string} result.property_address - Address from document
 * @returns {boolean} result.name_match - Does name match target
 * @returns {boolean} result.address_match - Does address match target
 * @returns {string} result.remark - Summary of findings
 */
async function verifyOwnership(fileBuffer, mimeType = 'application/pdf', context) {
    const prompt = `TASK: Verify property ownership document against applicant info.

APPLICANT CONTEXT:
- Target Name: ${context.name || 'Unknown'}
- Target Address: ${context.address || 'Unknown'}

EXTRACT THESE EXACT FIELDS:
- owner_name: Property owner name from document
- property_address: Full property address from document  
- name_match: Boolean - true if owner_name matches target name (allow minor variations)
- address_match: Boolean - true if property_address matches target address
- remark: Brief summary (e.g., "Name and Address matched", "Name mismatch")

STRICT OUTPUT FORMAT - RETURN ONLY THIS JSON:
{"owner_name":"","property_address":"","name_match":false,"address_match":false,"remark":""}`;

    return await callAI(prompt, fileBuffer, mimeType, 'Verify Ownership');
}

// =============================================================================
// EXPORTS
// =============================================================================

/**
 * DEPRECATED EXPORTS:
 * API_KEYS and MODEL are no longer needed since the AI Router handles
 * key management and model configuration internally.
 * 
 * They are exported here for backward compatibility with code that imports them
 * (e.g., adminRoutes.js health check), but should not be used for new code.
 */
const API_KEYS = [
    process.env.GOOGLE_AI_KEY_1,
    process.env.GOOGLE_AI_KEY_2,
    process.env.GOOGLE_AI_KEY_3,
    process.env.GOOGLE_AI_KEY_4
].filter(key => key);

const MODEL = 'gemini-3-flash-preview';

module.exports = {
    // Main verification functions
    verifyMykad,
    verifyTnbBill,
    verifyTnbMeter,
    verifyOwnership,
    
    // Deprecated - kept for backward compatibility
    API_KEYS,
    MODEL
};
