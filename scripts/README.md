# Scripts

Place one-off data/backfill scripts here. Reuse the Zoho client from `catalyst/functions/src/lib/zohoClient.ts` via a small wrapper entry (Node TS).

## Deploy client (Slate fallback via CLI)

Use the helper script to build the React app into `client/` and deploy the static client via Catalyst CLI. The `web/package.json` postbuild step ensures a SPA fallback by copying `index.html` to `404.html`.

PowerShell:

```pwsh
# From repo root or any path
pwsh -File scripts/deploy-client.ps1

# Skip reinstall for faster redeploys
pwsh -File scripts/deploy-client.ps1 -SkipInstall
```

This publishes to: `https://<project-id>.<env>.catalystserverless.com/app/`.
