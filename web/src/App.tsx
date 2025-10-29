import React from 'react'
import Sparkline from './components/Sparkline'
import { listItems, getStockouts, getHealth, getReorderRisk, getInventoryValue, getTrends, type ItemQuery } from './lib/api'

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
  const [stockoutsOnly, setStockoutsOnly] = React.useState<boolean>(false)
  const [kpiReorder, setKpiReorder] = React.useState<{ belowReorder: number; totalWithReorder: number; missingReorder: number } | null>(null)
  const [kpiInv, setKpiInv] = React.useState<{ totalValue: number; currency: string | null; itemsWithCost: number; itemsMissingCost: number } | null>(null)
  const [panel, setPanel] = React.useState<'reorder' | 'inv' | null>(null)
  const [panelLoading, setPanelLoading] = React.useState<boolean>(false)
  const [panelItems, setPanelItems] = React.useState<any[] | null>(null)
  const [panelSort, setPanelSort] = React.useState<{ column?: string; order?: 'A'|'D' }>({})
  const [debouncing, setDebouncing] = React.useState<boolean>(false)
  const [views, setViews] = React.useState<Record<string, any>>(() => {
    try { return JSON.parse(localStorage.getItem('views') || '{}') } catch { return {} }
  })
  const [viewName, setViewName] = React.useState<string>('')
  const [columns, setColumns] = React.useState<{ rate: boolean; cost: boolean; value: boolean }>(() => {
    try { return JSON.parse(localStorage.getItem('columns') || '{"rate":false,"cost":true,"value":true}') } catch { return { rate: false, cost: true, value: true } }
  })
  const [trends, setTrends] = React.useState<{ stockouts: Array<{ date: string; value: number }>; inventoryValue: Array<{ date: string; value: number }>; currency?: string } | null>(null)

  const openReorder = async () => {
    setPanel('reorder'); setPanelItems(null); setPanelLoading(true); setPanelSort({});
    try {
      const data = await getReorderRisk({ include: 'items', per_page: 200, max_pages: 5, limit: 1000 })
      setPanelItems(Array.isArray(data?.items) ? data.items : [])
    } catch {}
    finally { setPanelLoading(false) }
  }
  const openInv = async () => {
    setPanel('inv'); setPanelItems(null); setPanelLoading(true); setPanelSort({});
    try {
      const data = await getInventoryValue({ include: 'items', per_page: 200, max_pages: 5, limit: 1000 })
      setPanelItems(Array.isArray(data?.items) ? data.items : [])
    } catch {}
    finally { setPanelLoading(false) }
  }

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
  if (stockoutsOnly) (params as any).qty_lte = 0
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
      const data = await getStockouts({ threshold: 0, per_page: 200, max_pages: 3, service, debug })
      setKpi(data?.kpi ?? null)
      setSample(data?.sample ?? null)
    } catch (e: any) {
      // keep errors non-fatal; display inline
      console.warn('KPI load failed:', e?.message)
    }
  }
  const loadReorder = async () => {
    try {
      const data = await getReorderRisk({ per_page: 200, max_pages: 3 })
      setKpiReorder(data?.kpi ?? null)
    } catch (e: any) {
      console.warn('Reorder KPI load failed:', e?.message)
    }
  }
  const loadInvValue = async () => {
    try {
      const data = await getInventoryValue({ per_page: 200, max_pages: 3 })
      setKpiInv(data?.kpi ?? null)
    } catch (e: any) {
      console.warn('Inventory value KPI load failed:', e?.message)
    }
  }

  React.useEffect(() => {
    load()
    loadKpi()
    loadReorder()
    loadInvValue()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, perPage, service, sort.column, sort.order, stockoutsOnly])

  // Debounce search and SKU changes to auto-apply filters
  React.useEffect(() => {
    setDebouncing(true)
    const t = setTimeout(async () => {
      setPage(1)
      await load()
      setDebouncing(false)
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, sku])

  const loadHealth = async () => {
    try { const h = await getHealth(); setHealth(h) } catch { /* ignore */ }
  }
  React.useEffect(() => { loadHealth() }, [])

  const loadTrends = async () => {
    try { const t = await getTrends(); setTrends(t) } catch { /* ignore */ }
  }
  React.useEffect(() => { loadTrends() }, [])

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
        if (typeof f.stockoutsOnly === 'boolean') setStockoutsOnly(f.stockoutsOnly)
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist filters when they change
  React.useEffect(() => {
    try {
      const f = { service, status, page, perPage, search, sku, sort, kpiThreshold, stockoutsOnly }
      localStorage.setItem('filters', JSON.stringify(f))
      localStorage.setItem('columns', JSON.stringify(columns))
    } catch { /* ignore */ }
  }, [service, status, page, perPage, search, sku, sort.column, sort.order, kpiThreshold, stockoutsOnly, columns])

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
  const fmtMoney = (n: number | null | undefined, currency?: string | null) => {
    if (typeof n !== 'number') return '—'
    const c = currency || 'CRC'
    try {
      return n.toLocaleString(undefined, { style: 'currency', currency: c, maximumFractionDigits: 0 })
    } catch {
      return n.toFixed(0)
    }
  }

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
      {(loading || debouncing || panelLoading) && <div className="topbar"><div className="bar" /></div>}
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
          {debouncing && <span className="spinner" aria-label="Refreshing" title="Refreshing"></span>}
        </label>
        <label>
          SKU:
          <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="exact SKU" />
          {debouncing && <span className="spinner" aria-label="Refreshing" title="Refreshing"></span>}
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
        <label title="Show only items with Qty ≤ 0">
          <input type="checkbox" checked={stockoutsOnly} onChange={(e) => { setStockoutsOnly(e.target.checked); setPage(1); }} /> Stockouts only
        </label>
        <button className="btn" onClick={() => { setPage(1); load() }} disabled={loading}>
          {loading ? 'Loading…' : 'Apply'}
        </button>
        <button className="link" onClick={resetFilters} title="Clear filters and show defaults">Reset filters</button>
        <details>
          <summary style={{ cursor: 'pointer' }}>Columns</summary>
          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <label><input type="checkbox" checked={columns.rate} onChange={(e) => setColumns(c => ({ ...c, rate: e.target.checked }))} /> Rate (main)</label>
            <label><input type="checkbox" checked={columns.cost} onChange={(e) => setColumns(c => ({ ...c, cost: e.target.checked }))} /> Cost (inv)</label>
            <label><input type="checkbox" checked={columns.value} onChange={(e) => setColumns(c => ({ ...c, value: e.target.checked }))} /> Value (inv)</label>
          </div>
        </details>
        <details>
          <summary style={{ cursor: 'pointer' }}>Saved views</summary>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
            <select value="" onChange={(e) => {
              const name = e.target.value; if (!name) return;
              const v = (views as any)[name]; if (!v) return;
              // Apply filters from view
              if (v.service) setService(v.service)
              if (v.status) setStatus(v.status)
              if (typeof v.perPage === 'number') setPerPage(v.perPage)
              if (typeof v.search === 'string') setSearch(v.search)
              if (typeof v.sku === 'string') setSku(v.sku)
              if (v.sort) setSort(v.sort)
              if (typeof v.kpiThreshold === 'number') setKpiThreshold(v.kpiThreshold)
              if (typeof v.stockoutsOnly === 'boolean') setStockoutsOnly(v.stockoutsOnly)
              setPage(1); load()
            }}>
              <option value="">(select a view)</option>
              {Object.keys(views).map(n => (<option key={n} value={n}>{n}</option>))}
            </select>
            <input placeholder="View name" value={viewName} onChange={(e) => setViewName(e.target.value)} />
            <button className="link" onClick={() => {
              const name = viewName.trim(); if (!name) return;
              const v = { service, status, perPage, search, sku, sort, kpiThreshold, stockoutsOnly }
              const next = { ...views, [name]: v } as any
              setViews(next)
              try { localStorage.setItem('views', JSON.stringify(next)) } catch {}
            }}>Save</button>
            <button className="link" onClick={() => {
              const name = viewName.trim(); if (!name) return;
              const next = { ...views } as any; delete next[name]; setViews(next)
              try { localStorage.setItem('views', JSON.stringify(next)) } catch {}
            }}>Delete</button>
          </div>
        </details>
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
          {trends && trends.stockouts?.length > 1 && (
            <div style={{ marginTop: 6 }}>
              <Sparkline data={trends.stockouts.slice(-20)} width={140} height={28} ariaLabel="Stockouts trend" />
            </div>
          )}
        </div>
        <div className="card">
          <div className="label">Total Items (scanned)</div>
          <div className="value">{kpi ? kpi.totalItems : '—'}</div>
        </div>
        <div className="card">
          <div className="label">Threshold</div>
          <div className="value">{kpi ? `≤ ${kpi.threshold}` : '—'}</div>
        </div>
        <div className="card clickable" title="View items below reorder level" role="button" tabIndex={0}
          onClick={openReorder}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openReorder(); } }}>
          <div className="label">Below Reorder Level</div>
          <div className="value">{kpiReorder ? kpiReorder.belowReorder : '—'}</div>
          <div className="card-actions"><button className="link small" onClick={(e) => { e.stopPropagation(); openReorder(); }}>View details ›</button></div>
          {kpiReorder && kpiReorder.missingReorder > 0 && (
            <div className="card-actions"><span className="badge warn" title="Items without reorder level configured">{kpiReorder.missingReorder} missing reorder</span></div>
          )}
        </div>
        <div className="card clickable" title="View inventory value by item" role="button" tabIndex={0}
          onClick={openInv}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openInv(); } }}>
          <div className="label">Inventory Value (On Hand)</div>
          <div className="value">{kpiInv ? fmtMoney(kpiInv.totalValue, kpiInv.currency || undefined) : '—'}</div>
          <div className="card-actions"><button className="link small" onClick={(e) => { e.stopPropagation(); openInv(); }}>View details ›</button></div>
          {kpiInv && kpiInv.itemsMissingCost > 0 && (
            <div className="card-actions"><span className="badge warn" title="Items missing cost; value excludes these">{kpiInv.itemsMissingCost} missing cost</span></div>
          )}
          {trends && trends.inventoryValue?.length > 1 && (
            <div style={{ marginTop: 6 }}>
              <Sparkline data={trends.inventoryValue.slice(-20)} width={140} height={28} ariaLabel="Inventory value trend" />
            </div>
          )}
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
        <>
        <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 12 }}>Tip: Click a row or use the “View” action to see item details.</div>
        <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th style={{ cursor: 'pointer' }} onClick={() => setSort((s) => ({ column: 'name', order: s.column === 'name' && s.order === 'A' ? 'D' : 'A' }))}>Name {sort.column === 'name' ? (sort.order === 'A' ? '▲' : '▼') : ''}</th>
              <th style={{ cursor: 'pointer' }} onClick={() => setSort((s) => ({ column: 'sku', order: s.column === 'sku' && s.order === 'A' ? 'D' : 'A' }))}>SKU {sort.column === 'sku' ? (sort.order === 'A' ? '▲' : '▼') : ''}</th>
              {columns.rate && <th className="num">Rate</th>}
              <th className="num">Qty</th>
              <th className="num">Details</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it: any) => (
              <tr key={it.item_id || it.item_id_string || it.sku} className="clickable-row" onClick={() => setSelected(it)} tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(it) } }}>
                <td>{it.name}</td>
                <td>{it.sku || it.item_code || '-'}</td>
                {columns.rate && <td className="num">{typeof it.rate === 'number' ? fmtMoney(it.rate, kpiInv?.currency || undefined) : '-'}</td>}
                <td className="num">{(it as any).qty ?? it.stock_on_hand ?? it.available_stock ?? it.quantity ?? '-'}</td>
                <td className="num actions">
                  <button className="link small" aria-label={`View details for ${it.name}`} onClick={(e) => { e.stopPropagation(); setSelected(it) }}>View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {/* Current page totals */}
        <div className="toolbar">
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>Page total Qty: <strong>{items.reduce((s: number, it: any) => s + (Number(((it as any).qty ?? it.stock_on_hand ?? it.available_stock ?? it.quantity) || 0) || 0), 0).toLocaleString()}</strong></span>
        </div>
        </>
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
  <button className="btn" onClick={() => { getStockouts({ threshold: kpiThreshold, per_page: 200, max_pages: 3, service, debug }).then((data) => { setKpi(data?.kpi ?? null); setSample(data?.sample ?? null) }).catch(() => {}) }}>Update KPI</button>
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

      {panel && (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) { setPanel(null); setPanelItems(null); } }}>
          <div className="sheet" role="dialog" aria-modal="true">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700 }}>{panel === 'reorder' ? 'Items Below Reorder Level' : 'Inventory Value by Item'}</div>
              <button className="link" onClick={() => { setPanel(null); setPanelItems(null); }}>Close</button>
            </div>
            {panelLoading ? (
              <div style={{ marginTop: 12 }}>Loading…</div>
            ) : Array.isArray(panelItems) ? (
              panelItems.length > 0 ? (
                <>
                  <div className="toolbar" style={{ marginTop: 8 }}>
                    <button className="link" onClick={() => {
                      try {
                        const hdr = panel === 'reorder' ? ['name','sku','qty','reorder_level','variance'] : ['name','sku','qty','cost','value']
                        const csv = [hdr.join(','), ...panelItems.map((r: any) => hdr.map(h => (`"${String((r as any)[h] ?? '').replace(/"/g,'""')}"`)).join(','))].join('\n')
                        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = panel === 'reorder' ? 'reorder-risk.csv' : 'inventory-value.csv'
                        document.body.appendChild(a)
                        a.click()
                        a.remove()
                        URL.revokeObjectURL(url)
                      } catch {}
                    }}>Export CSV</button>
                  </div>
                  <div className="tablewrap">
                    <table>
                      <thead>
                        <tr>
                          <th style={{ cursor: 'pointer' }} onClick={() => setPanelSort((s) => ({ column: 'name', order: s.column === 'name' && s.order === 'A' ? 'D' : 'A' }))}>Name {panelSort.column === 'name' ? (panelSort.order === 'A' ? '▲' : '▼') : ''}</th>
                          <th>SKU</th>
                          <th className="num" style={{ cursor: 'pointer' }} onClick={() => setPanelSort((s) => ({ column: 'qty', order: s.column === 'qty' && s.order === 'A' ? 'D' : 'A' }))}>Qty {panelSort.column === 'qty' ? (panelSort.order === 'A' ? '▲' : '▼') : ''}</th>
                          {panel === 'reorder' ? (
                            <>
                              <th className="num" style={{ cursor: 'pointer' }} onClick={() => setPanelSort((s) => ({ column: 'reorder_level', order: s.column === 'reorder_level' && s.order === 'A' ? 'D' : 'A' }))}>Reorder {panelSort.column === 'reorder_level' ? (panelSort.order === 'A' ? '▲' : '▼') : ''}</th>
                              <th className="num" style={{ cursor: 'pointer' }} onClick={() => setPanelSort((s) => ({ column: 'variance', order: s.column === 'variance' && s.order === 'A' ? 'D' : 'A' }))}>Variance {panelSort.column === 'variance' ? (panelSort.order === 'A' ? '▲' : '▼') : ''}</th>
                            </>
                          ) : (
                            <>
                              <th className="num" style={{ cursor: 'pointer' }} onClick={() => setPanelSort((s) => ({ column: 'cost', order: s.column === 'cost' && s.order === 'A' ? 'D' : 'A' }))}>Cost {panelSort.column === 'cost' ? (panelSort.order === 'A' ? '▲' : '▼') : ''}</th>
                              <th className="num" style={{ cursor: 'pointer' }} onClick={() => setPanelSort((s) => ({ column: 'value', order: s.column === 'value' && s.order === 'A' ? 'D' : 'A' }))}>Value {panelSort.column === 'value' ? (panelSort.order === 'A' ? '▲' : '▼') : ''}</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {(panelItems ? [...panelItems] : []).sort((a: any, b: any) => {
                          const col = panelSort.column
                          if (!col) return 0
                          const av = (a as any)[col]
                          const bv = (b as any)[col]
                          const na = typeof av === 'number' ? av : String(av || '').toLowerCase()
                          const nb = typeof bv === 'number' ? bv : String(bv || '').toLowerCase()
                          const cmp = (typeof na === 'number' && typeof nb === 'number') ? (na - nb) : (na < nb ? -1 : na > nb ? 1 : 0)
                          return panelSort.order === 'D' ? -cmp : cmp
                        }).map((it: any, idx: number) => (
                          <tr key={it.id || it.sku || idx}>
                            <td>{it.name}</td>
                            <td>{it.sku || '-'}</td>
                            <td className="num">{it.qty ?? '-'}</td>
                            {panel === 'reorder' ? (
                              <>
                                <td className="num">{it.reorder_level ?? '-'}</td>
                                <td className="num">{it.variance ?? '-'}</td>
                              </>
                            ) : (
                              <>
                                <td className="num">{typeof it.cost === 'number' ? fmtMoney(it.cost, kpiInv?.currency || undefined) : '-'}</td>
                                <td className="num">{typeof it.value === 'number' ? fmtMoney(it.value, kpiInv?.currency || undefined) : '-'}</td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {panel === 'inv' && (
                    <div className="toolbar"><span style={{ color: 'var(--muted)', fontSize: 12 }}>Top {panelItems.length} total value: <strong>{fmtMoney(panelItems.reduce((s: number, it: any) => s + (Number(it.value || 0) || 0), 0), kpiInv?.currency || undefined)}</strong></span></div>
                  )}
                </>
              ) : (
                <div style={{ marginTop: 12, color: 'var(--muted)' }}>No data available.</div>
              )
            ) : (
              <div style={{ marginTop: 12, color: 'var(--muted)' }}>No data.</div>
            )}
          </div>
        </div>
      )}

      <div className="footer">
        <div>Service: {envService} • DC: {envDc.toUpperCase()}</div>
        <div>{buildInfo ? `Build ${buildInfo.slice(0,7)}` : ''}</div>
      </div>
    </div>
  )
}
