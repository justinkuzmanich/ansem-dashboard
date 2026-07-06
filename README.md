# $ANSEM — The Black Bull Dashboard

Live memecoin dashboard for $ANSEM on Solana. Price, stats, and candles come from
public APIs (DexScreener + GeckoTerminal, no keys needed). The AI-powered Herd
Report runs through a Netlify serverless function so the Anthropic API key never
touches the browser or the repo.

## Structure

```
index.html                      the entire dashboard (self-contained)
netlify/functions/herd.js       serverless proxy — holds the API key server-side
netlify.toml                    tells Netlify where the functions live
```

## Deploy (GitHub → Netlify)

1. **Push to GitHub**
   ```bash
   cd ansem-deploy
   git init
   git add .
   git commit -m "ANSEM Black Bull dashboard"
   git branch -M main
   git remote add origin https://github.com/justinkuzmanich/ansem-dashboard.git
   git push -u origin main
   ```

2. **Connect to Netlify**
   - Netlify → Add new site → Import an existing project → pick the repo
   - Build settings: no build command, publish directory `.` (netlify.toml handles the rest)

3. **Add the API key (the important part)**
   - Site configuration → Environment variables → Add a variable
   - Key: `ANTHROPIC_API_KEY`
   - Value: your key from https://console.anthropic.com/settings/keys
   - Scope: Functions (or all scopes is fine)
   - Redeploy the site after adding it (Deploys → Trigger deploy)

4. Done. The Herd Report button now works for every visitor, and the key is
   never visible in the page source, the repo, or the browser network tab.

## Key safety notes

- **Never** paste the key into index.html or commit it anywhere in the repo.
- The proxy's prompt is hardcoded server-side and only accepts a validated
  Solana contract address as input, so the endpoint can't be repurposed as a
  general Claude proxy. Each click costs one small API call (~1000 tokens max).
- If you ever suspect the key leaked, revoke it in the Anthropic console and
  set a new one in Netlify env vars — no code changes needed.
- Optional hardening if the site gets popular: enable Netlify rate limiting on
  `/.netlify/functions/herd`, or add a simple per-IP counter.

## How the feed picks its data path

1. Tries `/.netlify/functions/herd` (production path, key server-side)
2. If unreachable (running inside Claude.ai or as a local file), calls the
   Anthropic API directly (keyless works inside Claude.ai)
3. As a last resort it shows a panel to paste a key manually (memory-only,
   for local testing)

## Disclaimers

NFA / DYOR. Data from public APIs and may lag or fail.

## Live deployment

Production: https://ansem-dashboard.netlify.app — pushes to `main` auto-deploy
(GitHub Actions pings a Netlify build hook; Netlify clones and builds `main`).
