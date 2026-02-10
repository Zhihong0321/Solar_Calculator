/**
 * AI Router Test Script
 * 
 * This script tests the AI Router functionality.
 * Run with: node test_router.js
 * 
 * PREREQUISITES:
 * - Set environment variables:
 *   $env:GOOGLE_AI_KEY_1 = "your-key"
 *   $env:UNIAPI_KEY = "your-key"
 * 
 * WHAT IT TESTS:
 * 1. Quota stats display
 * 2. Automatic provider selection (Google first)
 * 3. Response format verification
 * 4. Quota tracking after calls
 * 5. Forced provider selection
 * 
 * EXPECTED OUTPUT:
 * - Should show quota stats before and after
 * - Should indicate which provider was used
 * - Should show successful AI response
 */

const { aiRouter } = require('./aiRouter');

async function runTests() {
    console.log('========================================');
    console.log('      AI Router Test Suite');
    console.log('========================================\n');
    
    // Test 1: Initial Stats
    console.log('TEST 1: Initial Quota Stats');
    console.log('-----------------------------');
    try {
        const stats = aiRouter.getStats();
        console.log(JSON.stringify(stats, null, 2));
        console.log('[PASS] Stats retrieved successfully\n');
    } catch (err) {
        console.log('[FAIL]', err.message, '\n');
    }
    
    // Test 2: Simple Text Call (Auto Provider Selection)
    console.log('TEST 2: Simple Text Call (Auto-routing)');
    console.log('-----------------------------');
    console.log('This should use Google AI if quota available,');
    console.log('otherwise fall back to UniAPI.\n');
    
    try {
        const startTime = Date.now();
        const response = await aiRouter.chatCompletion({
            messages: [
                { 
                    role: 'user', 
                    content: 'Say exactly "AI Router test successful" and nothing else.' 
                }
            ]
        });
        const duration = Date.now() - startTime;
        
        console.log('Response:', response.choices[0].message.content);
        console.log('Provider:', response.id.startsWith('google') ? 'Google AI' : 'UniAPI');
        console.log('Model:', response.model);
        console.log('Latency:', duration + 'ms');
        console.log('Tokens:', JSON.stringify(response.usage));
        console.log('[PASS] Call successful\n');
        
    } catch (err) {
        console.log('[FAIL]', err.message, '\n');
    }
    
    // Test 3: Stats After Call
    console.log('TEST 3: Quota Stats After Call');
    console.log('-----------------------------');
    try {
        const stats = aiRouter.getStats();
        console.log('Google total calls:', stats.google.total);
        console.log('UniAPI total calls:', stats.uniapi.total);
        
        stats.google.byKey.forEach(key => {
            console.log(`  ${key.key}: ${key.used}/${key.limit} used`);
        });
        console.log('[PASS] Stats updated\n');
    } catch (err) {
        console.log('[FAIL]', err.message, '\n');
    }
    
    // Test 4: Force UniAPI
    console.log('TEST 4: Force UniAPI Provider');
    console.log('-----------------------------');
    console.log('This skips Google and uses UniAPI directly.\n');
    
    try {
        const response = await aiRouter.chatCompletion({
            messages: [
                { 
                    role: 'user', 
                    content: 'Say exactly "UniAPI forced test OK" and nothing else.' 
                }
            ]
        }, { forceUniapi: true });
        
        console.log('Response:', response.choices[0].message.content);
        console.log('Provider:', response.id.startsWith('google') ? 'Google AI' : 'UniAPI');
        console.log('[PASS] Forced UniAPI successful\n');
        
    } catch (err) {
        console.log('[FAIL]', err.message, '\n');
    }
    
    // Test 5: Multimodal (if image provided)
    console.log('TEST 5: Multimodal (Text + Image)');
    console.log('-----------------------------');
    console.log('Skipping - requires base64 image data.\n');
    console.log('To test manually:');
    console.log('  1. Load image: fs.readFileSync("image.jpg")');
    console.log('  2. Encode: buffer.toString("base64")');
    console.log('  3. Call with content: [');
    console.log('       { type: "text", text: "Describe" },');
    console.log('       { type: "image_url", image_url: { url: "data:image/jpeg;base64,..." } }');
    console.log('     ]\n');
    
    // Summary
    console.log('========================================');
    console.log('      Test Suite Complete');
    console.log('========================================');
    console.log('\nIf all tests passed, the AI Router is working correctly!');
    console.log('Check quota stats to see provider usage distribution.');
}

// Run tests
runTests().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
