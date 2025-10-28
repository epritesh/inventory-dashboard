# Copilot instructions — Inventory Dashboard (Zoho Catalyst + Zoho Inventory/Books)

Purpose
- This repo hosts multiple inventory-related efforts. Default approach: Catalyst functions as a backend proxy to Zoho Inventory/Books APIs, plus a web UI dashboard. Keep secrets in Catalyst, never in the frontend.

Big picture
- Data flow: Web UI → Catalyst Function(s) → Zoho Inventory/Books API → normalize + cache (optional) → UI.
- Why this shape: Centralizes OAuth and rate limiting in the backend; the UI stays tokenless and simple.

Repository layout (expected)
- `web/` — Frontend dashboard (e.g., React + Vite). Talks only to Catalyst HTTP endpoints you define.
- `catalyst/functions/` — Node.js functions; hold OAuth, API clients, and business logic.
- `catalyst/config/` — Catalyst project config, env mappings, and any datastore definitions.
- `docs/` — Short architecture notes and API mapping tables per effort.
- `scripts/` — One-off data/backfill scripts that reuse the same API client.

Developer workflows (PowerShell; confirm CLI naming in your setup)
```powershell
# Note: the npm package is `zcatalyst-cli`, but the executable command is `catalyst`.

# One-time: authenticate Catalyst (opens browser)
catalyst login

# Initialize a new effort inside this repo (creates Catalyst skeleton; run in repo root)
catalyst init

# Local dev: run functions emulator and web dev server (from two shells)
catalyst serve
cd web
npm ci
npm run dev

# Deploy functions to Catalyst (staging by default; set env via flag/config)
catalyst deploy
```

Environment and config (set via Catalyst environment variables/secrets)
- Required for Zoho: ZOHO_DC (us|eu|in|au|jp), ZOHO_ORG_ID, ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_SERVICE ("inventory"|"books").
- Derived/overridable: ZOHO_API_BASE (e.g., https://inventory.zoho.com/api/v1 or https://books.zoho.com/api/v3; confirm version per API docs).
- Catalyst: CATALYST_PROJECT_ID, CATALYST_ENVIRONMENT (dev|staging|prod).
- Optional: CACHE_TTL_SECONDS (API response cache), LOG_LEVEL.

Integration notes (Zoho Inventory/Books via OAuth2)
- Use backend-only OAuth: store client creds + refresh token in Catalyst; issue access tokens server-side.
- Pick endpoints by service:
  - Inventory: Items, Warehouses, SalesOrders, PurchaseOrders, StockAdjustments.
  - Books: Items, Invoices, Customers, SalesOrders.
- Respect rate limits; implement simple backoff/retry and paging. Prefer incremental sync by updated_time when available.

Patterns and conventions for this repo
- TypeScript in functions and web; central API client under `catalyst/functions/lib/zohoClient.ts` with service-agnostic wrapper and per-service modules.
- One HTTP entry per UI feature (thin controllers calling reusable service layer).
- Error model: map Zoho errors to HTTP 4xx/5xx; return `{ code, message, details?, requestId }`.
- Logging: structured JSON to Catalyst logs; redact tokens; include org, user (if applicable), and service.
- Tests: unit-test API client with mocked HTTP; add one smoke test per function handler.

Examples (when you scaffold)
- Catalyst function route: `GET /api/items?service=inventory` → calls `zoho.inventory.listItems({ page, per_page })`.
- Web fetch: `GET /api/metrics/stockouts` → backend aggregates Items + SalesOrders into a KPI payload.

Dev convenience
- Vite proxy forwards `/api` to `http://localhost:9000` during local dev; prefer relative fetches (e.g., `fetch('/api/items')`).

Multi-effort guidance
- Create one folder per effort under `docs/efforts/<slug>/` with a short README: API scopes used, endpoints touched, and any custom tables.
- Reuse the same Catalyst project where feasible; separate environments by Catalyst envs (dev/staging/prod) and prefix secrets with effort slug if needed.

Unknowns to confirm (please reply and I’ll fill these in)
- Preferred frontend stack (React/Vite?) and package manager (npm/pnpm/yarn).
- Exact Catalyst CLI package/name in your environment (e.g., `zcatalyst`).
- Primary Zoho DC, target service first (“inventory” or “books”), and required API versions.
- Any existing Catalyst project ID/environment naming you want standardized here.