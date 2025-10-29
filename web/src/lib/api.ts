function pathFor(p: string) {
  const base = (import.meta as any).env?.VITE_API_BASE as string | undefined
  // If base is provided (cloud), don't prefix with /api. In dev, use /api to hit the proxy.
  return base ? (p.startsWith('/') ? p : `/${p}`) : (`/api${p.startsWith('/') ? p : `/${p}`}`)
}

async function http(path: string, init?: RequestInit) {
  // If VITE_API_BASE is set, it should point to the Catalyst function base, typically ending with '/server/api'.
  // In that case, don't duplicate the '/api' segment from callers; strip a leading '/api' from the provided path.
  // Otherwise, rely on the Vite proxy (dev) or same-origin (prod) using relative /api paths.
  const base = (import.meta as any).env?.VITE_API_BASE as string | undefined
  let p = path.startsWith('/') ? path : `/${path}`
  if (base && p.startsWith('/api')) {
    p = p.replace(/^\/(api)(?=\/|$)/, '') || '/'
  }
  const url = base ? `${base.replace(/\/$/, '')}${p}` : p
  // Merge headers; in dev use header for key, in prod append as query to avoid CORS preflight
  const headers = new Headers((init && (init as any).headers) || undefined)
  let finalUrl = url
  try {
    const k = localStorage.getItem('accessKey')
    if (k) {
      if (base) {
        const u = new URL(url, window.location.origin)
        if (!u.searchParams.has('access_key')) u.searchParams.set('access_key', k)
        finalUrl = u.toString()
      } else {
        headers.set('X-Access-Key', k)
      }
    }
  } catch {}
  // Do not set Content-Type for simple GETs; it triggers a CORS preflight unnecessarily.
  const res = await fetch(finalUrl, { ...init, headers, credentials: 'omit', mode: 'cors' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const err: any = new Error(`HTTP ${res.status}: ${text || res.statusText}`)
    ;(err as any).status = res.status
    throw err
  }
  return res.json()
}

export type ItemQuery = {
  page?: number
  per_page?: number
  service?: 'books' | 'inventory'
  // Books filters (allowlist mirrors backend)
  name?: string
  name_startswith?: string
  name_contains?: string
  description?: string
  description_startswith?: string
  description_contains?: string
  rate?: string
  rate_less_than?: string
  rate_less_equals?: string
  rate_greater_than?: string
  rate_greater_equals?: string
  tax_id?: string
  tax_name?: string
  is_taxable?: string
  tax_exemption_id?: string
  account_id?: string
  filter_by?: string
  sort_column?: string
  sort_order?: 'A' | 'D'
  status?: string
  sku?: string
  product_type?: string
}

export async function listItems(params: ItemQuery = {}) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') p.set(k, String(v))
  }
  if (!p.has('service')) p.set('service', ((import.meta as any).env?.VITE_ZOHO_SERVICE as string) || 'books')
  const q = p.toString()
  return http(pathFor(`/items${q ? `?${q}` : ''}`))
}

export async function getStockouts(params: { threshold?: number; per_page?: number; max_pages?: number } = {}) {
  const p = new URLSearchParams()
  if (params.threshold != null) p.set('threshold', String(params.threshold))
  if (params.per_page) p.set('per_page', String(params.per_page))
  if (params.max_pages) p.set('max_pages', String(params.max_pages))
  if (!(import.meta as any).env?.VITE_ZOHO_SERVICE) p.set('service', 'books')
  const q = p.toString()
  return http(pathFor(`/metrics/stockouts${q ? `?${q}` : ''}`))
}

export async function getHealth() {
  return http(pathFor(`/health`))
}
