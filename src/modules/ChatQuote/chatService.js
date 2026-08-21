/**
 * Turn orchestration for /lab/chat.
 *
 * Two paths on purpose:
 *
 *   fast path — the message is just a bill amount ("450", "RM 1,200"). We call
 *   the calculator directly. No model, no 4-second reasoning preamble, no cost.
 *   This is the common case and it has to feel instant.
 *
 *   model path — anything else goes to the router with one tool. The model
 *   decides whether to call calculate_savings and with what arguments; it never
 *   produces the numbers itself.
 */

const ai = require('./aiClient');
const tools = require('./tools');
const store = require('./sessionStore');

const SYSTEM_PROMPT = `You are the quotation assistant inside ETERNALGY's solar sales app. You are talking to a Malaysian solar sales agent, who may write in English, Malay, or a mix of both.

Your job in this conversation: turn a customer's average monthly TNB bill into a solar savings estimate, then help the agent adjust it.

Rules you must follow:
- NEVER state, estimate, or calculate any number yourself. Not savings, not system size, not price, not payback. Call the calculate_savings tool and let the app display the result.
- If the agent gives a bill amount, call calculate_savings immediately. Do not ask for anything else first: sun peak hour, usage pattern and panel type all have sensible defaults.
- If the agent asks to change something (battery, discount, panel count), call calculate_savings again with that change. The app remembers the previous inputs.
- If you genuinely do not have a bill amount yet, ask for it in one short sentence.
- Keep replies to one or two short sentences. The app renders the detailed figures as a card underneath your reply, so do not repeat figures in words.
- Reply in the language the agent used. Malay in, Malay out.`;

// "450", "rm450", "RM 1,200.50", "450 sebulan", "1200 per month"
const BILL_ONLY = /^\s*(?:rm\s*)?([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:rm)?\s*(?:sebulan|per\s*month|a\s*month|\/\s*month|monthly|sebln)?\s*$/i;

function parseBillOnly(text) {
  const match = BILL_ONLY.exec(text || '');
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  // Guard against a bare year or a phone number being read as a bill.
  if (amount < 20 || amount > 100000) return null;
  return amount;
}

const CONNECTION_CODES = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET']);

function friendlyCalcError(err) {
  if (err && err.code === 'NEEDS_AMOUNT') return "I need the customer's average monthly TNB bill first.";
  // A refused pool connection surfaces as an AggregateError with an empty
  // message; without this it would read as "bad input" to the agent.
  if (err && CONNECTION_CODES.has(err.code)) return 'The tariff service is unreachable right now, so I cannot calculate. Please tell your admin.';
  const message = (err && err.message) || 'Calculation failed';
  const known = [
    'Invalid bill amount',
    'Sun Peak Hour must be between 3.0 and 4.5',
    'Morning Usage must be between 1% and 100%',
    'SMP price must be between RM 0.19 and RM 0.2703',
    'Battery size must be 0, 16, 32, or 48 kWh',
    'No tariff data found for calculation'
  ];
  if (known.includes(message)) return message;
  return 'The calculator could not complete that. Please try a different figure.';
}

/**
 * Runs one turn. `emit(event, data)` streams progress to the browser.
 * Returns the final assistant payload.
 */
async function handleTurn({ session, text, emit }) {
  const trimmed = (text || '').trim();
  if (!trimmed) return { reply: 'Say that again?', card: null };

  store.pushMessage(session, 'user', trimmed);
  const previousParams = session.lastCalc ? session.lastCalc.params : null;

  // ── Fast path ───────────────────────────────────────────────────────────
  const billOnly = parseBillOnly(trimmed);
  if (billOnly !== null) {
    emit('status', { label: 'Calculating savings…' });
    try {
      const card = await tools.calculateSavings({ amount: billOnly }, previousParams);
      store.setLastCalc(session, card.params, card);
      const reply = `Here's what solar does for a RM ${billOnly} bill.`;
      store.pushMessage(session, 'assistant', reply);
      return { reply, card, route: 'fast' };
    } catch (err) {
      console.error('[ChatQuote] fast-path calculation failed:', err.message);
      const reply = friendlyCalcError(err);
      store.pushMessage(session, 'assistant', reply);
      return { reply, card: null, route: 'fast', error: true };
    }
  }

  // ── Model path ──────────────────────────────────────────────────────────
  emit('status', { label: 'Thinking…' });

  const context = previousParams
    ? `\n\nCurrent inputs on screen: ${JSON.stringify(previousParams)}. When the agent asks for a change, call calculate_savings with only the changed field.`
    : '';

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT + context },
    ...session.messages
  ];

  let completion;
  try {
    completion = await ai.complete({ messages, tools: tools.TOOL_SCHEMA });
  } catch (err) {
    console.error('[ChatQuote] AI router failed:', err.message);
    const reply = err.code === 'NO_AI_KEY'
      ? 'AI is not configured on this server yet.'
      : 'I could not reach the AI service. Try the bill amount on its own and I will calculate it directly.';
    store.pushMessage(session, 'assistant', reply);
    return { reply, card: null, route: 'model', error: true };
  }

  const call = completion.toolCalls && completion.toolCalls[0];
  if (!call) {
    const reply = completion.content || 'Give me the average monthly TNB bill and I will work out the savings.';
    store.pushMessage(session, 'assistant', reply);
    return { reply, card: null, route: 'model', model: completion.model, latencyMs: completion.latencyMs };
  }

  let args = {};
  try {
    args = JSON.parse(call.function.arguments || '{}');
  } catch {
    console.warn('[ChatQuote] unparseable tool arguments:', call.function.arguments);
  }

  emit('status', { label: 'Calculating savings…' });
  try {
    const card = await tools.calculateSavings(args, previousParams);
    store.setLastCalc(session, card.params, card);
    const reply = completion.content || 'Here are the numbers.';
    store.pushMessage(session, 'assistant', reply);
    return { reply, card, route: 'model', model: completion.model, latencyMs: completion.latencyMs };
  } catch (err) {
    console.error('[ChatQuote] tool calculation failed:', err.message);
    const reply = friendlyCalcError(err);
    store.pushMessage(session, 'assistant', reply);
    return { reply, card: null, route: 'model', error: true };
  }
}

/** Chip-driven recalculation. Patches one field, no model involved. */
async function adjust({ session, patch }) {
  const previousParams = session.lastCalc ? session.lastCalc.params : null;
  if (!previousParams) {
    const err = new Error('Nothing to adjust yet');
    err.code = 'NO_CALC';
    throw err;
  }
  const card = await tools.calculateSavings(patch || {}, previousParams);
  store.setLastCalc(session, card.params, card);
  return card;
}

module.exports = { handleTurn, adjust, parseBillOnly, SYSTEM_PROMPT };
