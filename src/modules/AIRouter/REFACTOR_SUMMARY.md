# AI Router Refactoring Summary

## Date: 2026-01-30

## Overview
Successfully refactored all Gemini AI API calls to use the new AI Router module with automatic fallback (Google free tier → UniAPI paid).

---

## Files Modified

### 1. `src/modules/Invoicing/services/extractionService.js` (MAIN REFACTOR)

**Changes:**
- Replaced direct Google AI API calls with `aiRouter.chatCompletion()`
- Removed key rotation logic (handled by router)
- Removed manual fetch() calls to `generativelanguage.googleapis.com`
- Converted from Google-native format to OpenAI-compatible format
- Added helper functions for JSON extraction and multimodal content

**Before:**
```javascript
const API_KEYS = [...];
async function callGemini(payload, taskName) {
    for (let i = 0; i < maxRetries; i++) {
        const apiKey = getApiKey();
        const res = await fetch(`https://generativelanguage.googleapis.com/...`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        // Manual error handling and key rotation
    }
}
```

**After:**
```javascript
const { aiRouter } = require('../../AIRouter/aiRouter');
async function callAI(prompt, fileBuffer, mimeType, taskName) {
    const response = await aiRouter.chatCompletion({
        messages: [{ role: 'user', content }]
    });
    return extractJson(response.choices[0].message.content);
}
```

**API Compatibility:**
- All exported functions remain the same: `verifyMykad`, `verifyTnbBill`, `verifyTnbMeter`, `verifyOwnership`
- `API_KEYS` and `MODEL` still exported for backward compatibility

---

### 2. `src/modules/Invoicing/api/adminRoutes.js`

**Changes:**
- Added import: `const { aiRouter } = require('../../AIRouter/aiRouter');`
- Updated health check endpoint `/api/admin/health/ai-keys`

**Before:**
- Direct fetch() calls to Google AI for each key
- Only tested Google keys

**After:**
- Uses `aiRouter.chatCompletion({ forceGoogle: true })` to test Google keys
- Uses `aiRouter.chatCompletion({ forceUniapi: true })` to test UniAPI
- Returns quota statistics from `aiRouter.getStats()`

**New Response Format:**
```json
{
  "success": true,
  "results": [
    { "key": "Google Key 1 (...xxxx)", "provider": "google", "status": "healthy", ... },
    { "key": "UniAPI Key", "provider": "uniapi", "status": "healthy", ... }
  ],
  "quota": {
    "date": "2026-01-30",
    "google": { "total": 45, "byKey": [...] },
    "uniapi": { "total": 5 }
  }
}
```

---

### 3. `routes/sedaRoutes.js`

**Changes:** NONE

**Why:** This file imports and uses `extractionService` functions. Since the function signatures and exports remain the same, no changes needed.

---

## Benefits of This Refactor

| Before | After |
|--------|-------|
| Direct API calls with manual key rotation | Router handles all provider logic |
| No fallback when quota exhausted | Automatic fallback to UniAPI |
| No quota tracking | Automatic 120/day quota tracking per key |
| Google-specific format throughout | OpenAI-compatible format everywhere |
| Each service handles its own AI logic | Centralized AI management |

---

## Testing Checklist

- [ ] MyKad verification still works
- [ ] TNB Bill verification still works  
- [ ] TNB Meter verification still works
- [ ] Property ownership verification still works
- [ ] Admin health check shows both providers
- [ ] Quota tracking increments correctly
- [ ] Fallback to UniAPI works when Google quota exhausted

---

## Environment Variables Required

```bash
# Google AI (free tier)
GOOGLE_AI_KEY_1=your-key-here
GOOGLE_AI_KEY_2=optional-backup
GOOGLE_AI_KEY_3=optional-backup
GOOGLE_AI_KEY_4=optional-backup

# UniAPI (paid fallback)
UNIAPI_KEY=sk-your-key-here
# OR
OPENAI_API_KEY=sk-your-key-here
```

---

## Rollback Plan

If issues occur, restore from the original file (if backed up) or revert the git commit.

The original logic was:
1. Direct fetch to `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent`
2. Manual key rotation through `API_KEYS` array
3. Manual response parsing: `json.candidates[0].content.parts[0].text`

---

## Migration Complete ✓

All Gemini API calls now go through the AI Router module.
