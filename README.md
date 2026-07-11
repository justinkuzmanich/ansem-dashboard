# $ANSEM — The Black Bull Dashboard

Live memecoin dashboard for $ANSEM on Solana.

**Production:** https://ansemdash.com
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
  chatter, auto-loaded on page open (served from a 24h Netlify Blobs cache,
  so passive page loads never cost more than one API call a day). The
  **"Round up new sources"** button asks for a genuinely fresh search that
  avoids repeating the stories already shown — but every live fetch (passive
  or button-triggered) draws from one shared daily budget, hard-capped at
  $1.00/day across all visitors and both deploy contexts. Once the cap is
  hit, the button falls back to the last cached report until the budget
  resets at UTC midnight.
- **Position calculator** — visitors enter their holdings (and optional average
  buy price) to see live value, cost basis, P/L, and return %. Values persist
  in the visitor's own browser (localStorage) across visits.
- **Flex card** — once a position is entered, a "Flex your position" button
  renders a shareable canvas image (value, P/L, return %) and shares it via
  the Web Share API where supported, falling back to a download plus a
  pre-filled tweet. Entirely client-side, no server cost.
- **Whale Watch** — a live feed of recent buys/sells pulled straight from
  GeckoTerminal's public pool-trades endpoint (polled every 15s, deduped by
  tx hash), color-coded green/red with a 🐋 badge on trades $1,000+, linking
  out to Solscan. Keyless and client-side, no server cost.
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
main  ──►  https://ansemdash.com        (production)
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
- The shared daily spend tracker lives in the same store (key `budget`),
  keyed by UTC date. Check it any time with
  `netlify blobs:get herd-cache budget` — `{"date":"YYYY-MM-DD","spentDollars":N,"calls":N}`.
  It resets itself automatically the first time a new UTC day is seen.

## Key safety notes

- **Never** paste the key into index.html or commit it anywhere in the repo.
- The proxy's prompt is hardcoded server-side and only accepts a validated
  Solana contract address as input, so the endpoint can't be repurposed as a
  general Claude proxy. Passive loads are 24h-cached; the refresh button can
  trigger live fetches, but a shared $1.00/day hard cap (real measured cost,
  not an estimate — see Configuration) bounds worst-case spend regardless of
  how many times anyone presses it.
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
| Whale Watch trades | GeckoTerminal pool trades (public API) | 15s |
| News / Herd Report | Claude web search via Netlify function | 24h cache, or on-demand via refresh button (shared $1/day cap) |

## Disclaimers

NFA / DYOR. Data from public APIs and may lag or fail.
