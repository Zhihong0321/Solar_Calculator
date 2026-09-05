/**
 * Thin client for the hosted AI router (e-router).
 *
 * The router already fronts every provider we need, so this module only owns
 * the two quirks that bit us during evaluation:
 *   1. step-3.7-flash is a reasoning model whose preamble can eat the whole
 *      token budget, returning finish_reason "length" with empty content.
 *   2. Reasoning cannot be disabled — reasoning_effort / enable_thinking /
 *      thinking are all accepted and ignored — so the only defence is a
 *      generous budget plus one retry.
 */

const DEFAULT_BASE_URL = 'https://e-router.up.railway.app/v1';

// step-3.7-flash is the default because the gpt-5.6-* models on the router
// started returning upstream 403 "this account only allows Codex official
// client" — an entire provider can vanish without warning, so the chat tries
// the next model in the chain rather than failing the turn.
const CHAT_MODEL = process.env.CHAT_LAB_MODEL || 'step-3.7-flash';
const VISION_MODEL = process.env.CHAT_LAB_VISION_MODEL || 'step-3.7-flash';
const FALLBACK_MODELS = (process.env.CHAT_LAB_FALLBACK_MODELS || 'step-3.5-flash-2603,gpt-5.6-luna')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
const MIN_TOKENS = 900;

function baseUrl() {
  return (process.env.AI_ROUTER_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
}

function apiKey() {
  const key = process.env.AI_ROUTER_API_KEY;
  if (!key) {
    const err = new Error('No AI_ROUTER_API_KEY configured');
    err.code = 'NO_AI_KEY';
    throw err;
  }
  return key;
}

async function post(body, { timeoutMs = 45000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error(`AI router ${res.status}: ${JSON.stringify(payload).slice(0, 200)}`);
      err.code = 'AI_ROUTER_ERROR';
      err.status = res.status;
      throw err;
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One chat completion. Returns { content, toolCalls, model, latencyMs }.
 * Retries once with a doubled budget when the model returns neither content
 * nor a tool call because reasoning consumed the allowance.
 */
async function complete({ messages, tools, model, maxTokens, temperature }) {
  // Try the chosen model, then each fallback, so one dead provider is a slower
  // reply rather than a broken feature.
  const chain = [model || CHAT_MODEL, ...FALLBACK_MODELS.filter((m) => m !== (model || CHAT_MODEL))];
  let lastError = null;

  for (const candidate of chain) {
    try {
      return await completeWith(candidate, { messages, tools, maxTokens, temperature });
    } catch (err) {
      // A provider outage is worth stepping past; a bad request is not.
      const retryable = err.code === 'AI_ROUTER_ERROR' && err.status >= 500;
      if (!retryable) throw err;
      console.warn(`[ChatQuote] model ${candidate} unavailable (${err.status}), trying next`);
      lastError = err;
    }
  }
  throw lastError || new Error('No usable model');
}

async function completeWith(chosenModel, { messages, tools, maxTokens, temperature }) {
  let budget = Math.max(maxTokens || MIN_TOKENS, MIN_TOKENS);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const startedAt = Date.now();
    const body = { model: chosenModel, messages, max_tokens: budget };
    if (tools && tools.length) body.tools = tools;
    if (typeof temperature === 'number') body.temperature = temperature;

    const payload = await post(body);
    const choice = payload && payload.choices && payload.choices[0];
    const message = choice ? choice.message : null;
    const content = (message && message.content) || '';
    const toolCalls = (message && message.tool_calls) || null;
    const starved = !content.trim() && !toolCalls && choice && choice.finish_reason === 'length';

    if (!starved) {
      return {
        content: content.trim(),
        toolCalls,
        model: payload.model || chosenModel,
        finishReason: choice ? choice.finish_reason : null,
        latencyMs: Date.now() - startedAt,
        usage: payload.usage || null
      };
    }

    console.warn(`[ChatQuote] ${chosenModel} starved by reasoning at ${budget} tokens, retrying`);
    budget *= 2;
  }

  const err = new Error('Model returned no usable content after retry');
  err.code = 'AI_EMPTY_RESPONSE';
  throw err;
}

module.exports = { complete, CHAT_MODEL, VISION_MODEL, FALLBACK_MODELS };
