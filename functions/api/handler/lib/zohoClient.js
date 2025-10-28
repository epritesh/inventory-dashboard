"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZohoClient = void 0;
const axios_1 = __importDefault(require("axios"));
function accountsHost(dc) {
    const override = process.env.ZOHO_ACCOUNTS_BASE;
    if (override)
        return override.replace(/\/$/, '');
    switch (dc) {
        case 'eu': return 'https://accounts.zoho.eu';
        case 'in': return 'https://accounts.zoho.in';
        case 'au': return 'https://accounts.zoho.com.au';
        case 'jp': return 'https://accounts.zoho.jp';
        case 'us':
        default: return 'https://accounts.zoho.com';
    }
}
function apiBase(service, dc) {
    if (process.env.ZOHO_API_BASE)
        return process.env.ZOHO_API_BASE.replace(/\/$/, '');
    const svcOverride = service === 'books' ? process.env.ZOHO_BOOKS_BASE : process.env.ZOHO_INVENTORY_BASE;
    if (svcOverride) {
        let base = svcOverride;
        if (!/^https?:\/\//i.test(base))
            base = `https://${base}`;
        base = base.replace(/\/$/, '');
        const hasPath = /\/(books|inventory)\//i.test(base);
        if (hasPath)
            return base;
        return service === 'books' ? `${base}/books/v3` : `${base}/inventory/v1`;
    }
    const tld = dc === 'us' ? 'com' : dc;
    const host = tld === 'com' ? 'www.zohoapis.com' : (tld === 'au' ? 'www.zohoapis.com.au' : `www.zohoapis.${tld}`);
    return service === 'books' ? `https://${host}/books/v3` : `https://${host}/inventory/v1`;
}
class ZohoClient {
    constructor(opts) {
        this.service = opts.service;
        this.dc = opts.dc;
        this.orgId = opts.orgId;
        this.clientId = opts.clientId;
        this.clientSecret = opts.clientSecret;
        this.refreshToken = opts.refreshToken;
        this.cacheTtlSeconds = opts.cacheTtlSeconds ?? 300;
        this.http = axios_1.default.create({ baseURL: process.env.ZOHO_API_BASE || apiBase(this.service, this.dc), timeout: 30000 });
        // Key by dc+clientId+orgId to scope token to this tenant/app
        this.tokenCacheKey = `${this.dc}:${this.clientId}:${this.orgId}`;
    }
    async getAccessToken() {
        const now = Date.now() / 1000;
        const cached = ZohoClient.globalTokenCache.get(this.tokenCacheKey);
        if (cached?.access_token && cached?.expires_at && cached.expires_at - now > 30) {
            return cached.access_token;
        }
        // Deduplicate concurrent refreshes
        const existing = ZohoClient.globalTokenRefreshing.get(this.tokenCacheKey);
        if (existing)
            return existing;
        const refreshPromise = (async () => {
            const url = `${accountsHost(this.dc)}/oauth/v2/token`;
            const params = new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: this.clientId,
                client_secret: this.clientSecret,
                refresh_token: this.refreshToken
            });
            const resp = await this.withRetry(() => axios_1.default.post(url, params));
            const access = resp.data.access_token;
            const expires = Number(resp.data.expires_in) || this.cacheTtlSeconds;
            const record = { access_token: access, expires_at: Math.floor(now + expires) };
            ZohoClient.globalTokenCache.set(this.tokenCacheKey, record);
            return access;
        })();
        ZohoClient.globalTokenRefreshing.set(this.tokenCacheKey, refreshPromise);
        try {
            return await refreshPromise;
        }
        finally {
            ZohoClient.globalTokenRefreshing.delete(this.tokenCacheKey);
        }
    }
    async authHeaders() {
        const token = await this.getAccessToken();
        return {
            Authorization: `Zoho-oauthtoken ${token}`,
            'X-com-zoho-subscriptions-organizationid': undefined,
            'organization_id': this.orgId,
        };
    }
    async listItems(params = {}) {
        const headers = await this.authHeaders();
        const query = {};
        for (const [k, v] of Object.entries(params)) {
            if (v !== undefined && v !== null)
                query[k] = v;
        }
        // Always include organization_id as query param (required by Zoho APIs)
    const queryParams = Object.assign({ organization_id: this.orgId }, query);
        // Books and Inventory both expose /items, shape differs slightly.
        const resp = await this.withRetry(() => this.http.get('/items', { headers, params: queryParams }));
        return resp.data;
    }
    async withRetry(fn, maxRetries = 3) {
        let attempt = 0;
        let lastErr;
        while (attempt < maxRetries) {
            try {
                return await fn();
            }
            catch (err) {
                lastErr = err;
                const status = err?.response?.status;
                const msg = (err?.response?.data?.error_description || err?.message || '').toString().toLowerCase();
                const retriable = status === 429 || msg.includes('too many requests') || msg.includes('try again');
                if (!retriable)
                    break;
                const delay = Math.min(2000, 250 * Math.pow(2, attempt)) + Math.floor(Math.random() * 100);
                await new Promise((r) => setTimeout(r, delay));
                attempt++;
            }
        }
        throw lastErr;
    }
}
exports.ZohoClient = ZohoClient;
// Token cache is shared across instances to avoid minting a token per request
ZohoClient.globalTokenCache = new Map();
ZohoClient.globalTokenRefreshing = new Map();
