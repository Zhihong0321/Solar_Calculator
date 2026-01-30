# AI Router - Quick Start Guide

## ⚡ 30-Second Setup

### 1. Set Environment Variables

```bash
# Required: At least one Google key
$env:GOOGLE_AI_KEY_1 = "AIzaSy..."

# Required for fallback
$env:UNIAPI_KEY = "sk-..."
```

### 2. Use in Your Code

```javascript
const { aiRouter } = require('./src/modules/AIRouter/aiRouter');

const response = await aiRouter.chatCompletion({
    messages: [{ role: 'user', content: 'Hello!' }]
});

console.log(response.choices[0].message.content);
```

---

## 📋 Common Patterns

### Pattern 1: Simple Text Call
```javascript
const response = await aiRouter.chatCompletion({
    messages: [{ role: 'user', content: 'Your prompt here' }]
});
return response.choices[0].message.content;
```

### Pattern 2: Extract JSON
```javascript
const response = await aiRouter.chatCompletion({
    messages: [{ 
        role: 'user', 
        content: 'Extract data as JSON: {...}' 
    }]
});
const json = JSON.parse(response.choices[0].message.content);
```

### Pattern 3: Image Analysis
```javascript
const response = await aiRouter.chatCompletion({
    messages: [{
        role: 'user',
        content: [
            { type: 'text', text: 'Describe this image' },
            { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,...' } }
        ]
    }]
});
```

### Pattern 4: Check Quota
```javascript
const stats = aiRouter.getStats();
console.log(`Google: ${stats.google.total} calls used`);
```

---

## 🔄 Provider Selection

| Your Call | Provider Used | When |
|-----------|--------------|------|
| `chatCompletion({messages})` | Google (free) | Has quota |
| `chatCompletion({messages})` | UniAPI (paid) | Google quota exhausted |
| `chatCompletion({messages}, {forceGoogle: true})` | Google only | Fails if no quota |
| `chatCompletion({messages}, {forceUniapi: true})` | UniAPI only | Skips Google |

---

## ⚙️ Configuration

Edit `CONFIG` in `aiRouter.js`:

```javascript
const CONFIG = {
    google: {
        dailyQuota: 120,        // Change quota limit
        model: 'gemini-3-flash-preview',
        // ...
    }
};
```

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| Always uses UniAPI | Check `aiRouter.getStats()` - Google quota may be exhausted |
| "All providers failed" | Check env vars are set correctly |
| Quota not resetting | Delete `storage/ai_quota.json` |
| Images not working | Ensure base64 data URL format: `data:image/jpeg;base64,...` |

---

## 📁 Files Reference

| File | Purpose |
|------|---------|
| `aiRouter.js` | Main implementation - import this |
| `example_usage.js` | Copy-paste examples |
| `README.md` | Full documentation |
| `ARCHITECTURE.md` | Design patterns and extension guide |
| `routerRoutes.js` | HTTP API routes |

---

## 🔗 Integration Example

### Before (Direct Google API):
```javascript
// OLD CODE - don't do this
const res = await fetch('https://generativelanguage.googleapis.com/...', {
    body: JSON.stringify({ contents: [...] })
});
const data = await res.json();
const text = data.candidates[0].content.parts[0].text;
```

### After (Using Router):
```javascript
// NEW CODE - use this
const { aiRouter } = require('../AIRouter/aiRouter');

const response = await aiRouter.chatCompletion({
    messages: [{ role: 'user', content: '...' }]
});
const text = response.choices[0].message.content;
```

**Benefits:**
- Automatic fallback to paid API
- Quota tracking
- Same interface regardless of provider
- No schema conversion in your code
