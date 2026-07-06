// Herd Report proxy — keeps the Anthropic API key server-side.
// Set ANTHROPIC_API_KEY in Netlify: Site settings → Environment variables.
// The prompt is fixed here on purpose: this endpoint can ONLY fetch $ANSEM news,
// so even if someone finds it, they can't use it as a free general-purpose Claude proxy.
//
// Results are cached in Netlify Blobs for 24 hours, so the Anthropic API is
// called at most once per day TOTAL — every other request (from any visitor,
// on production or branch previews) is served from the cache for free.

import { getStore } from "@netlify/blobs";

const DAY_MS = 24 * 60 * 60 * 1000;

export default async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: { message: "POST only" } }, { status: 405 });
  }

  // Serve from the daily cache when it's still fresh.
  let store = null;
  try { store = getStore("herd-cache"); } catch (e) { /* blobs unavailable — fall through */ }
  if (store) {
    try {
      const cached = await store.get("latest", { type: "json" });
      if (cached && Date.now() - cached.fetchedAt < DAY_MS) {
        return Response.json({ ...cached.payload, cachedAt: cached.fetchedAt });
      }
    } catch (e) { /* cache read failed — fall through to a live call */ }
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return Response.json(
      { error: { message: "ANTHROPIC_API_KEY is not set in Netlify environment variables" } },
      { status: 500 }
    );
  }

  // Only input we accept from the client: an optional Solana contract address (validated).
  let ca = "";
  try { ca = String((await req.json()).ca || ""); } catch (e) { /* ignore */ }
  if (!/^[1-9A-HJ-NP-Za-km-z]{30,50}$/.test(ca)) ca = "";

  const prompt =
    "Do ONE web search for the latest news and X/Twitter chatter about the $ANSEM Solana memecoin 'The Black Bull'" +
    (ca ? " (contract " + ca + ")" : "") + ". " +
    "Then output ONLY a raw JSON array — no markdown, no backticks, no preamble, no trailing text — of 3 to 4 objects: " +
    '[{"title":"short headline (max 10 words)","summary":"one short sentence","source":"site or @handle","url":"https://...","tag":"news"}]. ' +
    'Allowed tag values: "news", "tweet", "alpha". Keep every field brief so the array is small. ' +
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
    const fetchedAt = Date.now();
    if (store) {
      try { await store.setJSON("latest", { fetchedAt, payload }); } catch (e) { /* cache write failed — still serve */ }
    }
    return Response.json({ ...payload, cachedAt: fetchedAt });
  } catch (e) {
    return Response.json({ error: { message: "proxy error: " + e.message } }, { status: 502 });
  }
};
