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

        // Lightweight token validation endpoint to verify env vars and OAuth are working
        if (req.method === 'GET' && pathname === '/api/auth-test') {
            try {
                const client = new zohoClient_1.ZohoClient({
                    dc: process.env.ZOHO_DC || 'us',
                    service: (process.env.ZOHO_SERVICE === 'inventory' ? 'inventory' : 'books'),
                    orgId: process.env.ZOHO_ORG_ID,
                    clientId: process.env.ZOHO_CLIENT_ID,
                    clientSecret: process.env.ZOHO_CLIENT_SECRET,
                    refreshToken: process.env.ZOHO_REFRESH_TOKEN,
                    cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS || '300')
                });
                const token = await client.getAccessToken();
                res.writeHead?.(200, { 'content-type': 'application/json' });
                res.end?.(JSON.stringify({ success: true, tokenLength: token?.length || 0, tokenPrefix: token ? token.substring(0, 18) + '...' : null }));
                return;
            } catch (error) {
                res.writeHead?.(500, { 'content-type': 'application/json' });
                res.end?.(JSON.stringify({ success: false, error: error?.message, details: error?.response?.data }));
                return;
            }
        }
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
            const missingEnv = required.filter(k => !process.env[k]);
            if (missingEnv.length) {
                res.writeHead?.(503, { 'content-type': 'application/json' });
                res.end?.(JSON.stringify({ code: 'missing_env', message: 'Required environment variables are missing', missing: missingEnv }));
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
            const debugRequested = query?.debug === '1' || query?.debug === 'true';
            const ttl = Number(process.env.CACHE_TTL_SECONDS || '300');
            const useCache = ttl > 0 && !debugRequested;
            const cacheKey = `items:${service}:${process.env.ZOHO_ORG_ID}:${page || 1}:${per_page || ''}:${JSON.stringify(extraParams)}`;
            if (useCache) {
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
            
            // Debug logging to understand Zoho response
            if (debugRequested && (process.env.DEBUG_AUTH === '1')) {
                console.log('[DEBUG] Zoho listItems response:', JSON.stringify(data, null, 2));
                console.log('[DEBUG] Request params:', JSON.stringify(Object.assign({ page, per_page }, extraParams), null, 2));
            }
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
            
            // Apply business rule filter: exclude SKUs starting with 0-, 800-, 2000-
            const applyBusinessFilter = (items) => {
                return items.filter(item => {
                    const sku = getSku(item) || '';
                    return !sku.startsWith('0-') && !sku.startsWith('800-') && !sku.startsWith('2000-');
                });
            };
            
            const itemsArr = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
            const businessFilteredItems = applyBusinessFilter(itemsArr);
            const normalizedItems = businessFilteredItems.map((it) => Object.assign({}, it, { qty: getQty(it), sku: getSku(it) }));
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
            if (debugRequested && (process.env.DEBUG_AUTH === '1')) {
                responseBody.diag = {
                    upstreamPageContext: pc || null,
                    inferredHasMore: summary.has_more_page,
                    returnedCount: normalizedItems.length,
                    service,
                    rawUpstreamItemsLength: itemsArr ? itemsArr.length : 0,
                    businessFilteredCount: businessFilteredItems ? businessFilteredItems.length : 0,
                    extraParams,
                    zohoResponseKeys: data ? Object.keys(data) : null,
                    hasItemsProperty: data ? ('items' in data) : false,
                    itemsIsArray: data?.items ? Array.isArray(data.items) : false
                };
            }
            if (useCache)
                cacheSet(cacheKey, responseBody, ttl);
            res.writeHead?.(200, { 'content-type': 'application/json', 'x-cache': 'miss' });
            res.end?.(JSON.stringify(responseBody));
            return;
        }
        // KPI: Below Reorder Level
        if (req.method === 'GET' && pathname === '/api/metrics/reorder-risk') {
            const required = ['ZOHO_ORG_ID','ZOHO_CLIENT_ID','ZOHO_CLIENT_SECRET','ZOHO_REFRESH_TOKEN'];
            const missingEnv2 = required.filter(k => !process.env[k]);
            if (missingEnv2.length) {
                res.writeHead?.(503, { 'content-type': 'application/json' });
                res.end?.(JSON.stringify({ code: 'missing_env', message: 'Required environment variables are missing', missing: missingEnv2 }));
                return;
            }
            const maxPages = query?.max_pages ? Number(query.max_pages) : 5;
            const perPage = query?.per_page ? Number(query.per_page) : 200;
            const includeItems = (query?.include === 'items' || query?.detail === '1' || query?.detail === 'true');
            const limit = query?.limit ? Math.max(1, Math.min(2000, Number(query.limit))) : 1000;
            const qService = typeof query?.service === 'string' ? query.service.toLowerCase() : undefined;
            const service = (qService === 'books' || qService === 'inventory') ? qService : (process.env.ZOHO_SERVICE || 'books');
            const ttl = Number(process.env.CACHE_TTL_SECONDS || '300');
            const debugRequested = query?.debug === '1' || query?.debug === 'true';
            const useCache = ttl > 0 && !debugRequested;
            const cacheKey = `reorder:${service}:${process.env.ZOHO_ORG_ID}:${maxPages}:${perPage}`;
            if (useCache) {
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
            const pageSummaries = [];
            for (let page = 1; page <= maxPages; page++) {
                const data = await client.listItems({ page, per_page: perPage });
                const items = data?.items || data || [];
                allItems = allItems.concat(items);
                const pc = data?.page_context;
                pageSummaries.push({ page, count: Array.isArray(items) ? items.length : 0, total: pc?.total, has_more_page: pc?.has_more_page });
                if (!items.length) break;
            }
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
            const getReorder = (it) => (
                (typeof it.reorder_level === 'number' ? it.reorder_level : undefined) ??
                (typeof it.reorder_point === 'number' ? it.reorder_point : undefined) ??
                (typeof it.re_order_level === 'number' ? it.re_order_level : undefined) ??
                undefined
            );
            const applyBusinessFilter = (items) => items.filter(item => {
                const sku = getSku(item) || '';
                return !sku.startsWith('0-') && !sku.startsWith('800-') && !sku.startsWith('2000-');
            });
            const filtered = applyBusinessFilter(allItems);
            let below = 0, withReorder = 0, missingReorder = 0;
            const sample = [];
            const detailItems = [];
            for (const it of filtered) {
                const r = getReorder(it);
                if (typeof r === 'number' && r >= 0) {
                    withReorder++;
                    const q = getQty(it);
                    if (q <= r) {
                        below++;
                        if (sample.length < 10) {
                            sample.push({
                                id: it.item_id || it.item_id_string || undefined,
                                name: it.name,
                                sku: getSku(it) || undefined,
                                qty: q,
                                reorder_level: r,
                                variance: (r - q)
                            });
                        }
                        if (includeItems && detailItems.length < limit) {
                            detailItems.push({
                                id: it.item_id || it.item_id_string || undefined,
                                name: it.name,
                                sku: getSku(it) || undefined,
                                qty: q,
                                reorder_level: r,
                                variance: (r - q)
                            });
                        }
                    }
                } else {
                    missingReorder++;
                }
            }
            const body = {
                kpi: {
                    belowReorder: below,
                    totalWithReorder: withReorder,
                    missingReorder: missingReorder
                },
                sample
            };
            if (includeItems) body.items = detailItems;
            if (debugRequested && (process.env.DEBUG_AUTH === '1')) {
                body.diag = { service, per_page: perPage, max_pages: maxPages, pagesFetched: pageSummaries.length, pageSummaries };
            }
            if (useCache) cacheSet(cacheKey, body, ttl);
            res.writeHead?.(200, { 'content-type': 'application/json', 'x-cache': 'miss' });
            res.end?.(JSON.stringify(body));
            return;
        }
        // KPI: Inventory Value (On Hand)
        if (req.method === 'GET' && pathname === '/api/metrics/inventory-value') {
            const required = ['ZOHO_ORG_ID','ZOHO_CLIENT_ID','ZOHO_CLIENT_SECRET','ZOHO_REFRESH_TOKEN'];
            const missing = required.filter(k => !process.env[k]);
            if (missing.length) {
                res.writeHead?.(503, { 'content-type': 'application/json' });
                res.end?.(JSON.stringify({ code: 'missing_env', message: 'Required environment variables are missing', missing }));
                return;
            }
            const maxPages = query?.max_pages ? Number(query.max_pages) : 5;
            const perPage = query?.per_page ? Number(query.per_page) : 200;
            const includeItems = (query?.include === 'items' || query?.detail === '1' || query?.detail === 'true');
            const limit = query?.limit ? Math.max(1, Math.min(2000, Number(query.limit))) : 1000;
            const qService = typeof query?.service === 'string' ? query.service.toLowerCase() : undefined;
            const service = (qService === 'books' || qService === 'inventory') ? qService : (process.env.ZOHO_SERVICE || 'books');
            const ttl = Number(process.env.CACHE_TTL_SECONDS || '300');
            const debugRequested = query?.debug === '1' || query?.debug === 'true';
            const useCache = ttl > 0 && !debugRequested;
            const cacheKey = `invvalue:${service}:${process.env.ZOHO_ORG_ID}:${maxPages}:${perPage}`;
            if (useCache) {
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
            const pageSummaries = [];
            for (let page = 1; page <= maxPages; page++) {
                const data = await client.listItems({ page, per_page: perPage });
                const items = data?.items || data || [];
                allItems = allItems.concat(items);
                const pc = data?.page_context;
                pageSummaries.push({ page, count: Array.isArray(items) ? items.length : 0, total: pc?.total, has_more_page: pc?.has_more_page });
                if (!items.length) break;
            }
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
            const getCost = (it) => (
                (typeof it.cost_price === 'number' ? it.cost_price : undefined) ??
                (typeof it.purchase_rate === 'number' ? it.purchase_rate : undefined) ??
                (typeof it.initial_stock_rate === 'number' ? it.initial_stock_rate : undefined) ??
                undefined
            );
            const getCurrency = (it) => (
                (typeof it.currency_code === 'string' ? it.currency_code : undefined)
            );
            const applyBusinessFilter = (items) => items.filter(item => {
                const sku = getSku(item) || '';
                return !sku.startsWith('0-') && !sku.startsWith('800-') && !sku.startsWith('2000-');
            });
            const filtered = applyBusinessFilter(allItems);
            let totalValue = 0;
            let withCost = 0;
            let missingCost = 0;
            let currency = undefined;
            const sample = [];
            const detailItems = [];
            for (const it of filtered) {
                const qty = getQty(it);
                const cost = getCost(it);
                if (currency == null) currency = getCurrency(it);
                if (typeof cost === 'number') {
                    withCost++;
                    const val = qty * cost;
                    totalValue += val;
                    if (sample.length < 10) {
                        sample.push({
                            id: it.item_id || it.item_id_string || undefined,
                            name: it.name,
                            sku: getSku(it) || undefined,
                            qty,
                            cost,
                            value: val
                        });
                    }
                    if (includeItems && detailItems.length < limit) {
                        detailItems.push({
                            id: it.item_id || it.item_id_string || undefined,
                            name: it.name,
                            sku: getSku(it) || undefined,
                            qty,
                            cost,
                            value: val
                        });
                    }
                } else {
                    missingCost++;
                }
            }
            const defaultCurrency = process.env.DEFAULT_CURRENCY || 'CRC';
            // Sort detail by value desc if present
            if (includeItems) detailItems.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
            const body = {
                kpi: {
                    totalValue,
                    currency: currency || defaultCurrency,
                    itemsWithCost: withCost,
                    itemsMissingCost: missingCost
                },
                sample
            };
            if (includeItems) body.items = detailItems;
            if (debugRequested && (process.env.DEBUG_AUTH === '1')) {
                body.diag = { service, per_page: perPage, max_pages: maxPages, pagesFetched: pageSummaries.length, pageSummaries, resolvedCurrency: body.kpi.currency };
            }
            if (useCache) cacheSet(cacheKey, body, ttl);
            res.writeHead?.(200, { 'content-type': 'application/json', 'x-cache': 'miss' });
            res.end?.(JSON.stringify(body));
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
            const debugRequested = query?.debug === '1' || query?.debug === 'true';
            const useCache = ttl > 0 && !debugRequested;
            const cacheKey = `stockouts:${service}:${process.env.ZOHO_ORG_ID}:${threshold}:${maxPages}:${perPage}`;
            if (useCache) {
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
            const pageSummaries = [];
            for (let page = 1; page <= maxPages; page++) {
                const data = await client.listItems({ page, per_page: perPage });
                const items = data?.items || data || [];
                allItems = allItems.concat(items);
                const pc = data?.page_context;
                pageSummaries.push({ page, count: Array.isArray(items) ? items.length : 0, total: pc?.total, has_more_page: pc?.has_more_page });
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
            
            // Apply business rule filter: exclude SKUs starting with 0-, 800-, 2000-
            const applyBusinessFilter = (items) => {
                return items.filter(item => {
                    const sku = item.sku || item.item_code || '';
                    return !sku.startsWith('0-') && !sku.startsWith('800-') && !sku.startsWith('2000-');
                });
            };
            
            const stockouts = applyBusinessFilter(allItems).filter((it) => getQty(it) <= threshold);
            const filteredAllItems = applyBusinessFilter(allItems);
            const body = {
                kpi: {
                    stockouts: stockouts.length,
                    totalItems: filteredAllItems.length,
                    threshold
                },
                sample: stockouts.slice(0, 10).map((it) => ({
                    id: it.item_id || it.item_id_string || it.item_id_long || it.item_id_int || undefined,
                    name: it.name,
                    sku: it.sku || it.item_code || undefined,
                    qty: getQty(it)
                }))
            };
            if (debugRequested && (process.env.DEBUG_AUTH === '1')) {
                body.diag = {
                    service,
                    per_page: perPage,
                    max_pages: maxPages,
                    pagesFetched: pageSummaries.length,
                    pageSummaries
                };
            }
            if (useCache)
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
