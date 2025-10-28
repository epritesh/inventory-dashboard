import React from 'react'
import { listItems, getStockouts, type ItemQuery } from './lib/api'

export function App() {
  const [items, setItems] = React.useState<any[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [kpi, setKpi] = React.useState<{ stockouts: number; totalItems: number; threshold: number } | null>(null)
  const [sample, setSample] = React.useState<any[] | null>(null)
  const [page, setPage] = React.useState<number>(1)
  const [perPage, setPerPage] = React.useState<number>(100)
  const [hasMore, setHasMore] = React.useState<boolean>(false)
  const [summary, setSummary] = React.useState<{ page?: number; per_page?: number; has_more_page?: boolean; total?: number; count?: number; service?: string } | null>(null)
  const [service, setService] = React.useState<'books' | 'inventory'>(((import.meta as any).env?.VITE_ZOHO_SERVICE as 'books' | 'inventory') || 'books')
  const [search, setSearch] = React.useState<string>('')
  const [sku, setSku] = React.useState<string>('')
  const [sort, setSort] = React.useState<{ column?: string; order?: 'A' | 'D' }>({})
  const [status, setStatus] = React.useState<'Active' | 'Inactive' | 'All'>('Active')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const params: ItemQuery = { page, per_page: perPage, service }
      // For Books, use name_contains for simple free-text search
      if (service === 'books' && search.trim()) params.name_contains = search.trim()
      if (service === 'books' && sku.trim()) params.sku = sku.trim()
      if (service === 'books') {
        const map: Record<string, string> = { Active: 'Status.Active', Inactive: 'Status.Inactive', All: 'Status.All' }
        params.filter_by = map[status]
      }
      if (service === 'books' && sort.column) {
        params.sort_column = sort.column
        if (sort.order) params.sort_order = sort.order
      }
      const data = await listItems(params)
      const maybeItems = (data && Array.isArray((data as any).items)) ? (data as any).items
                        : (Array.isArray(data) ? (data as any) : [])
      setItems(maybeItems)
      const s = (data as any)?.summary as any
      setSummary(s || null)
      if (s && typeof s.has_more_page === 'boolean') setHasMore(!!s.has_more_page)
      else {
        const pc = (data as any)?.page_context
        if (pc && typeof pc.has_more_page === 'boolean') setHasMore(pc.has_more_page)
        else setHasMore(Array.isArray(maybeItems) && maybeItems.length >= (perPage || 0))
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load items')
    } finally {
      setLoading(false)
    }
  }

  const loadKpi = async () => {
    try {
      const data = await getStockouts({ threshold: 0, per_page: 200, max_pages: 3 })
      setKpi(data?.kpi ?? null)
      setSample(data?.sample ?? null)
    } catch (e: any) {
      // keep errors non-fatal; display inline
      console.warn('KPI load failed:', e?.message)
    }
  }

  React.useEffect(() => {
    load()
    loadKpi()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, perPage, service, sort.column, sort.order])

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 16 }}>
      <h1>Inventory Dashboard</h1>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label>
          Service:
          <select value={service} onChange={(e) => { setPage(1); setService(e.target.value as any) }} style={{ marginLeft: 6 }}>
            <option value="books">Books</option>
            <option value="inventory">Inventory</option>
          </select>
        </label>
        <label>
          Search name:
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="contains…" style={{ marginLeft: 6 }} />
        </label>
        <label>
          SKU:
          <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="exact SKU" style={{ marginLeft: 6 }} />
        </label>
        <label>
          Per page:
          <select value={perPage} onChange={(e) => { setPage(1); setPerPage(Number(e.target.value)) }} style={{ marginLeft: 6 }}>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </label>
        <label>
          Sort:
          <select value={sort.column || ''} onChange={(e) => setSort((s) => ({ ...s, column: e.target.value || undefined }))} style={{ marginLeft: 6 }}>
            <option value="">(none)</option>
            <option value="name">Name</option>
            <option value="rate">Rate</option>
            <option value="sku">SKU</option>
          </select>
          <select value={sort.order || 'A'} onChange={(e) => setSort((s) => ({ ...s, order: (e.target.value as 'A' | 'D') }))} style={{ marginLeft: 6 }}>
            <option value="A">Asc</option>
            <option value="D">Desc</option>
          </select>
        </label>
        {service === 'books' && (
          <label>
            Status:
            <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value as any) }} style={{ marginLeft: 6 }}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="All">All</option>
            </select>
          </label>
        )}
        <button onClick={() => { setPage(1); load() }} disabled={loading}>
          {loading ? 'Loading…' : 'Apply'}
        </button>
      </div>
      <div style={{ marginTop: 8 }}>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={loading || page <= 1}>
          ‹ Prev
        </button>
        <span style={{ margin: '0 8px' }}>Page {page}</span>
        <button onClick={() => setPage((p) => p + 1)} disabled={loading || !hasMore}>
          Next ›
        </button>
      </div>
      {summary && (
        <div style={{ marginTop: 6, fontSize: 13, color: '#444' }}>
          <span>Items: <strong>{summary.count ?? (items?.length ?? 0)}</strong></span>
          <span style={{ marginLeft: 12 }}>Page: <strong>{summary.page ?? page}</strong></span>
          <span style={{ marginLeft: 12 }}>Per page: <strong>{summary.per_page ?? perPage}</strong></span>
          {typeof summary.total === 'number' && (
            <span style={{ marginLeft: 12 }}>Total: <strong>{summary.total}</strong></span>
          )}
          <span style={{ marginLeft: 12 }}>More pages: <strong>{summary.has_more_page ? 'Yes' : 'No'}</strong></span>
          {summary.service && (
            <span style={{ marginLeft: 12 }}>Service: <strong>{summary.service}</strong></span>
          )}
        </div>
      )}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {Array.isArray(items) && (
        <table style={{ marginTop: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '4px 8px' }}>Name</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '4px 8px' }}>SKU</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '4px 8px' }}>Qty</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it: any) => (
              <tr key={it.item_id || it.item_id_string || it.sku}>
                <td style={{ padding: '4px 8px' }}>{it.name}</td>
                <td style={{ padding: '4px 8px' }}>{it.sku || it.item_code || '-'}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>{(it as any).qty ?? it.stock_on_hand ?? it.available_stock ?? it.quantity ?? '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ marginTop: 24 }}>Stockouts KPI</h2>
      {kpi ? (
        <div style={{ marginBottom: 12 }}>
          <strong>{kpi.stockouts}</strong> stockouts of <strong>{kpi.totalItems}</strong> items (threshold ≤ {kpi.threshold})
        </div>
      ) : (
        <div>Loading KPI…</div>
      )}
      {sample && sample.length > 0 && (
        <table style={{ marginTop: 8, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '4px 8px' }}>Name</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '4px 8px' }}>SKU</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ddd', padding: '4px 8px' }}>Qty</th>
            </tr>
          </thead>
          <tbody>
            {sample.map((it: any, idx: number) => (
              <tr key={it.id || it.sku || idx}>
                <td style={{ padding: '4px 8px' }}>{it.name}</td>
                <td style={{ padding: '4px 8px' }}>{it.sku || '-'}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>{it.qty ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
