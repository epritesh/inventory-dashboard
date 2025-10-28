import axios, { AxiosInstance } from 'axios'

type ZohoService = 'inventory' | 'books'
type ZohoDC = 'us' | 'eu' | 'in' | 'au' | 'jp'

function accountsHost(dc: ZohoDC) {
  const override = process.env.ZOHO_ACCOUNTS_BASE
  if (override) return override.replace(/\/$/, '')
  switch (dc) {
    case 'eu': return 'https://accounts.zoho.eu'
    case 'in': return 'https://accounts.zoho.in'
    case 'au': return 'https://accounts.zoho.com.au'
    case 'jp': return 'https://accounts.zoho.jp'
    case 'us':
    default: return 'https://accounts.zoho.com'
  }
}

function apiBase(service: ZohoService, dc: ZohoDC) {
  // Highest priority: explicit full base override
  if (process.env.ZOHO_API_BASE) return process.env.ZOHO_API_BASE.replace(/\/$/, '')

  // Next: service-specific host override. Accept host-only or full path.
  const svcOverride = service === 'books' ? process.env.ZOHO_BOOKS_BASE : process.env.ZOHO_INVENTORY_BASE
  if (svcOverride) {
    let base = svcOverride
    if (!/^https?:\/\//i.test(base)) base = `https://${base}`
    base = base.replace(/\/$/, '')
    const hasPath = /\/(books|inventory)\//i.test(base)
    if (hasPath) return base
    return service === 'books' ? `${base}/books/v3` : `${base}/inventory/v1`
  }

  // Default: zohoapis domain derived from DC
  const tld = dc === 'us' ? 'com' : dc // eu, in, jp map directly; au => com.au
  const host = tld === 'com' ? 'www.zohoapis.com' : (tld === 'au' ? 'www.zohoapis.com.au' : `www.zohoapis.${tld}`)
  return service === 'books' ? `https://${host}/books/v3` : `https://${host}/inventory/v1`
}

export class ZohoClient {
  private service: ZohoService
  private dc: ZohoDC
  private orgId: string
  private clientId: string
  private clientSecret: string
  private refreshToken: string
  private cacheTtlSeconds: number
  private http: AxiosInstance
  // Token cache is shared across instances to avoid minting a token per request
  private static globalTokenCache: Map<string, { access_token?: string; expires_at?: number }> = new Map()
  private static globalTokenRefreshing: Map<string, Promise<string>> = new Map()
  private tokenCacheKey: string

  constructor(opts: {
    service: ZohoService,
    dc: ZohoDC,
    orgId: string,
    clientId: string,
    clientSecret: string,
    refreshToken: string,
    cacheTtlSeconds?: number
  }) {
    this.service = opts.service
    this.dc = opts.dc
    this.orgId = opts.orgId
    this.clientId = opts.clientId
    this.clientSecret = opts.clientSecret
    this.refreshToken = opts.refreshToken
    this.cacheTtlSeconds = opts.cacheTtlSeconds ?? 300
    this.http = axios.create({ baseURL: process.env.ZOHO_API_BASE || apiBase(this.service, this.dc), timeout: 30_000 })
    // Key by dc+clientId+orgId to scope token to this tenant/app
    this.tokenCacheKey = `${this.dc}:${this.clientId}:${this.orgId}`
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now() / 1000
    const cached = ZohoClient.globalTokenCache.get(this.tokenCacheKey)
    if (cached?.access_token && cached?.expires_at && cached.expires_at - now > 30) {
      return cached.access_token
    }
    // Deduplicate concurrent refreshes
    const existing = ZohoClient.globalTokenRefreshing.get(this.tokenCacheKey)
    if (existing) return existing

    const refreshPromise = (async () => {
      const url = `${accountsHost(this.dc)}/oauth/v2/token`
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken
      })
      
      if (process.env.DEBUG_AUTH === '1') {
        console.log('ZohoClient.getAccessToken DEBUG:', {
          url,
          clientId: this.clientId.substring(0, 10) + '...',
          refreshTokenLength: this.refreshToken.length
        })
      }
      
      const resp = await this.withRetry(() => axios.post(url, params))
      
      if (process.env.DEBUG_AUTH === '1') {
        console.log('ZohoClient.getAccessToken RESPONSE:', {
          status: resp.status,
          hasAccessToken: !!resp.data.access_token,
          expiresIn: resp.data.expires_in
        })
      }
      
      const access = resp.data.access_token as string
      const expires = Number(resp.data.expires_in) || this.cacheTtlSeconds
      const record = { access_token: access, expires_at: Math.floor(now + expires) }
      ZohoClient.globalTokenCache.set(this.tokenCacheKey, record)
      return access
    })()

    ZohoClient.globalTokenRefreshing.set(this.tokenCacheKey, refreshPromise)
    try {
      return await refreshPromise
    } finally {
      ZohoClient.globalTokenRefreshing.delete(this.tokenCacheKey)
    }
  }

  private async authHeaders() {
    const token = await this.getAccessToken()
    return {
      Authorization: `Zoho-oauthtoken ${token}`
    } as Record<string, string | undefined>
  }

  async listItems(params: { page?: number; per_page?: number } = {}) {
    if (process.env.DEBUG_AUTH === '1') {
      console.log('ZohoClient.listItems START - Environment check:', {
        hasOrgId: !!this.orgId,
        orgIdLength: this.orgId?.length,
        hasClientId: !!this.clientId,
        hasClientSecret: !!this.clientSecret,
        hasRefreshToken: !!this.refreshToken,
        service: this.service,
        dc: this.dc,
        baseURL: this.http.defaults.baseURL
      })
    }

    const headers = await this.authHeaders()
    const query: Record<string, any> = { organization_id: this.orgId }
    if (params.page) query.page = params.page
    if (params.per_page) query.per_page = params.per_page
    // Books and Inventory both expose /items, shape differs slightly.
    
    // Add debugging info
    if (process.env.DEBUG_AUTH === '1') {
      console.log('ZohoClient.listItems REQUEST DEBUG:', {
        baseURL: this.http.defaults.baseURL,
        url: '/items',
        query,
        authHeaderPresent: !!headers.Authorization,
        authHeaderPrefix: headers.Authorization?.substring(0, 30) + '...'
      })
    }
    
    try {
      const resp = await this.withRetry(() => this.http.get('/items', { headers, params: query }))
      
      if (process.env.DEBUG_AUTH === '1') {
        console.log('ZohoClient.listItems RESPONSE SUCCESS:', {
          status: resp.status,
          statusText: resp.statusText,
          dataType: typeof resp.data,
          hasItems: !!(resp.data && 'items' in resp.data),
          dataKeys: Object.keys(resp.data || {}),
          dataSnippet: typeof resp.data === 'string' ? resp.data.substring(0, 200) : JSON.stringify(resp.data).substring(0, 200)
        })
      }
      
      return resp.data
    } catch (error: any) {
      if (process.env.DEBUG_AUTH === '1') {
        console.log('ZohoClient.listItems ERROR:', {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          responseType: typeof error.response?.data,
          responseSnippet: typeof error.response?.data === 'string' 
            ? error.response.data.substring(0, 200) 
            : JSON.stringify(error.response?.data || {}).substring(0, 200)
        })
      }
      throw error
    }
  }

  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let attempt = 0
    let lastErr: any
    while (attempt < maxRetries) {
      try {
        return await fn()
      } catch (err: any) {
        lastErr = err
        const status = err?.response?.status
        const msg = (err?.response?.data?.error_description || err?.message || '').toString().toLowerCase()
        const retriable = status === 429 || msg.includes('too many requests') || msg.includes('try again')
        if (!retriable) break
        const delay = Math.min(2000, 250 * Math.pow(2, attempt)) + Math.floor(Math.random() * 100)
        await new Promise((r) => setTimeout(r, delay))
        attempt++
      }
    }
    throw lastErr
  }
}
