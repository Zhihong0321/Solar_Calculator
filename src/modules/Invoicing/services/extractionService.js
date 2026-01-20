/**
 * Extraction & Verification Service Module
 * 
 * This module handles all interactions with Google Gemini AI for document processing.
 * It is designed to be modular, where each function focuses on a specific document type
 * and returns a standardized verification result.
 * 
 * AI Model: gemini-1.5-flash
 */

const API_KEYS = [
    process.env.GOOGLE_AI_KEY_1,
    process.env.GOOGLE_AI_KEY_2,
    process.env.GOOGLE_AI_KEY_3,
    process.env.GOOGLE_AI_KEY_4
].filter(key => key);

let currentKeyIndex = 0;

/**
 * Rotates through available API keys to balance quota and handle failures.
 */
function getApiKey() {
    if (API_KEYS.length === 0) throw new Error('No Google AI API keys configured.');
    const key = API_KEYS[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
    return key;
}

const MODEL = 'gemini-1.5-flash';

/**
 * Generic handler for Gemini API calls with key rotation and retry logic.
 */
async function callGemini(payload, taskName) {
    const maxRetries = API_KEYS.length;
    let lastError = null;

    for (let i = 0; i < maxRetries; i++) {
        const apiKey = getApiKey();
        try {
            // Using global fetch (available in Node.js 18+)
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errText = await res.text();
                if (res.status === 429 || res.status >= 500) {
                    console.warn(`[AI] Attempt ${i+1} failed (${res.status}) for ${taskName}. Retrying...`);
                    continue;
                }
                throw new Error(`AI API Error: ${res.status} - ${errText}`);
            }

            const json = await res.json();
            if (json.candidates && json.candidates[0].content && json.candidates[0].content.parts[0].text) {
                const text = json.candidates[0].content.parts[0].text;
                const cleanJson = text.replace(/```json\n?|\n?```/g, '').trim();
                return JSON.parse(cleanJson);
            }
            throw new Error('Incomplete response from AI');
        } catch (err) {
            console.error(`[AI] ${taskName} Error with key index ${currentKeyIndex}:`, err.message);
            lastError = err;
        }
    }
    throw lastError;
}

/**
 * 1. MyKad Verification
 * Extracts name and IC number, and assesses document visibility/quality.
 */
async function verifyMykad(fileBuffer, mimeType = 'image/jpeg') {
    const base64Data = fileBuffer.toString('base64');
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

    const payload = {
        contents: [{
            parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Data } }]
        }]
    };

    return await callGemini(payload, 'Verify MyKad');
}

/**
 * 2. TNB Bill Verification
 * Focuses on extracting the account number and verifying 3 consecutive months of history.
 */
async function verifyTnbBill(fileBuffer, mimeType = 'application/pdf') {
    const base64Data = fileBuffer.toString('base64');
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

    const payload = {
        contents: [{
            parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Data } }]
        }]
    };

    return await callGemini(payload, 'Verify TNB Bill');
}

/**
 * 3. TNB Meter Verification
 * Checks if the uploaded photo is a clear, valid electricity meter.
 */
async function verifyTnbMeter(fileBuffer, mimeType = 'image/jpeg') {
    const base64Data = fileBuffer.toString('base64');
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

    const payload = {
        contents: [{
            parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Data } }]
        }]
    };

    return await callGemini(payload, 'Verify TNB Meter');
}

/**
 * 4. Property Ownership Verification
 * Cross-references Ownership Document with Applicant Name and Address.
 */
async function verifyOwnership(fileBuffer, mimeType = 'application/pdf', context) {
    const base64Data = fileBuffer.toString('base64');
    const prompt = `
    Analyze this property document (e.g., Cukai Pintu, SPA, or Grant).
    Compare it with the provided context:
    - Target Name: ${context.name}
    - Target Address: ${context.address}

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

    const payload = {
        contents: [{
            parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Data } }]
        }]
    };

    return await callGemini(payload, 'Verify Ownership');
}

module.exports = {
    verifyMykad,
    verifyTnbBill,
    verifyTnbMeter,
    verifyOwnership
};