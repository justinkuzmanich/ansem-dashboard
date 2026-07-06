// Herd Report proxy — keeps the Anthropic API key server-side.
// Set ANTHROPIC_API_KEY in Netlify: Site settings → Environment variables.
// The prompt is fixed here on purpose: this endpoint can ONLY fetch $ANSEM news,
// so even if someone finds it, they can't use it as a free general-purpose Claude proxy.

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: { message: "POST only" } }) };
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: { message: "ANTHROPIC_API_KEY is not set in Netlify environment variables" } })
    };
  }

  // Only input we accept from the client: an optional Solana contract address (validated).
  let ca = "";
  try { ca = String(JSON.parse(event.body || "{}").ca || ""); } catch (e) { /* ignore */ }
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
    const body = await r.text();
    return { statusCode: r.status, headers: { "content-type": "application/json" }, body };
  } catch (e) {
    return {
      statusCode: 502,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: { message: "proxy error: " + e.message } })
    };
  }
};
