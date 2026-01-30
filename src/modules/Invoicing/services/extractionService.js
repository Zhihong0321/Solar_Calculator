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
    const cleanJson = text
        .replace(/```json\n?/g, '')  // Remove opening code block
        .replace(/\n?```/g, '')      // Remove closing code block
        .trim();
    return JSON.parse(cleanJson);
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
            content = `${prompt}\n\nReturn ONLY valid JSON.`;
        }
        
        // Call AI through router - handles provider selection automatically
        const response = await aiRouter.chatCompletion({
            messages: [{ role: 'user', content }]
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
    const prompt = `
Analyze this Malaysian MyKad (ID Card). 
1. Extract 'customer_name' (full name).
2. Extract 'mykad_id' (12 digits only, no dashes).
3. Assess 'quality_ok': true if the document is clearly visible, not blurry, and not cut off.
4. Provide 'quality_remark': describe any issues (e.g., "clear visibility", "blur detected", "glare on IC number").

Return ONLY JSON:
{
  "customer_name": "string",
  "mykad_id": "string",
  "quality_ok": boolean,
  "quality_remark": "string"
}`;

    return await callAI(prompt, fileBuffer, mimeType, 'Verify MyKad');
}

/**
 * 2. TNB Bill Verification
 * Extracts account number and verifies 3 consecutive months of history.
 * 
 * @param {Buffer} fileBuffer - PDF or image file buffer (TNB bill)
 * @param {string} mimeType - MIME type (default: 'application/pdf')
 * @returns {Promise<Object>} Verification result
 * @returns {string} result.tnb_account - 12-digit account number
 * @returns {boolean} result.consecutive_months_found - Has 3+ months history
 * @returns {boolean} result.quality_ok - Document legibility
 * @returns {string} result.quality_remark - Status description
 */
async function verifyTnbBill(fileBuffer, mimeType = 'application/pdf') {
    const prompt = `
Analyze this TNB (Tenaga Nasional Berhad) electricity bill.
1. Extract 'tnb_account': 12-digit account number.
2. Analyze the 'Kajian Penggunaan' (Usage History) table/chart.
3. Determine 'consecutive_months_found': true if there are at least 3 consecutive months of usage records shown in the history chart for the period immediately preceding this bill.
4. Assess 'quality_ok': true if dates and account numbers are legible.
5. Provide 'quality_remark': e.g., "3 months consecutive found", "History table blurry", "Only 1 month found".

Return ONLY JSON:
{
  "tnb_account": "string",
  "consecutive_months_found": boolean,
  "quality_ok": boolean,
  "quality_remark": "string"
}`;

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
    const prompt = `
Analyze this photo. 
1. Is it a photo of an electricity meter (TNB Meter)?
2. Is 'is_clear': true if the meter reading or serial number is potentially legible?
3. Provide 'remark': e.g., "Clear meter photo", "Too dark", "Not a meter".

Return ONLY JSON:
{
  "is_tnb_meter": boolean,
  "is_clear": boolean,
  "remark": "string"
}`;

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
    const prompt = `
Analyze this property document (e.g., Cukai Pintu, SPA, or Grant).
Compare it with the provided context:
- Target Name: ${context.name || 'Unknown'}
- Target Address: ${context.address || 'Unknown'}

1. Extract 'owner_name' from document.
2. Extract 'property_address' from document.
3. 'name_match': true if the owner name matches the target name (allow minor variations or partial matches).
4. 'address_match': true if the document address matches the target address.
5. Provide 'remark': Summarize the findings (e.g., "Name and Address matched").

Return ONLY JSON:
{
  "owner_name": "string",
  "property_address": "string",
  "name_match": boolean,
  "address_match": boolean,
  "remark": "string"
}`;

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
