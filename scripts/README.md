# Scripts

Place one-off data/backfill scripts here. Reuse the Zoho client from `catalyst/functions/src/lib/zohoClient.ts` via a small wrapper entry (Node TS).

## Deployment

Client is deployed via Slate (GitHub auto-deploy on main). No CLI client deploy is used anymore.

Local dev:

```pwsh
npm --prefix web run dev
```
