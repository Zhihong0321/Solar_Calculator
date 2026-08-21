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

const CHAT_MODEL = process.env.CHAT_LAB_MODEL || 'gpt-5.6-luna';
const VISION_MODEL = process.env.CHAT_LAB_VISION_MODEL || 'step-3.7-flash';
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
  const chosenModel = model || CHAT_MODEL;
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

module.exports = { complete, CHAT_MODEL, VISION_MODEL };
