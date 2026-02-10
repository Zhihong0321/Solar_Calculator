# AI Router Architecture

## Design Patterns Used

### 1. Adapter Pattern
**Purpose**: Convert between different API formats without changing consumer code.

```
Consumer Code (OpenAI format)
         │
         ▼
    ┌─────────┐
    │ Adapter │ ──▶ Converts to Provider format
    └────┬────┘
         │
         ▼
   Provider API
         │
         ▼
    ┌─────────┐
    │ Adapter │ ──▶ Converts back to OpenAI format
    └────┬────┘
         │
         ▼
Consumer Code (OpenAI format)
```

**Benefits**:
- Consumer code never changes when adding providers
- Each adapter encapsulates provider-specific quirks
- Easy to test adapters in isolation

### 2. Strategy Pattern
**Purpose**: Select algorithm (provider) at runtime based on conditions.

```javascript
class AIRouter {
    async chatCompletion(request, options) {
        // Strategy selection logic
        if (hasQuota && !forceUniapi) {
            return await googleAdapter.call(request);  // Strategy A
        } else {
            return await uniapiAdapter.call(request);  // Strategy B
        }
    }
}
```

**Benefits**:
- Easy to add new providers (new strategies)
- Routing logic centralized in one place
- Consumer doesn't know which provider was used

### 3. Singleton Pattern
**Purpose**: Ensure single instance for quota consistency.

```javascript
const aiRouter = new AIRouter();  // Single instance
module.exports = { aiRouter };     // Shared across app
```

**Why**:
- Quota tracking must be consistent
- Multiple instances would overwrite each other's quota files
- State management simpler with single source of truth

### 4. Chain of Responsibility
**Purpose**: Try providers in sequence until one succeeds.

```
Request ──▶ Google Adapter ──▶ Success? ──Yes──▶ Return
                │
              Error
                │
                ▼
          UniAPI Adapter ──▶ Success? ──Yes──▶ Return
                │
              Error
                │
                ▼
           Throw Error (all failed)
```

---

## Data Flow

### Request Flow

```
1. Consumer calls aiRouter.chatCompletion({ messages })
                    │
                    ▼
2. AIRouter decides provider
   - Check quota
   - Check options (forceGoogle, forceUniapi)
   - Select adapter
                    │
                    ▼
3. Adapter converts request
   GoogleAIAdapter: OpenAI format → Google format
   UniapiAdapter:   OpenAI format → OpenAI format (no change)
                    │
                    ▼
4. HTTP POST to provider API
                    │
                    ▼
5. Adapter converts response
   GoogleAIAdapter: Google format → OpenAI format
   UniapiAdapter:   OpenAI format → OpenAI format (no change)
                    │
                    ▼
6. Return OpenAI-compatible response to consumer
```

### Quota Tracking Flow

```
1. Google AI call succeeds
        │
        ▼
2. QuotaManager.incrementGoogle(keyIndex)
        │
        ▼
3. Update in-memory data
   data.google.key_0 = data.google.key_0 + 1
        │
        ▼
4. Persist to storage/ai_quota.json
   fs.writeFileSync(quotaFile, JSON.stringify(data))
        │
        ▼
5. Next call reads from disk
   (survives server restart)
```

---

## File Responsibilities

| File | Responsibility | Changes When... |
|------|---------------|-----------------|
| `aiRouter.js` | Core router logic, adapter classes, quota manager | Adding new providers, changing routing logic |
| `routerRoutes.js` | HTTP endpoints for external access | Adding API endpoints, changing auth |
| `example_usage.js` | Usage examples for consumers | New features added, API changes |
| `REFACTORED_*.js` | Migration examples from old code | Refactoring existing services |
| `test_router.js` | Manual testing script | Testing new functionality |

---

## State Management

### Persistent State (Disk)
- **Location**: `storage/ai_quota.json`
- **Content**: Daily quota usage per key
- **Purpose**: Survive server restarts, track across multiple instances
- **Format**:
```json
{
  "date": "2026-01-30",
  "google": { "key_0": 45, "key_1": 30 },
  "totalGoogleCalls": 75,
  "totalUniapiCalls": 12
}
```

### In-Memory State (Singleton)
- **QuotaManager.data**: Current quota counts
- **AIRouter instances**: Adapters for each provider
- **Lifetime**: Application lifetime (singleton)

---

## Error Handling Strategy

### Error Classification

| Error Type | Example | Action |
|-----------|---------|--------|
| Quota Exhausted | "Rate limit exceeded" | Fall back to UniAPI |
| Network Error | "Connection timeout" | Fall back to UniAPI |
| Auth Error | "Invalid API key" | Fall back to UniAPI |
| Client Error | "Invalid request format" | Propagate error (don't retry) |

### Error Propagation

```javascript
try {
    return await googleAdapter.call(request);
} catch (err) {
    if (isQuotaError(err)) {
        // Silent fallback
        return await uniapiAdapter.call(request);
    }
    // Other errors also fallback for reliability
    return await uniapiAdapter.call(request);
}
```

---

## Extension Points

### Adding a New Provider

1. **Create Adapter** (`aiRouter.js`):
```javascript
class NewProviderAdapter {
    convertRequest(openaiRequest) { /* ... */ }
    convertResponse(providerResponse) { /* ... */ }
    async call(openaiRequest) { /* ... */ }
}
```

2. **Add Config**:
```javascript
const CONFIG = {
    // ... existing configs
    newprovider: {
        enabled: true,
        apiKey: process.env.NEWPROVIDER_KEY,
        baseUrl: 'https://api.newprovider.com/v1',
        model: 'model-name'
    }
};
```

3. **Add to Router**:
```javascript
class AIRouter {
    constructor() {
        // ... existing adapters
        this.newProviderAdapter = new NewProviderAdapter();
    }
    
    async chatCompletion(request, options) {
        // Try existing providers first...
        
        // Then try new provider
        try {
            return await this.newProviderAdapter.call(request);
        } catch (err) {
            errors.push({ provider: 'newprovider', error: err.message });
        }
        
        throw new Error(`All providers failed: ${JSON.stringify(errors)}`);
    }
}
```

### Modifying Routing Logic

Change the order/priority in `AIRouter.chatCompletion()`:

```javascript
// Current: Google → UniAPI
// New: Cheap → Mid → Expensive

// Try cheap provider first
if (quotaManager.hasCheapQuota()) {
    return await cheapAdapter.call(request);
}

// Fall back to mid-tier
if (quotaManager.hasMidQuota()) {
    return await midAdapter.call(request);
}

// Finally expensive
return await expensiveAdapter.call(request);
```

---

## Testing Strategy

### Unit Tests (Each Component)
- `QuotaManager`: Test load/save/increment logic
- `GoogleAIAdapter`: Test request/response conversion
- `UniapiAdapter`: Test API call (mocked)

### Integration Tests (Full Flow)
- Test routing logic with mocked adapters
- Test fallback behavior
- Test quota exhaustion scenarios

### Manual Tests (`test_router.js`)
- Real API calls to both providers
- Check actual quota tracking
- Verify response format

---

## Performance Considerations

### Quota File I/O
- **Issue**: Writing to disk on every API call
- **Current**: Synchronous write (simple, but blocking)
- **Optimization**: Debounce writes or use async I/O

### Connection Pooling
- **Current**: Uses global `fetch()` (no pooling)
- **Optimization**: Use `http.Agent` for keep-alive connections

### Memory
- **Singleton**: One instance lives for app lifetime
- **State**: Minimal (quota counters, adapters)
- **No Leaks**: No event listeners or intervals

---

## Security Considerations

### API Keys
- **Storage**: Environment variables only
- **Logging**: Never log full API keys
- **Rotation**: Support multiple keys for rotation

### Quota File
- **Location**: `storage/` directory
- **Permissions**: Should be readable/writable by app only
- **Contents**: No sensitive data (just counters)

### Input Validation
- **Current**: Minimal validation (relies on provider)
- **Recommended**: Add request size limits, content validation

---

## Future Improvements

1. **Async Quota Writes**: Debounce quota saves to reduce I/O
2. **Circuit Breaker**: Stop trying failed providers temporarily
3. **Metrics**: Export to Prometheus/StatsD
4. **Caching**: Cache responses for identical requests
5. **Streaming**: Support streaming responses (Server-Sent Events)
6. **Batching**: Batch multiple requests to save quota
