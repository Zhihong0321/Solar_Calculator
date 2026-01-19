/**
 * Extraction Service Module
 * Integration with External Extraction API
 */

const API_KEY = 'AIzaSyDoAVsk8yqPC7qCB0krie0G4beXhO4gDpI';
const MODEL = 'gemini-2.5-flash';

/**
 * Extract data from TNB Bill
 * @param {Buffer} fileBuffer 
 * @param {string} filename 
 */
async function extractTnb(fileBuffer, filename) {
    try {
        console.log(`[ExtractionService] Processing TNB Bill with Gemini 2.5: ${filename} (${fileBuffer.length} bytes)`);

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

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error(`[ExtractionService] Gemini API Error ${res.status}: ${errText}`);
            throw new Error(`Gemini API Error: ${res.status} - ${errText}`);
        }
        
        const jsonResponse = await res.json();
        
        let extractedData = {};
        if (jsonResponse.candidates && jsonResponse.candidates[0].content && jsonResponse.candidates[0].content.parts[0].text) {
            const text = jsonResponse.candidates[0].content.parts[0].text;
            try {
                // Clean up any potential markdown formatting just in case
                const cleanJson = text.replace(/```json\n?|\n?```/g, '').trim();
                extractedData = JSON.parse(cleanJson);
            } catch (e) {
                console.error('[ExtractionService] JSON Parse Error:', e);
                console.log('Raw Text:', text);
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
        console.log(`[ExtractionService] Processing MyKad with Gemini 2.5: ${filename} (${fileBuffer.length} bytes)`);

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

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error(`[ExtractionService] Gemini API Error ${res.status}: ${errText}`);
            throw new Error(`Gemini API Error: ${res.status} - ${errText}`);
        }
        
        const jsonResponse = await res.json();
        
        let extractedData = {};
        if (jsonResponse.candidates && jsonResponse.candidates[0].content && jsonResponse.candidates[0].content.parts[0].text) {
            const text = jsonResponse.candidates[0].content.parts[0].text;
            try {
                // Clean up any potential markdown formatting just in case
                const cleanJson = text.replace(/```json\n?|\n?```/g, '').trim();
                extractedData = JSON.parse(cleanJson);
            } catch (e) {
                console.error('[ExtractionService] JSON Parse Error:', e);
                console.log('Raw Text:', text);
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
    extractMykad
};