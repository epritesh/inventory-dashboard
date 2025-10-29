import React from 'react'
import { listItems, getStockouts, getHealth, type ItemQuery } from './lib/api'

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
  const [status, setStatus] = React.useState<'Active' | 'Inactive' | 'All'>('All')
  const [debug, setDebug] = React.useState<boolean>(false)
  const [health, setHealth] = React.useState<any>(null)
  const [diag, setDiag] = React.useState<any>(null)
  const [needsKey, setNeedsKey] = React.useState<boolean>(false)
  const [keyInput, setKeyInput] = React.useState<string>("")
  const [showKeyPanel, setShowKeyPanel] = React.useState<boolean>(false)
  const [hasKey, setHasKey] = React.useState<boolean>(() => {
    try { return !!localStorage.getItem('accessKey') } catch { return false }
  })
  const [kpiThreshold, setKpiThreshold] = React.useState<number>(0)
  const [selected, setSelected] = React.useState<any | null>(null)

  const clearKey = () => {
    try { localStorage.removeItem('accessKey') } catch {}
    setHasKey(false)
    setKeyInput('')
    setNeedsKey(true)
    setShowKeyPanel(false)
    setItems(null)
    setKpi(null)
    setSample(null)
    setHealth(null)
    loadHealth()
  }

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
      if (debug) (params as any).debug = '1'
  const data = await listItems(params)
      const maybeItems = (data && Array.isArray((data as any).items)) ? (data as any).items
                        : (Array.isArray(data) ? (data as any) : [])
      setItems(maybeItems)
      const s = (data as any)?.summary as any
      setSummary(s || null)
  setDiag((data as any)?.diag || null)
      if (s && typeof s.has_more_page === 'boolean') setHasMore(!!s.has_more_page)
      else {
        const pc = (data as any)?.page_context
        if (pc && typeof pc.has_more_page === 'boolean') setHasMore(pc.has_more_page)
        else setHasMore(Array.isArray(maybeItems) && maybeItems.length >= (perPage || 0))
      }
    } catch (e: any) {
      if (e?.status === 401) {
        setNeedsKey(true)
        setError(null)
      } else {
        setError(e?.message ?? 'Failed to load items')
      }
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

  // Debounce search and SKU changes to auto-apply filters
  React.useEffect(() => {
    const t = setTimeout(() => {
      setPage(1)
      load()
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, sku])

  const loadHealth = async () => {
    try { const h = await getHealth(); setHealth(h) } catch { /* ignore */ }
  }
  React.useEffect(() => { loadHealth() }, [])

  // Restore filters from localStorage on first mount
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem('filters')
      if (raw) {
        const f = JSON.parse(raw)
        if (f.service) setService(f.service)
        if (f.status) setStatus(f.status)
        if (typeof f.page === 'number') setPage(f.page)
        if (typeof f.perPage === 'number') setPerPage(f.perPage)
        if (typeof f.search === 'string') setSearch(f.search)
        if (typeof f.sku === 'string') setSku(f.sku)
        if (f.sort && (f.sort.column || f.sort.order)) setSort(f.sort)
        if (typeof f.kpiThreshold === 'number') setKpiThreshold(f.kpiThreshold)
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist filters when they change
  React.useEffect(() => {
    try {
      const f = { service, status, page, perPage, search, sku, sort, kpiThreshold }
      localStorage.setItem('filters', JSON.stringify(f))
    } catch { /* ignore */ }
  }, [service, status, page, perPage, search, sku, sort.column, sort.order, kpiThreshold])

  // On first load, allow providing the key via URL (?accessKey=... or ?key=...)
  React.useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const k = params.get('accessKey') || params.get('key')
      if (k) {
  localStorage.setItem('accessKey', k)
  setHasKey(true)
        // Clean the URL without reloading the page
        const url = new URL(window.location.href)
        url.searchParams.delete('accessKey')
        url.searchParams.delete('key')
        window.history.replaceState(null, '', url.toString())
        setNeedsKey(false)
        setShowKeyPanel(false)
        setPage(1)
        // Kick off a load with the new key
        load()
        loadHealth()
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const online = !!health?.ok
  const envService = health?.service || service
  const envDc = health?.dc || 'us'
  const buildInfo = (import.meta as any).env?.VITE_GIT_SHA || ''

  const resetFilters = () => {
    setSearch('')
    setSku('')
    setSort({})
    setStatus('All')
    setPerPage(100)
    setPage(1)
    // keep current service selection
    load()
  }

  return (
    <div className="container">
      <div className="header">
        <div className="title">
          <img className="logo" src="/logo.png" alt="Pantera" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
          <span className="brand">Inventory</span> Dashboard
        </div>
        <div className={`badge ${online ? 'ok' : 'err'}`}>
          {online ? 'Online' : 'Offline'} • {envService} • {envDc.toUpperCase()}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {hasKey ? (
            <>
              <span className="badge" title="A stored access key will be used for API calls">Key set</span>
              <button className="link" title="Remove the stored access key" onClick={() => { if (window.confirm('Clear the stored access key? You will need to enter it again to view data.')) clearKey() }}>Clear</button>
            </>
          ) : (
            <button className="btn" onClick={() => setShowKeyPanel(true)} style={{ marginLeft: 8 }}>Enter access key</button>
          )}
        </div>
      </div>
      <div className="controls" role="region" aria-label="Filters and actions">
        <label>
          Service:
          <select value={service} onChange={(e) => { setPage(1); setService(e.target.value as any) }}>
            <option value="books">Books</option>
            <option value="inventory">Inventory</option>
          </select>
        </label>
        <label>
          Search name:
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="contains…" />
        </label>
        <label>
          SKU:
          <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="exact SKU" />
        </label>
        <label>
          Per page:
          <select value={perPage} onChange={(e) => { setPage(1); setPerPage(Number(e.target.value)) }}>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </label>
        <label>
          Sort:
          <select value={sort.column || ''} onChange={(e) => setSort((s) => ({ ...s, column: e.target.value || undefined }))}>
            <option value="">(none)</option>
            <option value="name">Name</option>
            <option value="rate">Rate</option>
            <option value="sku">SKU</option>
          </select>
          <select value={sort.order || 'A'} onChange={(e) => setSort((s) => ({ ...s, order: (e.target.value as 'A' | 'D') }))}>
            <option value="A">Asc</option>
            <option value="D">Desc</option>
          </select>
        </label>
        {service === 'books' && (
          <label>
            Status:
            <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value as any) }}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="All">All</option>
            </select>
          </label>
        )}
        <button className="btn" onClick={() => { setPage(1); load() }} disabled={loading}>
          {loading ? 'Loading…' : 'Apply'}
        </button>
        <button className="link" onClick={resetFilters} title="Clear filters and show defaults">Reset filters</button>
        <label>
          Debug:
          <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} />
        </label>
      </div>

      {(needsKey || showKeyPanel) && (
        <div className="notice" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Access required</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="Enter access key" />
            <button className="btn" onClick={() => { try { localStorage.setItem('accessKey', keyInput.trim()); setHasKey(true); setNeedsKey(false); setShowKeyPanel(false); setPage(1); load(); loadHealth(); } catch {} }}>Unlock</button>
            <button className="btn" onClick={() => { try { localStorage.removeItem('accessKey'); } catch {} finally { setKeyInput(''); setShowKeyPanel(false); setNeedsKey(false); } }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="cards" role="region" aria-label="Key metrics">
        <div className="card">
          <div className="label">Stockouts</div>
          <div className="value">{kpi ? kpi.stockouts : '—'}</div>
        </div>
        <div className="card">
          <div className="label">Total Items (scanned)</div>
          <div className="value">{kpi ? kpi.totalItems : '—'}</div>
        </div>
        <div className="card">
          <div className="label">Threshold</div>
          <div className="value">{kpi ? `≤ ${kpi.threshold}` : '—'}</div>
        </div>
      </div>
      {!loading && Array.isArray(items) && items.length === 0 && (
        <div className="notice">
          <div style={{ marginBottom: 6 }}><strong>No items found</strong></div>
          <div style={{ fontSize: 13 }}>
            Try adjusting filters (Status = All, clear Search/SKU) or confirm items exist in Zoho {service}.
            {health && (
              <div style={{ marginTop: 6 }}>
                Service: <code>{health.service}</code>, DC: <code>{health.dc}</code>, Org: <code>{health.org ?? '(masked)'}</code>
              </div>
            )}
            {kpi && (
              <div style={{ marginTop: 6 }}>
                Note: KPI indicates <strong>{kpi.totalItems}</strong> items scanned with <strong>{kpi.stockouts}</strong> at/below the threshold. If you expect rows here, the backend Items route may be filtering differently than the KPI aggregator.
              </div>
            )}
          </div>
        </div>
      )}
  {diag && debug && (
        <pre style={{ marginTop: 8, background: '#f6f8fa', padding: 8, fontSize: 12, overflow: 'auto' }}>
{JSON.stringify(diag, null, 2)}
        </pre>
      )}
      <div className="toolbar">
        <button className="btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={loading || page <= 1}>
          ‹ Prev
        </button>
        <span style={{ margin: '0 8px' }}>Page {page}</span>
        <button className="btn" onClick={() => setPage((p) => p + 1)} disabled={loading || !hasMore}>
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
      {error && <p className="notice error">{error}</p>}
      {Array.isArray(items) && (
        <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th style={{ cursor: 'pointer' }} onClick={() => setSort((s) => ({ column: 'name', order: s.column === 'name' && s.order === 'A' ? 'D' : 'A' }))}>Name {sort.column === 'name' ? (sort.order === 'A' ? '▲' : '▼') : ''}</th>
              <th style={{ cursor: 'pointer' }} onClick={() => setSort((s) => ({ column: 'sku', order: s.column === 'sku' && s.order === 'A' ? 'D' : 'A' }))}>SKU {sort.column === 'sku' ? (sort.order === 'A' ? '▲' : '▼') : ''}</th>
              <th className="num">Qty</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it: any) => (
              <tr key={it.item_id || it.item_id_string || it.sku} onClick={() => setSelected(it)} style={{ cursor: 'pointer' }}>
                <td>{it.name}</td>
                <td>{it.sku || it.item_code || '-'}</td>
                <td className="num">{(it as any).qty ?? it.stock_on_hand ?? it.available_stock ?? it.quantity ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      {selected && (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) setSelected(null) }}>
          <div className="sheet" role="dialog" aria-modal="true">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700 }}>{selected.name}</div>
              <button className="link" onClick={() => setSelected(null)}>Close</button>
            </div>
            <div style={{ marginTop: 10, fontSize: 14 }}>
              <div><strong>SKU:</strong> {selected.sku || selected.item_code || '-'}</div>
              <div><strong>Qty:</strong> {(selected as any).qty ?? selected.stock_on_hand ?? selected.available_stock ?? selected.quantity ?? '-'}</div>
              {selected.rate != null && <div><strong>Rate:</strong> {selected.rate}</div>}
              {selected.description && <div style={{ marginTop: 6 }}><strong>Description:</strong> {selected.description}</div>}
            </div>
          </div>
        </div>
      )}
      {Array.isArray(items) && items.length > 0 && (
        <div className="toolbar">
          <button className="link" onClick={() => {
            try {
              const rows = items.map((it: any) => ({ name: it.name, sku: (it.sku || it.item_code || ''), qty: ((it as any).qty ?? it.stock_on_hand ?? it.available_stock ?? it.quantity ?? '') }))
              const hdr = ['name','sku','qty']
              const csv = [hdr.join(','), ...rows.map(r => hdr.map(h => (`"${String((r as any)[h] ?? '').replace(/"/g,'""')}"`)).join(','))].join('\n')
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `items_page${page}.csv`
              document.body.appendChild(a)
              a.click()
              a.remove()
              URL.revokeObjectURL(url)
            } catch {}
          }}>Export CSV</button>
        </div>
      )}
      <h2 style={{ marginTop: 24, fontSize: 16, color: 'var(--muted)' }}>Stockouts KPI</h2>
      <div className="controls" style={{ marginTop: 8 }}>
        <label>
          KPI threshold:
          <input type="number" value={kpiThreshold} onChange={(e) => setKpiThreshold(Number(e.target.value || 0))} style={{ width: 80 }} />
        </label>
        <button className="btn" onClick={() => { getStockouts({ threshold: kpiThreshold, per_page: 200, max_pages: 3 }).then((data) => { setKpi(data?.kpi ?? null); setSample(data?.sample ?? null) }).catch(() => {}) }}>Update KPI</button>
      </div>
      {kpi ? (
        <div className="card" style={{ marginTop: 8 }}>
          <div><strong>{kpi.stockouts}</strong> stockouts of <strong>{kpi.totalItems}</strong> items (threshold ≤ {kpi.threshold})</div>
        </div>
      ) : (
        <div className="notice">Loading KPI…</div>
      )}
      {sample && sample.length > 0 && (
        <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>SKU</th>
              <th className="num">Qty</th>
            </tr>
          </thead>
          <tbody>
            {sample.map((it: any, idx: number) => (
              <tr key={it.id || it.sku || idx}>
                <td>{it.name}</td>
                <td>{it.sku || '-'}</td>
                <td className="num">{it.qty ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      <div className="footer">
        <div>Service: {envService} • DC: {envDc.toUpperCase()}</div>
        <div>{buildInfo ? `Build ${buildInfo.slice(0,7)}` : ''}</div>
      </div>
    </div>
  )
}
