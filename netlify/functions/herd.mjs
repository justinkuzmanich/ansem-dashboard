// Herd Report proxy — keeps the Anthropic API key server-side.
// Set ANTHROPIC_API_KEY in Netlify: Site settings → Environment variables.
// The prompt is fixed here on purpose: this endpoint can ONLY fetch $ANSEM news,
// so even if someone finds it, they can't use it as a free general-purpose Claude proxy.
//
// Two ways this serves a request:
//   1. Passive (page load): serves the last result if it's under 24h old,
//      otherwise does one live fetch — guarantees at least one fresh report a day.
//   2. Refresh (the "Round up new sources" button): always attempts a live
//      fetch, asking Claude to surface different stories than last time.
//
// Both paths draw from ONE shared daily dollar budget (tracked from the real
// token usage on every response, plus the flat web-search fee) so that no
// combination of visitors — however many times the button gets pressed —
// can spend more than DAILY_CAP_DOLLARS in a UTC calendar day. Once the cap
// is hit, requests fall back to the most recent cached report until the
// budget resets at UTC midnight.

import { getStore } from "@netlify/blobs";

const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_CAP_DOLLARS = 1.0;
// claude-sonnet-4-6 pricing: $3 / 1M input tokens, $15 / 1M output tokens.
const INPUT_COST_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;
// Anthropic's web_search tool: $10 per 1,000 searches. The prompt asks for exactly one.
const WEB_SEARCH_FLAT_FEE = 0.01;

function utcDateKey(ts) {
  return new Date(ts).toISOString().slice(0, 10); // YYYY-MM-DD in UTC
}

function nextUtcMidnightIso() {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}

function extractTitles(payload) {
  const text = (payload?.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const titles = [...text.matchAll(/"title"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
  return titles.slice(0, 6);
}

export default async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: { message: "POST only" } }, { status: 405 });
  }

  let store = null;
  try { store = getStore("herd-cache"); } catch (e) { /* blobs unavailable — fall through */ }

  let cached = null;
  if (store) {
    try { cached = await store.get("latest", { type: "json" }); } catch (e) { /* ignore */ }
  }

  let body = {};
  try { body = await req.json(); } catch (e) { /* ignore */ }
  const refresh = body?.refresh === true;

  // Passive load with a still-fresh cache: serve it, no API call, no cost.
  if (!refresh && cached && Date.now() - cached.fetchedAt < DAY_MS) {
    return Response.json({ ...cached.payload, cachedAt: cached.fetchedAt });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return Response.json(
      { error: { message: "ANTHROPIC_API_KEY is not set in Netlify environment variables" } },
      { status: 500 }
    );
  }

  // Shared daily budget check — applies to every live fetch, passive or refresh.
  const today = utcDateKey(Date.now());
  let budget = { date: today, spentDollars: 0, calls: 0 };
  if (store) {
    try {
      const stored = await store.get("budget", { type: "json" });
      if (stored && stored.date === today) budget = stored;
    } catch (e) { /* ignore, use fresh budget */ }
  }

  if (budget.spentDollars >= DAILY_CAP_DOLLARS) {
    if (cached) {
      return Response.json({
        ...cached.payload,
        cachedAt: cached.fetchedAt,
        budgetExhausted: true,
        budgetResetAt: nextUtcMidnightIso()
      });
    }
    return Response.json(
      { error: { message: "Daily news budget reached — check back after midnight UTC." } },
      { status: 429 }
    );
  }

  // Only input we accept from the client: an optional Solana contract address (validated).
  let ca = "";
  try { ca = String(body.ca || ""); } catch (e) { /* ignore */ }
  if (!/^[1-9A-HJ-NP-Za-km-z]{30,50}$/.test(ca)) ca = "";

  const avoidTitles = refresh && cached ? extractTitles(cached.payload) : [];
  const avoidClause = avoidTitles.length
    ? " Avoid repeating these stories already shown: " + avoidTitles.map((t) => '"' + t + '"').join(", ") +
      " — search for different or additional coverage instead. If genuinely nothing else recent exists, it's fine to include one of them again."
    : "";

  const prompt =
    "Do ONE web search for the latest news and X/Twitter chatter about the $ANSEM Solana memecoin 'The Black Bull'" +
    (ca ? " (contract " + ca + ")" : "") + "." + avoidClause + " " +
    "Then output ONLY a raw JSON array — no markdown, no backticks, no preamble, no trailing text — of 3 to 4 objects: " +
    '[{"title":"short headline (max 10 words)","summary":"one short sentence","source":"site or @handle","url":"https://...","tag":"news","date":"YYYY-MM-DD"}]. ' +
    '"date" is the article or post\'s publish date, taken from the search result — use your best reading of it, and if a story truly has no determinable date, omit the "date" field entirely rather than guessing. ' +
    'Allowed tag values: "news", "tweet", "alpha". Keep every field brief so the array is small. ' +
    "When multiple sources cover the same story, prefer larger, well-known outlets (e.g. CoinDesk, Cointelegraph, The Block, Decrypt, Bloomberg) and high-profile X accounts — but still include smaller sources when they have the freshest or only coverage. " +
    "If nothing recent is found, return one item saying so.";

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
        tools: [{ type: "web_search_20250305", name: "web_search" }]
      })
    });
    const payload = await r.json().catch(() => null);
    if (!r.ok || !payload) {
      return Response.json(payload ?? { error: { message: "upstream error" } }, { status: r.status || 502 });
    }

    const usage = payload.usage || {};
    const cost =
      (usage.input_tokens || 0) * INPUT_COST_PER_TOKEN +
      (usage.output_tokens || 0) * OUTPUT_COST_PER_TOKEN +
      WEB_SEARCH_FLAT_FEE;

    const fetchedAt = Date.now();
    if (store) {
      try {
        await store.setJSON("latest", { fetchedAt, payload });
        await store.setJSON("budget", {
          date: today,
          spentDollars: budget.spentDollars + cost,
          calls: budget.calls + 1
        });
      } catch (e) { /* cache write failed — still serve this response */ }
    }
    return Response.json({ ...payload, cachedAt: fetchedAt, refreshed: refresh });
  } catch (e) {
    return Response.json({ error: { message: "proxy error: " + e.message } }, { status: 502 });
  }
};
