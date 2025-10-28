import { parse } from 'node:url'
import { ZohoClient } from './lib/zohoClient'

// Catalyst HTTP function entry (Express-like). Exported symbol name may vary by Catalyst binding.
export async function handler(req: any, res: any) {
  try {
    // Set CORS headers first to handle authentication issues
    const corsHeaders = {
      'Access-Control-Allow-Origin': process.env.ALLOW_ORIGIN || 'http://localhost:5173',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Catalyst-Token',
      'Content-Type': 'application/json'
    }
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.writeHead?.(200, corsHeaders)
      res.end?.('')
      return
    }

    // Try to bypass authentication for API endpoints
    const { pathname, query } = parse(req.url || '', true)
    
    // Check if this is an authenticated request
    const hasAuth = req.headers?.['x-catalyst-token'] || req.headers?.authorization
    
    // For unauthenticated API requests, try to handle them directly
    if (pathname?.startsWith('/api/') && !hasAuth) {
      console.log('Handling unauthenticated API request:', pathname)
    }

    if (req.method === 'GET' && pathname === '/api/auth-test') {
      try {
        const client = new ZohoClient({
          service: process.env.ZOHO_SERVICE as any || 'books',
          dc: process.env.ZOHO_DC as any || 'us',
          orgId: process.env.ZOHO_ORG_ID!,
          clientId: process.env.ZOHO_CLIENT_ID!,
          clientSecret: process.env.ZOHO_CLIENT_SECRET!,
          refreshToken: process.env.ZOHO_REFRESH_TOKEN!,
          cacheTtlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '3600')
        })
        
        // Try to get a fresh access token
        const token = await (client as any).getAccessToken()
        
        res.writeHead?.(200, corsHeaders)
        res.end?.(JSON.stringify({
          success: true,
          tokenLength: token?.length || 0,
          tokenPrefix: token?.substring(0, 20) + '...'
        }))
        return
      } catch (error: any) {
        res.writeHead?.(500, corsHeaders)
        res.end?.(JSON.stringify({
          success: false,
          error: error.message,
          details: error.response?.data || null
        }))
        return
      }
    }

    if (req.method === 'GET' && pathname === '/api/health') {
      res.writeHead?.(200, corsHeaders)
      res.end?.(JSON.stringify({ 
        ok: true, 
        service: process.env.ZOHO_SERVICE || 'books',
        dc: process.env.ZOHO_DC || 'us',
        org: process.env.ZOHO_ORG_ID?.replace(/^(\d{3})\d*(\d{2})$/, '$1***$2'),
        allowOrigin: process.env.ALLOW_ORIGIN || 'http://localhost:5173',
        debugAuth: process.env.DEBUG_AUTH === '1'
      }))
      return
    }

    if (req.method === 'GET' && pathname === '/api/items') {
      const page = query?.page ? Number(query.page) : undefined
      const per_page = query?.per_page ? Number(query.per_page) : undefined
      const client = new ZohoClient({
        dc: process.env.ZOHO_DC as any,
        service: (process.env.ZOHO_SERVICE as any) || 'books',
        orgId: process.env.ZOHO_ORG_ID!,
        clientId: process.env.ZOHO_CLIENT_ID!,
        clientSecret: process.env.ZOHO_CLIENT_SECRET!,
        refreshToken: process.env.ZOHO_REFRESH_TOKEN!,
        cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS || '300')
      })
      const data = await client.listItems({ page, per_page })
      res.writeHead?.(200, corsHeaders)
      res.end?.(JSON.stringify(data))
      return
    }

    if (req.method === 'GET' && pathname === '/api/metrics/stockouts') {
      const threshold = query?.threshold ? Number(query.threshold) : 0
      const maxPages = query?.max_pages ? Number(query.max_pages) : 5
      const perPage = query?.per_page ? Number(query.per_page) : 200
      const client = new ZohoClient({
        dc: process.env.ZOHO_DC as any,
        service: (process.env.ZOHO_SERVICE as any) || 'books',
        orgId: process.env.ZOHO_ORG_ID!,
        clientId: process.env.ZOHO_CLIENT_ID!,
        clientSecret: process.env.ZOHO_CLIENT_SECRET!,
        refreshToken: process.env.ZOHO_REFRESH_TOKEN!,
        cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS || '300')
      })

      let allItems: any[] = []
      for (let page = 1; page <= maxPages; page++) {
        const data = await client.listItems({ page, per_page: perPage })
        const items = data?.items || data || []
        allItems = allItems.concat(items)
        if (!items.length) break
      }

      const getQty = (it: any) => {
        // Books vs Inventory may report differently; try common fields
        return (
          (typeof it.available_stock === 'number' ? it.available_stock : undefined) ??
          (typeof it.stock_on_hand === 'number' ? it.stock_on_hand : undefined) ??
          (typeof it.quantity === 'number' ? it.quantity : undefined) ??
          0
        )
      }

      const stockouts = allItems.filter((it) => getQty(it) <= threshold)

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
      }

      res.writeHead?.(200, corsHeaders)
      res.end?.(JSON.stringify(body))
      return
    }

    res.writeHead?.(404, corsHeaders)
    res.end?.(JSON.stringify({ code: 'not_found', message: 'Route not found' }))
  } catch (err: any) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': process.env.ALLOW_ORIGIN || 'http://localhost:5173',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json'
    }
    const status = err?.status || 500
    const body = {
      code: err?.code || 'internal_error',
      message: err?.message || 'Unexpected error',
      details: err?.response?.data,
    }
    res.writeHead?.(status, corsHeaders)
    res.end?.(JSON.stringify(body))
  }
}

// Minimal local dev server wiring (node:http) for `npm run dev` in this folder
if (process.env.NODE_ENV !== 'production' && process.argv[1]?.endsWith('devServer.ts')) {
  // noop: real server lives in devServer.ts
}
