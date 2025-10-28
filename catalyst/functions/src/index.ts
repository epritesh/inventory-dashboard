import { parse } from 'node:url'
import { ZohoClient } from './lib/zohoClient'

// Catalyst HTTP function entry (Express-like). Exported symbol name may vary by Catalyst binding.
export async function handler(req: any, res: any) {
  try {
    const { pathname, query } = parse(req.url || '', true)
    if (req.method === 'GET' && pathname === '/api/health') {
      res.writeHead?.(200, { 'content-type': 'application/json' })
      res.end?.(JSON.stringify({ ok: true, service: process.env.ZOHO_SERVICE || 'inventory' }))
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
      res.writeHead?.(200, { 'content-type': 'application/json' })
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

      res.writeHead?.(200, { 'content-type': 'application/json' })
      res.end?.(JSON.stringify(body))
      return
    }

    res.writeHead?.(404, { 'content-type': 'application/json' })
    res.end?.(JSON.stringify({ code: 'not_found', message: 'Route not found' }))
  } catch (err: any) {
    const status = err?.status || 500
    const body = {
      code: err?.code || 'internal_error',
      message: err?.message || 'Unexpected error',
      details: err?.response?.data,
    }
    res.writeHead?.(status, { 'content-type': 'application/json' })
    res.end?.(JSON.stringify(body))
  }
}

// Minimal local dev server wiring (node:http) for `npm run dev` in this folder
if (process.env.NODE_ENV !== 'production' && process.argv[1]?.endsWith('devServer.ts')) {
  // noop: real server lives in devServer.ts
}
