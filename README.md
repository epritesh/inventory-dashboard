# Inventory Dashboard (Zoho Catalyst + Zoho Inventory/Books)

This repo hosts multiple inventory-related efforts. Default shape:

- Web UI (`web/`) talks only to Catalyst HTTP functions you define.
- Catalyst functions (`catalyst/functions/`) proxy Zoho Inventory/Books APIs securely.

Dev quick start (Windows PowerShell)

```powershell
# 1) Authenticate Catalyst (opens browser)
catalyst login

# 2) Start Catalyst local emulator (HTTP functions)
catalyst serve

# 3) Start the web dev server in a separate shell
cd web
# First-time install: generates package-lock.json
npm install
# Dev uses a Vite proxy for /api → http://localhost:9000; no API base env needed
npm run dev
```

Catalyst setup (one-time in this repo)

```powershell
# Initialize function directory and choose types
catalyst functions:setup
# When prompted:
# - Function type: Advanced I/O
# - Runtime: Node.js
# - Function name: api (recommended)
# - Directory: functions/api (default is fine)
```

After setup, wire our existing handler into the generated function:

- If Advanced I/O created `functions/api/index.js` with Express, replace its contents with:

```js
// functions/api/index.js (Advanced I/O)
const express = require('express')
const { handler } = require('../../catalyst/functions/dist/index.js')
const app = express()

app.all('*', (req, res) => handler(req, res))

module.exports = app
```

- If you chose Basic I/O instead, use:

```js
// functions/api/index.js (Basic I/O)
const { handler } = require('../../catalyst/functions/dist/index.js')
module.exports = (req, res) => handler(req, res)
```

Deploy (staging by default; set env via flag/config)

```powershell
catalyst deploy
```

Environment (managed by Catalyst; do NOT commit secrets)

- ZOHO_DC: us|eu|in|au|jp
- ZOHO_ORG_ID
- ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN
- ZOHO_SERVICE: inventory|books
- Optional: CACHE_TTL_SECONDS, LOG_LEVEL

Project layout

- `web/` — React + Vite (TS) with proxy to `/api`
- `catalyst/functions/` — Node TS functions + Zoho client
- `catalyst/config/` — notes and env mapping
- `docs/efforts/` — per-effort notes (scopes, endpoints)
- `scripts/` — one-off utilities reusing the Zoho client

Notes

- OAuth happens server-side only (Catalyst). The web app never holds Zoho tokens.
- Prefer incremental syncs by updated_time when supported. Respect rate limits.
- Dev uses a Vite proxy for `/api` → `http://localhost:9000`; no `VITE_API_BASE` needed.
- Default Zoho service is Books unless `ZOHO_SERVICE` is set.

Authentication (Catalyst Native Authentication)

- Optional during local dev; enable when you want to protect endpoints or before public deploy.
- After `catalyst functions:setup`, you can add auth checks in the generated function using Catalyst’s request context.

First-time vs repeat installs

- First time in each subproject (`web/`, `catalyst/functions/`): use `npm install` to create a lockfile.
- Subsequent clean installs (e.g., CI): you can use `npm ci` once `package-lock.json` exists.

Refer to `./.github/copilot-instructions.md` for agent-specific guidance.

## Cloud endpoints (Catalyst)

After `catalyst deploy`, the Advanced I/O function base URL prints in the CLI, e.g.:

```text
https://inventory-dashboard-903975067.development.catalystserverless.com/server/api/
```

- Health: `…/server/api/api/health`
- Items (Books): `…/server/api/api/items?service=books`

Note: In local dev, the Vite proxy maps `/api/*` → `http://localhost:3000/server/api/*`. In cloud, prefer the explicit `/server/api/api/*` form to avoid platform-specific path normalization differences.

### Switch the web app to use the deployed function

Set `VITE_API_BASE` in `web/.env.local` (or `.env`) to your function base URL and restart Vite:

```bash
VITE_API_BASE=https://<your-env>.catalystserverless.com/server/api
```

With this set, the web app will call `VITE_API_BASE + /api/...` (e.g., `…/server/api/api/items`).

### Avoid wiping environment variables on deploy

Do not keep an `env_variables` block in `functions/api/catalyst-config.json`. The CLI treats those values as the source of truth and can overwrite/clear variables in your Catalyst environment during `catalyst deploy`. This repo removes that field so you can manage secrets in the Catalyst Console without them being reset on deploy.

Required variables (set in Catalyst Console → Environment):

- ZOHO_DC (us|eu|in|au|jp)
- ZOHO_ORG_ID
- ZOHO_CLIENT_ID
- ZOHO_CLIENT_SECRET
- ZOHO_REFRESH_TOKEN
- Optional: ZOHO_SERVICE=books, CACHE_TTL_SECONDS
