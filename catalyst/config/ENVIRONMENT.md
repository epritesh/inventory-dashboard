# Catalyst environment configuration

Manage all secrets in Catalyst environments (dev/staging/prod). Do not commit secrets to the repo.

Required environment variables

- ZOHO_DC: us|eu|in|au|jp
- ZOHO_ORG_ID
- ZOHO_CLIENT_ID
- ZOHO_CLIENT_SECRET
- ZOHO_REFRESH_TOKEN
- ZOHO_SERVICE: inventory|books

Optional

- ZOHO_API_BASE: override detected API base (e.g., <https://inventory.zoho.com/api/v1>)
- CACHE_TTL_SECONDS: default 300
- LOG_LEVEL

Local development

- Use `catalyst serve` to emulate functions. For the web app, set `VITE_API_BASE` to the emulator host (e.g., <http://localhost:9000>).
- Do not place `.env` files with Zoho secrets in the repo; use your local secure store if needed.
