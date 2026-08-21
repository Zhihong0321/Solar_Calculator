/**
 * Turn orchestration for /lab/chat.
 *
 * Two paths on purpose:
 *
 *   fast path — the message is just a bill amount ("450", "RM 1,200"). We call
 *   the calculator directly. No model, no reasoning preamble, no cost. This is
 *   the common case and it has to feel instant.
 *
 *   model path — anything else goes to the router with one tool. The model
 *   decides whether to call calculate_savings and with what arguments; it never
 *   produces the numbers itself.
 *
 * Conversation state lives in Postgres (threadRepo), so a thread survives a
 * page reload, a deploy and a Railway restart.
 */

const ai = require('./aiClient');
const tools = require('./tools');
const repo = require('./threadRepo');
const eeAuto = require('./eeAuto');

const HISTORY_LIMIT = 20;

const SYSTEM_PROMPT = `You are the quotation assistant inside ETERNALGY's solar sales app. You are talking to a Malaysian solar sales agent, who may write in English, Malay, or a mix of both.

Your job in this conversation: turn a customer's average monthly TNB bill into a solar savings estimate, then help the agent adjust it.

You have three tools:
- calculate_savings — solar savings from a monthly TNB bill.
- business_search — find real companies on Google Maps. Works with keyword + place, or with a place alone to list ALL businesses in that location.
- company_research — deep research on ONE company from a previous search.

Rules you must follow:
- NEVER state, estimate, or calculate any number yourself. Not savings, not system size, not price, not payback. Call the calculate_savings tool and let the app display the result.
- NEVER invent company names, ratings, addresses or phone numbers. Only business_search may produce them.
- company_research needs a company id from a previous business_search in this conversation. If you do not have one, run business_search first or ask which company the agent means.
- If the agent gives a bill amount, call calculate_savings immediately. Do not ask for anything else first: sun peak hour, usage pattern and panel type all have sensible defaults.
- If the agent asks to change something (battery, discount, panel count), call calculate_savings again with that change. The app remembers the previous inputs.
- If you genuinely do not have a bill amount yet, ask for it in one short sentence.
- Keep replies to one or two short sentences. The app renders the detailed figures as a card underneath your reply, so do not repeat figures in words.
- Reply in the language the agent used. Malay in, Malay out.`;

// "450", "rm450", "RM 1,200.50", "450 sebulan", "1200 per month"
const BILL_ONLY = /^\s*(?:rm\s*)?([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:rm)?\s*(?:sebulan|per\s*month|a\s*month|\/\s*month|monthly|sebln)?\s*$/i;

const CONNECTION_CODES = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET']);

function parseBillOnly(text) {
  const match = BILL_ONLY.exec(text || '');
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  // Guard against a bare year or a phone number being read as a bill.
  if (amount < 20 || amount > 100000) return null;
  return amount;
}

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

function friendlyToolError(toolName, err) {
  if (err && err.code === 'NO_EE_AUTO_TOKEN') return 'Business search is not configured on this server yet.';
  if (err && err.code === 'EE_AUTO_UNAUTHORIZED') return 'The business intelligence service rejected our credentials. Please tell your admin.';
  if (err && err.code === 'NEEDS_KEYWORD') return err.message;
  if (err && err.code === 'NEEDS_COMPANY') return err.message;
  if (toolName === 'business_search') return 'The business search service could not complete that. Try again in a moment.';
  if (toolName === 'company_research') return 'The research service could not complete that. Try again in a moment.';
  return friendlyCalcError(err);
}

function previousParamsOf(thread) {
  return thread && thread.last_calc && thread.last_calc.params ? thread.last_calc.params : null;
}

/** Recent turns, oldest first, as plain model messages. */
async function historyFor(thread) {
  const rows = await repo.getMessages(thread.id, HISTORY_LIMIT);
  return rows
    .filter((row) => row.content)
    .map((row) => ({ role: row.role, content: row.content }));
}

/**
 * Runs one turn against a thread. `emit(event, data)` streams progress.
 * Returns the assistant payload the browser renders.
 */
async function handleTurn({ thread, text, emit }) {
  const trimmed = (text || '').trim();
  if (!trimmed) return { reply: 'Say that again?', card: null };

  await repo.appendMessage(thread.id, 'user', trimmed);
  const previousParams = previousParamsOf(thread);

  const finish = async (reply, card, extra = {}) => {
    await repo.appendMessage(thread.id, 'assistant', reply, card);
    // Only a savings card defines the thread — it is what the title, the
    // preview and the adjustment chips are derived from. Research output is
    // supporting material and must not overwrite the quotation state.
    if (card && card.type === 'savings') await repo.recordCalculation(thread.id, card);
    else if (card && card.type === 'leads') await repo.setPreview(thread.id, `${card.total} companies · ${card.query.keyword}`);
    else if (card && card.type === 'research') await repo.setPreview(thread.id, `Research · ${card.companyName || 'company'}`);
    else if (extra.error) await repo.setPreview(thread.id, reply);
    return { reply, card, ...extra };
  };

  // ── Fast path ───────────────────────────────────────────────────────────
  const billOnly = parseBillOnly(trimmed);
  if (billOnly !== null) {
    emit('status', { label: 'Calculating savings…' });
    try {
      const card = await tools.calculateSavings({ amount: billOnly }, previousParams);
      return await finish(`Here's what solar does for a RM ${billOnly} bill.`, card, { route: 'fast' });
    } catch (err) {
      console.error('[ChatQuote] fast-path calculation failed:', err.code || err.message);
      return await finish(friendlyCalcError(err), null, { route: 'fast', error: true });
    }
  }

  // ── Model path ──────────────────────────────────────────────────────────
  emit('status', { label: 'Thinking…' });

  let context = previousParams
    ? `\n\nCurrent inputs on screen: ${JSON.stringify(previousParams)}. When the agent asks for a change, call calculate_savings with only the changed field.`
    : '';

  // company_research needs a real id, so the last search's companies are put in
  // front of the model rather than left for it to guess at.
  const lastLeads = await repo.latestCardOfType(thread.id, 'leads');
  if (lastLeads && lastLeads.companies && lastLeads.companies.length) {
    const roster = lastLeads.companies
      .slice(0, 25)
      .map((c, i) => `${i + 1}. ${c.name} (companyId: ${c.id})`)
      .join('\n');
    context += `\n\nCompanies from the most recent business_search — use these exact ids for company_research, never invent one:\n${roster}`;
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT + context },
    ...(await historyFor(thread))
  ];

  let completion;
  try {
    completion = await ai.complete({ messages, tools: tools.TOOL_SCHEMA });
  } catch (err) {
    console.error('[ChatQuote] AI router failed:', err.message);
    const reply = err.code === 'NO_AI_KEY'
      ? 'AI is not configured on this server yet.'
      : 'I could not reach the AI service. Try the bill amount on its own and I will calculate it directly.';
    return await finish(reply, null, { route: 'model', error: true });
  }

  const call = completion.toolCalls && completion.toolCalls[0];
  if (!call) {
    const reply = completion.content || 'Give me the average monthly TNB bill and I will work out the savings.';
    return await finish(reply, null, { route: 'model', model: completion.model, latencyMs: completion.latencyMs });
  }

  let args = {};
  try {
    args = JSON.parse(call.function.arguments || '{}');
  } catch {
    console.warn('[ChatQuote] unparseable tool arguments:', call.function.arguments);
  }

  const meta = { route: 'model', model: completion.model, latencyMs: completion.latencyMs };
  const toolName = call.function.name;

  try {
    if (toolName === 'business_search') {
      emit('status', { label: 'Searching Google Maps…' });
      const card = await tools.businessSearch(args, {
        requesterId: thread.thread_key,
        onProgress: ({ seconds }) => emit('status', { label: `Searching Google Maps… ${seconds}s` })
      });
      const reply = completion.content
        || (card.state === 'pending'
          ? 'Still searching. I will keep the report open — refresh the card in a moment.'
          : `Found ${card.total} ${card.total === 1 ? 'company' : 'companies'}.`);
      return await finish(reply, card, meta);
    }

    if (toolName === 'company_research') {
      emit('status', { label: 'Researching the company…' });
      const card = await tools.companyResearch(args, {
        requesterId: thread.thread_key,
        onProgress: ({ seconds }) => emit('status', { label: `Researching… ${seconds}s` })
      });
      const reply = completion.content
        || (card.state === 'pending'
          ? 'Research is still running. Refresh the card in a minute.'
          : 'Research is ready.');
      return await finish(reply, card, meta);
    }

    emit('status', { label: 'Calculating savings…' });
    const card = await tools.calculateSavings(args, previousParams);
    return await finish(completion.content || 'Here are the numbers.', card, meta);
  } catch (err) {
    console.error(`[ChatQuote] tool ${toolName} failed:`, err.code || err.message);
    return await finish(friendlyToolError(toolName, err), null, { ...meta, error: true });
  }
}

/** Chip-driven recalculation. Patches one field, no model involved. */
async function adjust({ thread, patch }) {
  const previousParams = previousParamsOf(thread);
  if (!previousParams) {
    const err = new Error('Nothing to adjust yet');
    err.code = 'NO_CALC';
    throw err;
  }
  const card = await tools.calculateSavings(patch || {}, previousParams);
  await repo.recordCalculation(thread.id, card);
  await repo.updateLatestCard(thread.id, card);
  return card;
}

/**
 * Re-polls a report that was still running when its turn ended, and rewrites
 * the stored card so the thread shows the finished result on reload.
 */
async function refreshReport({ thread, kind, reportId }) {
  const polled = await eeAuto.fetchReport(kind === 'research' ? 'research' : 'search', reportId);
  const report = polled.report || {};
  const data = polled.data || {};
  const stored = await repo.latestCardOfType(thread.id, kind);
  const done = ['completed', 'partial', 'failed'].includes(report.status);

  const card = kind === 'leads'
    ? {
      ...(stored || { type: 'leads', query: {} }),
      state: done ? 'done' : 'pending',
      status: report.status,
      reportId: report.id || reportId,
      viewUrl: report.view_url || (stored && stored.viewUrl) || null,
      error: report.error || null,
      total: (data.companies || []).length || (stored && stored.total) || 0,
      companies: (data.companies || []).length
        ? data.companies.slice(0, 25).map((c) => ({
          id: c.id,
          name: c.name,
          rating: c.rating,
          reviews: c.reviews,
          category: c.category,
          address: c.address,
          phone: c.phone || null,
          website: c.website || null,
          mapsUrl: c.maps_url || null,
          rank: c.rank
        }))
        : (stored && stored.companies) || []
    }
    : {
      ...(stored || { type: 'research' }),
      state: done ? 'done' : 'pending',
      status: report.status,
      reportId: report.id || reportId,
      title: report.title || (stored && stored.title) || null,
      viewUrl: report.view_url || (stored && stored.viewUrl) || null,
      error: report.error || null,
      final: data.final || (stored && stored.final) || null
    };

  if (stored) await repo.updateCardOfType(thread.id, kind, card);
  return card;
}

module.exports = { handleTurn, adjust, refreshReport, parseBillOnly, SYSTEM_PROMPT };
