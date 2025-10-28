# Copilot instructions — Inventory Dashboard (Zoho Catalyst + Zoho Inventory/Books)

Purpose
- Backend (Catalyst functions) proxies Zoho Inventory/Books securely; frontend (React + Vite) calls only those HTTP endpoints. Secrets live in Catalyst, not the web app.

Big picture
- Flow: web `fetch('/api/...')` → Catalyst function handler → Zoho API → normalize/aggregate → response to UI.
- Why: OAuth, rate limits, and retries are centralized server-side; UI remains tokenless.

Repo layout (actual)
- `web/` React + Vite (TS). Proxy for local dev is defined in `web/vite.config.ts`.
- `catalyst/functions/` TypeScript functions: entry `src/index.ts`, Zoho client `src/lib/zohoClient.ts`, local runner `src/devServer.ts`.
- `docs/efforts/` Per-effort notes (scopes, endpoints). See `docs/efforts/README.md`.
- `scripts/` One-off utilities reusing the Zoho client (see `scripts/README.md`).

Developer workflows (PowerShell)
```powershell
# Login once (opens browser)
catalyst login  # Windows binary is catalyst.cmd; 'catalyst' works in PowerShell

# Local dev: Catalyst emulator + web (run in two shells)
catalyst serve                 # functions on http://localhost:3000/server/api
cd web; npm install; npm run dev

# Tests/build (functions)
npm run test:functions         # runs Jest in catalyst/functions
npm run build:functions        # tsc build to catalyst/functions/dist

# Deploy (set env in Catalyst Console)
catalyst deploy
```

Local routing and examples
- Vite dev proxy maps `/api/*` → `http://localhost:3000/server/api/*` (see `web/vite.config.ts`).
- Implemented routes in `catalyst/functions/src/index.ts`:
  - `GET /api/health` → `{ ok: true, service }`.
  - `GET /api/items?per_page=5&page=1` → `ZohoClient.listItems` (Books/Inventory; defaults to Books if `ZOHO_SERVICE` unset).
  - `GET /api/metrics/stockouts?threshold=0&max_pages=5&per_page=200` → computes KPI from paged items.

Environment (configure in Catalyst; do NOT commit secrets)
- Required: `ZOHO_DC` (us|eu|in|au|jp), `ZOHO_ORG_ID`, `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`.
- Optional: `ZOHO_SERVICE` (books|inventory, default books), `CACHE_TTL_SECONDS`, `ZOHO_API_BASE`/`ZOHO_BOOKS_BASE`/`ZOHO_INVENTORY_BASE` (override hosts), `ALLOW_ORIGIN`, `DEBUG_AUTH`.
- Avoid placing `env_variables` in Catalyst function config files; manage via Console to prevent deploy-time overwrites.

Conventions and patterns
- Single Zoho client (`src/lib/zohoClient.ts`) handles OAuth refresh, base URL resolution, retries (429/backoff), and paging helpers.
- Handler is a thin router; return JSON `{ code, message, details? }` on errors; map Zoho errors to HTTP 4xx/5xx.
- Tests live in `catalyst/functions/src/**/*.test.ts`; run with `npm run test:functions`.

Defaults used here
- Package manager: npm
- Catalyst CLI: catalyst (Windows: catalyst.cmd)
- Zoho service default: books
- Zoho DC default: us