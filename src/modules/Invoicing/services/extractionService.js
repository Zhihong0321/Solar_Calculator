/**
 * Extraction Service Module
 * Integration with External Extraction API
 */

/**
 * Extract data from TNB Bill
 * @param {Buffer} fileBuffer 
 * @param {string} filename 
 */
async function extractTnb(fileBuffer, filename) {
    try {
        const formData = new FormData();
        // Explicitly set MIME type for PDF to ensure API recognizes it
        const blob = new Blob([fileBuffer], { type: 'application/pdf' });
        
        // Match the working format from image.png
        formData.append('account_name', 'yamal');
        formData.append('query', 'analyze');
        formData.append('file', blob, filename || 'tnb_bill.pdf');

        console.log(`[ExtractionService] Sending TNB Bill via query_with_file: ${filename} (${fileBuffer.length} bytes)`);

        // Switch to the confirmed working endpoint
        const res = await fetch('https://ee-perplexity-wrapper-production.up.railway.app/api/query_with_file', {
            method: 'POST',
            body: formData
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error(`[ExtractionService] API Error ${res.status}: ${errText}`);
            throw new Error(`Extraction API Error: ${res.status} - ${errText}`);
        }
        
        const json = await res.json();
        console.log('[ExtractionService] API Request Success');

        // Note: query_with_file returns a complex object with search results and an answer.
        // We need to parse this to match the expected format for our frontend.
        // Based on the successful test, the data is in json.text (array of steps).
        // The last step or the search results contains the snippet.
        
        // I will return the raw JSON for now, but we might need a mapper to extract 
        // specific fields (account_no, address, etc.) from the text answer.
        return json;

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
        const formData = new FormData();
        // Match the working format from image.png (assuming similar for MyKad)
        const mimeType = filename.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
        const blob = new Blob([fileBuffer], { type: mimeType });
        
        formData.append('account_name', 'yamal');
        formData.append('query', 'analyze');
        formData.append('file', blob, filename || 'mykad.jpg');

        console.log(`[ExtractionService] Sending MyKad via query_with_file: ${filename} (${fileBuffer.length} bytes)`);

        const res = await fetch('https://ee-perplexity-wrapper-production.up.railway.app/api/query_with_file', {
            method: 'POST',
            body: formData
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error(`[ExtractionService] API Error ${res.status}: ${errText}`);
            throw new Error(`Extraction API Error: ${res.status} - ${errText}`);
        }
        
        const json = await res.json();
        console.log('[ExtractionService] MyKad Request Success');
        return json;

    } catch (err) {
        console.error('[ExtractionService] MyKad Error:', err);
        throw err;
    }
}

module.exports = {
    extractTnb,
    extractMykad
};
