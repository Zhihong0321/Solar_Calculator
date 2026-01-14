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
        formData.append('file', blob, filename || 'tnb_bill.pdf');

        console.log(`[ExtractionService] Sending TNB Bill: ${filename} (${fileBuffer.length} bytes)`);

        const res = await fetch('https://ee-perplexity-wrapper-production.up.railway.app/api/extract-tnb', {
            method: 'POST',
            body: formData
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error(`[ExtractionService] API Error ${res.status}: ${errText}`);
            throw new Error(`Extraction API Error: ${res.status} - ${errText}`);
        }
        
        const data = await res.json();
        console.log('[ExtractionService] TNB Extraction Success');
        return data;

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
        // Explicitly set MIME type based on extension or default to image/jpeg
        const mimeType = filename.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
        const blob = new Blob([fileBuffer], { type: mimeType });
        formData.append('file', blob, filename || 'mykad.jpg');

        console.log(`[ExtractionService] Sending MyKad: ${filename} (${fileBuffer.length} bytes)`);

        const res = await fetch('https://ee-perplexity-wrapper-production.up.railway.app/api/extract-mykad', {
            method: 'POST',
            body: formData
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error(`[ExtractionService] API Error ${res.status}: ${errText}`);
            throw new Error(`Extraction API Error: ${res.status} - ${errText}`);
        }
        
        const data = await res.json();
        console.log('[ExtractionService] MyKad Extraction Success');
        return data;

    } catch (err) {
        console.error('[ExtractionService] MyKad Error:', err);
        throw err;
    }
}

module.exports = {
    extractTnb,
    extractMykad
};
