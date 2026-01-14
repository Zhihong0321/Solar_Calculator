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
        const blob = new Blob([fileBuffer]);
        formData.append('file', blob, filename);

        const res = await fetch('https://ee-perplexity-wrapper-production.up.railway.app/api/extract-tnb', {
            method: 'POST',
            body: formData
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Extraction API Error: ${res.status} - ${errText}`);
        }
        return await res.json();
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
        const blob = new Blob([fileBuffer]);
        formData.append('file', blob, filename);

        const res = await fetch('https://ee-perplexity-wrapper-production.up.railway.app/api/extract-mykad', {
            method: 'POST',
            body: formData
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Extraction API Error: ${res.status} - ${errText}`);
        }
        return await res.json();
    } catch (err) {
        console.error('[ExtractionService] MyKad Error:', err);
        throw err;
    }
}

module.exports = {
    extractTnb,
    extractMykad
};
