# AI Router Module

## Overview

This module provides a **unified AI interface** with automatic provider fallback:
- **Primary**: Google AI API (free tier, ~120 calls/day limit)
- **Fallback**: UniAPI.io (paid, unlimited)

**Key Design Principle**: Other modules/apps use a single OpenAI-compatible interface. The router internally handles:
- Provider selection (free → paid fallback)
- API schema conversion (Google native ↔ OpenAI format)
- Quota tracking and key rotation
- Error handling and retries

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         YOUR APP CODE                            │
│  (Other modules, services, routes)                              │
│                                                                  │
│   const { aiRouter } = require('./AIRouter/aiRouter');          │
│   const response = await aiRouter.chatCompletion({...});        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AI ROUTER (This Module)                     │
│                                                                  │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐ │
│  │   QuotaManager  │    │ GoogleAIAdapter │    │ UniapiAdapter│ │
│  │                 │    │                 │    │              │ │
│  │ - Track usage   │───▶│ - Convert req   │    │ - Direct API │ │
│  │ - Check limits  │    │ - Convert resp  │───▶│   (OpenAI    │ │
│  │ - Persist to    │    │ - Key rotation  │    │   format)    │ │
│  │   storage/      │    │                 │    │              │ │
│  └─────────────────┘    └─────────────────┘    └─────────────┘ │
│           │                       │                     │       │
│           └───────────────────────┴─────────────────────┘       │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              AIRouter.chatCompletion()                    │   │
│  │                                                          │   │
│  │  1. Check if Google has quota                            │   │
│  │  2. If yes: use GoogleAIAdapter                          │   │
│  │  3. If no/quota exceeded: use UniapiAdapter              │   │
│  │  4. Return unified OpenAI-compatible response            │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### 1. Installation

No npm install needed - pure Node.js with `fetch()` (Node 18+).

### 2. Environment Setup

```bash
# Google AI (free tier) - Primary
GOOGLE_AI_KEY_1=AIzaSy...your-key-1...
GOOGLE_AI_KEY_2=AIzaSy...your-key-2...  # optional backup
GOOGLE_AI_KEY_3=AIzaSy...your-key-3...  # optional backup  
GOOGLE_AI_KEY_4=AIzaSy...your-key-4...  # optional backup

# UniAPI (paid) - Fallback
UNIAPI_KEY=sk-your-uniapi-key
# OR use OPENAI_API_KEY if you prefer
```

### 3. Basic Usage

```javascript
const { aiRouter } = require('./src/modules/AIRouter/aiRouter');

// Simple text call
const response = await aiRouter.chatCompletion({
    messages: [
        { role: 'user', content: 'Hello, how are you?' }
    ]
});

console.log(response.choices[0].message.content);
```

---

## API Reference

### `aiRouter.chatCompletion(request, options)`

Main method - works like OpenAI's chat.completions.create()

#### Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `request.messages` | `Array` | ✓ | Array of message objects `{role, content}` |
| `request.temperature` | `number` | ✗ | Sampling temperature (0-2) |
| `request.max_tokens` | `number` | ✗ | Max tokens to generate |
| `options.forceGoogle` | `boolean` | ✗ | Force use Google AI (fails if no quota) |
| `options.forceUniapi` | `boolean` | ✗ | Force use UniAPI (skip Google) |

#### Returns

OpenAI-compatible response object:
```javascript
{
  id: "google-1234567890" | "chatcmpl-...",
  object: "chat.completion",
  created: 1234567890,
  model: "gemini-3-flash-preview",
  choices: [{
    index: 0,
    message: {
      role: "assistant",
      content: "response text here"
    },
    finish_reason: "stop"
  }],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 20,
    total_tokens: 30
  }
}
```

### `aiRouter.getStats()`

Get current quota usage:
```javascript
const stats = aiRouter.getStats();
// {
//   date: "2026-01-30",
//   google: {
//     total: 45,
//     byKey: [
//       { key: "key_1", used: 12, limit: 120, remaining: 108 },
//       { key: "key_2", used: 33, limit: 120, remaining: 87 }
//     ]
//   },
//   uniapi: { total: 5 }
// }
```

---

## Advanced Usage

### Multimodal (Text + Image)

```javascript
const response = await aiRouter.chatCompletion({
    messages: [{
        role: 'user',
        content: [
            { type: 'text', text: 'What do you see?' },
            {
                type: 'image_url',
                image_url: {
                    url: `data:image/jpeg;base64,${base64ImageString}`
                }
            }
        ]
    }]
});
```

### Force Specific Provider

```javascript
// Skip quota check, force Google (fails if quota exceeded)
await aiRouter.chatCompletion({ messages }, { forceGoogle: true });

// Skip Google entirely, go straight to UniAPI
await aiRouter.chatCompletion({ messages }, { forceUniapi: true });
```

---

## HTTP API (Optional)

Mount the router in your Express app:

```javascript
const aiRoutes = require('./src/modules/AIRouter/routerRoutes');
app.use('/api/ai', aiRoutes);
```

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/chat` | Chat completion |
| GET | `/api/ai/stats` | Get quota stats |
| POST | `/api/ai/reset` | Reset quota counters |

Example:
```bash
curl -X POST http://localhost:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Hello"}]}'
```

---

## How It Works Internally

### 1. Provider Selection Logic

```
IF forceUniapi = true:
    → Use UniAPI
ELSE IF forceGoogle = true:
    → Use Google AI (fail if no quota)
ELSE IF Google has remaining quota:
    → Use Google AI
ELSE:
    → Use UniAPI (fallback)
```

### 2. Schema Conversion

**Google AI** uses native Gemini format:
```javascript
// Request
{ contents: [{ parts: [{ text: "..." }] }] }

// Response
{ candidates: [{ content: { parts: [{ text: "..." }] } }] }
```

**UniAPI** uses OpenAI format (no conversion needed)

**Router exposes** OpenAI format always:
```javascript
{ messages: [{ role: "user", content: "..." }] }
// → Converts internally based on provider
```

### 3. Quota Tracking

- Tracks usage per Google API key (up to 4 keys)
- Persists to `storage/ai_quota.json`
- Auto-resets at midnight (new date detected)
- Distributes load across keys (uses key with lowest usage)

---

## Extending the Router

### Adding a New Provider

1. Create adapter class:
```javascript
class NewProviderAdapter {
    async call(openaiRequest) {
        // Convert request to provider format
        // Make API call
        // Convert response back to OpenAI format
        return openaiFormatResponse;
    }
}
```

2. Add to AIRouter:
```javascript
class AIRouter {
    constructor() {
        this.googleAdapter = new GoogleAIAdapter();
        this.uniapiAdapter = new UniapiAdapter();
        this.newProviderAdapter = new NewProviderAdapter();  // Add
    }
    
    async chatCompletion(request, options) {
        // Add to fallback chain
        // Try Google → UniAPI → NewProvider
    }
}
```

### Modifying Quota Limits

Edit `CONFIG.google.dailyQuota` in `aiRouter.js` (default: 120)

---

## File Structure

```
src/modules/AIRouter/
├── README.md                      # This file
├── aiRouter.js                    # Main implementation
├── example_usage.js               # Usage examples
├── REFACTORED_extractionService.js # Migration example
├── routerRoutes.js                # Express routes
└── test_router.js                 # Test script
```

---

## Troubleshooting

### "All AI providers failed"
- Check environment variables are set
- Verify API keys are valid
- Check console for specific error messages

### Always using UniAPI
- Check `aiRouter.getStats()` - Google quota may be exhausted
- Verify `GOOGLE_AI_KEY_1` is set correctly

### Quota not resetting
- Delete `storage/ai_quota.json` to force reset
- Or call `aiRouter.resetQuota()`

---

## Migration Guide

### From Old Google-Only Code:

**BEFORE** (in `extractionService.js`):
```javascript
const API_KEYS = [process.env.GOOGLE_AI_KEY_1, ...];
const MODEL = 'gemini-3-flash-preview';

async function callGemini(payload) {
    const res = await fetch(`https://generativelanguage...`, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
    const json = await res.json();
    return json.candidates[0].content.parts[0].text;
}
```

**AFTER**:
```javascript
const { aiRouter } = require('../AIRouter/aiRouter');

async function callAI(prompt) {
    const response = await aiRouter.chatCompletion({
        messages: [{ role: 'user', content: prompt }]
    });
    return response.choices[0].message.content;
}
```

That's it! The router handles everything else.
