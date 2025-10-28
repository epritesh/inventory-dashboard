"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const node_url_1 = require("node:url");
const zohoClient_1 = require("./lib/zohoClient");
// Simple in-memory response cache for hot GETs. Non-persistent; resets on cold start.
// Structure: key -> { expiresAt: epochSeconds, payload: any }
const responseCache = new Map();
function cacheGet(key) {
    try {
        const now = Math.floor(Date.now() / 1000);
        const entry = responseCache.get(key);
        if (!entry)
            return undefined;
        if (entry.expiresAt && entry.expiresAt > now)
            return entry.payload;
        // expired
        responseCache.delete(key);
    }
    catch { /* noop */ }
    return undefined;
}
function cacheSet(key, payload, ttlSeconds) {
    try {
        const now = Math.floor(Date.now() / 1000);
        const expiresAt = ttlSeconds > 0 ? now + ttlSeconds : 0;
        responseCache.set(key, { expiresAt, payload });
    }
    catch { /* noop */ }
}
// Catalyst HTTP function entry (Express-like). Exported symbol name may vary by Catalyst binding.
async function handler(req, res) {
    try {
        const { pathname, query } = (0, node_url_1.parse)(req.url || '', true);
        if (req.method === 'GET' && pathname === '/api/health') {
            const org = process.env.ZOHO_ORG_ID || '';
            const orgMasked = org ? `${org.slice(0, 3)}***${org.slice(-2)}` : undefined;
            res.writeHead?.(200, { 'content-type': 'application/json' });
            res.end?.(JSON.stringify({
                ok: true,
                service: process.env.ZOHO_SERVICE || 'books',
                dc: process.env.ZOHO_DC || 'us',
                org: orgMasked,
                allowOrigin: process.env.ALLOW_ORIGIN || '*',
                debugAuth: process.env.DEBUG_AUTH === '1'
            }));
            return;
        }
        if (req.method === 'GET' && pathname === '/api/items') {
            const required = ['ZOHO_ORG_ID','ZOHO_CLIENT_ID','ZOHO_CLIENT_SECRET','ZOHO_REFRESH_TOKEN'];
            const missing = required.filter(k => !process.env[k]);
            if (missing.length) {
                res.writeHead?.(503, { 'content-type': 'application/json' });
                res.end?.(JSON.stringify({ code: 'missing_env', message: 'Required environment variables are missing', missing }));
                return;
            }
            const page = query?.page ? Number(query.page) : undefined;
            const per_page = query?.per_page ? Number(query.per_page) : undefined;
            const qService = typeof query?.service === 'string' ? query.service.toLowerCase() : undefined;
            const service = (qService === 'books' || qService === 'inventory') ? qService : (process.env.ZOHO_SERVICE || 'books');
            // Allowlist of Books query params to pass through
            const booksAllowed = new Set(['name','name_startswith','name_contains','description','description_startswith','description_contains','rate','rate_less_than','rate_less_equals','rate_greater_than','rate_greater_equals','tax_id','tax_name','is_taxable','tax_exemption_id','account_id','filter_by','sort_column','sort_order','status','sku','product_type']);
            const extraParams = {};
            if (service === 'books' && query) {
                for (const [k, v] of Object.entries(query)) {
                    if (v == null)
                        continue;
                    if (k === 'page' || k === 'per_page' || k === 'service')
                        continue;
                    if (booksAllowed.has(k))
                        extraParams[k] = v;
                }
            }
            const ttl = Number(process.env.CACHE_TTL_SECONDS || '300');
            const cacheKey = `items:${service}:${process.env.ZOHO_ORG_ID}:${page || 1}:${per_page || ''}:${JSON.stringify(extraParams)}`;
            if (ttl > 0) {
                const cached = cacheGet(cacheKey);
                if (cached) {
                    res.writeHead?.(200, { 'content-type': 'application/json', 'x-cache': 'hit' });
                    res.end?.(JSON.stringify(cached));
                    return;
                }
            }
            const client = new zohoClient_1.ZohoClient({
                dc: process.env.ZOHO_DC || 'us',
                service,
                orgId: process.env.ZOHO_ORG_ID,
                clientId: process.env.ZOHO_CLIENT_ID,
                clientSecret: process.env.ZOHO_CLIENT_SECRET,
                refreshToken: process.env.ZOHO_REFRESH_TOKEN,
                cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS || '300')
            });
            const data = await client.listItems(Object.assign({ page, per_page }, extraParams));
            // Surface Zoho logical errors that still return HTTP 200
            if (data && typeof data === 'object' && 'code' in data && !Array.isArray(data.items)) {
                const anyData = data;
                if (typeof anyData.code === 'number' && anyData.code !== 0) {
                    const errBody = { code: 'upstream_error', upstreamCode: anyData.code, message: anyData.message || 'Zoho returned an error', details: anyData }
                    res.writeHead?.(502, { 'content-type': 'application/json' });
                    res.end?.(JSON.stringify(errBody));
                    return;
                }
            }
            // Normalize items array and add canonical fields for UI consistency
            const getQty = (it) => (
                (typeof it.available_stock === 'number' ? it.available_stock : undefined) ??
                (typeof it.stock_on_hand === 'number' ? it.stock_on_hand : undefined) ??
                (typeof it.quantity === 'number' ? it.quantity : undefined) ??
                0
            );
            const getSku = (it) => (
                (typeof it.sku === 'string' && it.sku) ? it.sku :
                    (typeof it.item_code === 'string' && it.item_code) ? it.item_code : undefined
            );
            const itemsArr = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
            const normalizedItems = itemsArr.map((it) => Object.assign({}, it, { qty: getQty(it), sku: getSku(it) }));
            const pc = data?.page_context;
            const summary = {
                page: Number((pc?.page ?? page ?? 1)),
                per_page: Number((pc?.per_page ?? per_page ?? (normalizedItems.length || 0))),
                has_more_page: (typeof pc?.has_more_page === 'boolean') ? pc.has_more_page : (normalizedItems.length >= Number(per_page || 0)),
                total: (typeof pc?.total === 'number') ? pc.total : undefined,
                count: normalizedItems.length,
                service
            };
            const responseBody = {
                items: normalizedItems,
                summary,
                page_context: pc
            };
            if (ttl > 0)
                cacheSet(cacheKey, responseBody, ttl);
            res.writeHead?.(200, { 'content-type': 'application/json', 'x-cache': 'miss' });
            res.end?.(JSON.stringify(responseBody));
            return;
        }
        if (req.method === 'GET' && pathname === '/api/metrics/stockouts') {
            const required = ['ZOHO_ORG_ID','ZOHO_CLIENT_ID','ZOHO_CLIENT_SECRET','ZOHO_REFRESH_TOKEN'];
            const missing = required.filter(k => !process.env[k]);
            if (missing.length) {
                res.writeHead?.(503, { 'content-type': 'application/json' });
                res.end?.(JSON.stringify({ code: 'missing_env', message: 'Required environment variables are missing', missing }));
                return;
            }
            const threshold = query?.threshold ? Number(query.threshold) : 0;
            const maxPages = query?.max_pages ? Number(query.max_pages) : 5;
            const perPage = query?.per_page ? Number(query.per_page) : 200;
            const qService = typeof query?.service === 'string' ? query.service.toLowerCase() : undefined;
            const service = (qService === 'books' || qService === 'inventory') ? qService : (process.env.ZOHO_SERVICE || 'books');
            const ttl = Number(process.env.CACHE_TTL_SECONDS || '300');
            const cacheKey = `stockouts:${service}:${process.env.ZOHO_ORG_ID}:${threshold}:${maxPages}:${perPage}`;
            if (ttl > 0) {
                const cached = cacheGet(cacheKey);
                if (cached) {
                    res.writeHead?.(200, { 'content-type': 'application/json', 'x-cache': 'hit' });
                    res.end?.(JSON.stringify(cached));
                    return;
                }
            }
            const client = new zohoClient_1.ZohoClient({
                dc: process.env.ZOHO_DC || 'us',
                service,
                orgId: process.env.ZOHO_ORG_ID,
                clientId: process.env.ZOHO_CLIENT_ID,
                clientSecret: process.env.ZOHO_CLIENT_SECRET,
                refreshToken: process.env.ZOHO_REFRESH_TOKEN,
                cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS || '300')
            });
            let allItems = [];
            for (let page = 1; page <= maxPages; page++) {
                const data = await client.listItems({ page, per_page: perPage });
                const items = data?.items || data || [];
                allItems = allItems.concat(items);
                if (!items.length)
                    break;
            }
            const getQty = (it) => {
                // Books vs Inventory may report differently; try common fields
                return ((typeof it.available_stock === 'number' ? it.available_stock : undefined) ??
                    (typeof it.stock_on_hand === 'number' ? it.stock_on_hand : undefined) ??
                    (typeof it.quantity === 'number' ? it.quantity : undefined) ??
                    0);
            };
            const stockouts = allItems.filter((it) => getQty(it) <= threshold);
            const body = {
                kpi: {
                    stockouts: stockouts.length,
                    totalItems: allItems.length,
                    threshold
                },
                sample: stockouts.slice(0, 10).map((it) => ({
                    id: it.item_id || it.item_id_string || it.item_id_long || it.item_id_int || undefined,
                    name: it.name,
                    sku: it.sku || it.item_code || undefined,
                    qty: getQty(it)
                }))
            };
            if (ttl > 0)
                cacheSet(cacheKey, body, ttl);
            res.writeHead?.(200, { 'content-type': 'application/json', 'x-cache': 'miss' });
            res.end?.(JSON.stringify(body));
            return;
        }
        res.writeHead?.(404, { 'content-type': 'application/json' });
        res.end?.(JSON.stringify({ code: 'not_found', message: 'Route not found' }));
    }
    catch (err) {
        const status = err?.status || 500;
        const body = {
            code: err?.code || 'internal_error',
            message: err?.message || 'Unexpected error',
            details: err?.response?.data,
        };
        res.writeHead?.(status, { 'content-type': 'application/json' });
        res.end?.(JSON.stringify(body));
    }
}
// Minimal local dev server wiring (node:http) for `npm run dev` in this folder
if (process.env.NODE_ENV !== 'production' && process.argv[1]?.endsWith('devServer.ts')) {
    // noop: real server lives in devServer.ts
}
