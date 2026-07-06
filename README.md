# $ANSEM — The Black Bull Dashboard

Live memecoin dashboard for $ANSEM on Solana.

**Production:** https://ansem-dashboard.netlify.app
**Preview (dev branch):** https://dev--ansem-dashboard.netlify.app

## Features

- **Live price** — polled from DexScreener every 5 seconds, with a green/red
  flash when the price ticks up or down. Stats (market cap, volume, liquidity,
  txns, buys vs sells) refresh on the same cadence.
- **Holders + concentration** — holder count and top-10 wallet percentage from
  GeckoTerminal, refreshed every 5 minutes.
- **Candlestick chart** — GeckoTerminal OHLCV (15m / 1H / 4H / 1D), redrawn
  every minute.
- **AI Herd Report** — Claude does a live web search for $ANSEM news and CT
  chatter, auto-loaded on page open. Served through a Netlify function that
  caches the result in Netlify Blobs for 24 hours, so the Anthropic API is
  called **at most once per day total**, no matter how many visitors load or
  refresh the page.
- **Position calculator** — visitors enter their holdings (and optional average
  buy price) to see live value, cost basis, P/L, and return %. Values persist
  in the visitor's own browser (localStorage) across visits.
- **Buy / Tweet CTAs** — Buy $ANSEM (axiom.trade) and a pre-filled bullish
  tweet with the contract address and a dashboard link.
- **Full contract address** shown in the hero (with copy button) and under the
  price, always pulled live from the deepest-liquidity pair.
- Edge-to-edge ticker tape, glowing bull with nostril steam, Ansem photo
  linking to his X profile, donation QR, quick links (DexScreener, Solscan,
  X search).

## Structure

```
index.html                            the entire dashboard (self-contained)
netlify/functions/herd.mjs            serverless proxy — Anthropic key stays
                                      server-side; 24h Netlify Blobs news cache
netlify.toml                          publish dir + functions dir
package.json                          @netlify/blobs (bundled into the function)
.github/workflows/netlify-build.yml   pings Netlify's build hook on push
```

## Workflow: edit → preview → live

```
dev   ──►  https://dev--ansem-dashboard.netlify.app   (preview)
main  ──►  https://ansem-dashboard.netlify.app        (production)
```

1. Commit changes to the **`dev`** branch and push — the preview URL rebuilds
   automatically (~60s).
2. Review the preview. Iterate on `dev` until happy.
3. Merge `dev` into **`main`** and push — production rebuilds automatically.

Deploys are triggered by a GitHub Actions workflow that POSTs a Netlify build
hook with the pushed branch name; Netlify then clones the repo over HTTPS and
builds that branch. The hook URL can only trigger builds — rotate it in
Netlify under Build & deploy → Build hooks if ever needed.

## Configuration

- **`ANTHROPIC_API_KEY`** (Netlify → Project configuration → Environment
  variables): set as a secret for the **Production** and **Branch deploys**
  contexts. This is the only secret; it never appears in the repo or the page.
- The news cache lives in the Netlify Blobs store `herd-cache` (key `latest`)
  and is shared by production and branch deploys — delete the blob or wait 24h
  to force a fresh report.

## Key safety notes

- **Never** paste the key into index.html or commit it anywhere in the repo.
- The proxy's prompt is hardcoded server-side and only accepts a validated
  Solana contract address as input, so the endpoint can't be repurposed as a
  general Claude proxy. The 24h cache means even hammering the endpoint costs
  at most one small API call (~1000 tokens) per day.
- If you ever suspect the key leaked, revoke it in the Anthropic console and
  set a new one in Netlify env vars — no code changes needed.

## How the feed picks its data path

1. Tries `/.netlify/functions/herd` (production path, key server-side,
   24h-cached)
2. If unreachable (running inside Claude.ai or as a local file), calls the
   Anthropic API directly (keyless works inside Claude.ai)
3. As a last resort it shows a panel to paste a key manually (memory-only,
   for local testing)

## Data sources

| Data | Source | Refresh |
|---|---|---|
| Price, stats, buys/sells | DexScreener (public API) | 5s |
| Candles | GeckoTerminal (public API) | 60s |
| Holders, top-10 % | GeckoTerminal (public API) | 5 min |
| News / Herd Report | Claude web search via Netlify function | 24h cache |

## Disclaimers

NFA / DYOR. Data from public APIs and may lag or fail.
