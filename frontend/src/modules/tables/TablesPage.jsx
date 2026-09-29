import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, legacyUrl } from '../../api/client'
import { AnalyticsTopbar } from '../analytics/AnalyticsTopbar'
import '../analytics/analytics.generated.css'
import './tables.css'

function Modal({ title, children, onClose, wide = false }) {
  useEffect(() => {
    const close = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])
  return <div className="tables-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className={'tables-modal ' + (wide ? 'wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
      <header><h3>{title}</h3><button type="button" onClick={onClose} aria-label="Close">×</button></header>
      <div className="tables-modal-body">{children}</div>
    </section>
  </div>
}

function TableForm({ table, floors, onSave, onClose }) {
  const [floorId, setFloorId] = useState(table?.floor_id || '')
  const [number, setNumber] = useState(table?.table_number || '')
  const [capacity, setCapacity] = useState(table?.capacity || 4)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    if (!number.trim()) return setError('Table number/name is required')
    if (!Number.isInteger(Number(capacity)) || Number(capacity) < 1) return setError('Capacity must be at least 1')
    try {
      setSaving(true); setError('')
      await onSave({ table_number: number.trim(), capacity: Number(capacity), floor_id: floorId ? Number(floorId) : null })
    } catch (requestError) { setError(requestError.message) } finally { setSaving(false) }
  }
  return <form className="tables-form" onSubmit={submit}>
    {error && <div className="tables-error">{error}</div>}
    <label>Floor<select value={floorId} onChange={event => setFloorId(event.target.value)}><option value="">-- No Floor --</option>{floors.map(floor => <option key={floor.id} value={floor.id}>{floor.name}</option>)}</select></label>
    <label>Table Number / Name<input value={number} onChange={event => setNumber(event.target.value)} placeholder="e.g. T5, VIP-1, Terrace-2" /></label>
    <label>Capacity (guests)<input type="number" min="1" value={capacity} onChange={event => setCapacity(event.target.value)} /></label>
    <div className="tables-form-actions"><button type="button" onClick={onClose}>Cancel</button><button className={table ? 'sky' : 'green'} disabled={saving}>{saving ? 'Saving…' : table ? 'Save Changes' : 'Add Table'}</button></div>
  </form>
}

function FloorForm({ onSave }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    if (!name.trim()) return setError('Floor name is required')
    try { setSaving(true); setError(''); await onSave(name.trim()) } catch (requestError) { setError(requestError.message) } finally { setSaving(false) }
  }
  return <form className="tables-form" onSubmit={submit}>{error && <div className="tables-error">{error}</div>}<label>Floor Name<input value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Ground Floor, Rooftop" /></label><button className="indigo" disabled={saving}>{saving ? 'Creating…' : 'Create Floor'}</button></form>
}

function AccessForm({ tables, config, onMode, onAssign }) {
  const [mode, setMode] = useState(config.mode || 'all')
  const [error, setError] = useState('')
  async function saveMode() {
    try { setError(''); await onMode(mode) } catch (requestError) { setError(requestError.message) }
  }
  async function assign(tableId, value) {
    try { setError(''); await onAssign(tableId, value ? Number(value) : null) } catch (requestError) { setError(requestError.message) }
  }
  return <div className="tables-access">
    {error && <div className="tables-error">{error}</div>}
    <section><h4>Who can see dine-in tables?</h4>
      <label><input type="radio" name="table-access-mode" value="all" checked={mode === 'all'} onChange={() => setMode('all')} /><span><b>All tables</b><small>Every waiter / order taker can see every table.</small></span></label>
      <label><input type="radio" name="table-access-mode" value="assigned" checked={mode === 'assigned'} onChange={() => setMode('assigned')} /><span><b>Assigned tables only</b><small>Each waiter / order taker sees only assigned tables. Receptionists always see all tables.</small></span></label>
      <button onClick={saveMode}>Save visibility</button>
    </section>
    <div><h4>Table assignments</h4><div className="tables-assignment-list">{tables.map(table => <label key={table.id}><b>{table.table_number}</b><select value={table.assigned_waiter_id || ''} onChange={event => assign(table.id, event.target.value)}><option value="">Unassigned</option>{(config.order_takers || []).map(user => <option value={user.id} key={user.id}>{user.name || user.username} ({user.role})</option>)}</select></label>)}</div></div>
  </div>
}

export default function TablesPage() {
  const [session, setSession] = useState(null)
  const [authError, setAuthError] = useState('')
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [tables, setTables] = useState([])
  const [floors, setFloors] = useState([])
  const [access, setAccess] = useState({ mode: 'all', order_takers: [] })
  const [floorFilter, setFloorFilter] = useState('')
  const [view, setView] = useState('tables')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null)
  const [toast, setToast] = useState(null)
  const has = useCallback(action => session?.role === 'superadmin' || session?.permissions?.includes('tables.' + action) || session?.permissions?.includes('tables.manage'), [session])
  const canManage = has('manage')

  useEffect(() => {
    document.title = 'Table Management — DevForge RMS'
    api('/api/auth/me').then(({ user }) => {
      if (user.role !== 'superadmin' && !user.permissions?.includes('tables.view')) throw new Error('You do not have permission to view Table Management.')
      setSession(user)
    }).catch(requestError => {
      if (requestError.status === 401) window.location.replace(legacyUrl('/'))
      else setAuthError(requestError.message)
    }).finally(() => setLoadingAuth(false))
  }, [])

  const load = useCallback(async () => {
    if (!session) return
    try {
      setLoading(true); setError('')
      const requests = [api('/api/tables'), api('/api/tables/floors')]
      if (canManage) requests.push(api('/api/tables/access-config'))
      const result = await Promise.all(requests)
      setTables(result[0] || [])
      setFloors(result[1] || [])
      if (result[2]) setAccess(result[2])
    } catch (requestError) { setError(requestError.message) } finally { setLoading(false) }
  }, [session, canManage])

  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer) }, [load])

  const notify = useCallback((message, type = 'success') => {
    setToast({ message, type })
    window.setTimeout(() => setToast(null), 3500)
  }, [])

  async function mutate(path, options, message, close = true) {
    await api(path, options)
    if (close) setModal(null)
    notify(message)
    await load()
  }

  async function saveTable(payload, table = null) {
    if (table) await mutate('/api/tables/' + table.id + '/status', { method: 'PATCH', body: { action: 'update', ...payload } }, 'Table updated')
    else await mutate('/api/tables', { method: 'POST', body: payload }, 'Table added!')
  }

  async function setStatus(table, status) {
    try { await mutate('/api/tables/' + table.id + '/status', { method: 'PATCH', body: { status } }, 'Table marked as ' + status + '!') } catch (requestError) { notify(requestError.message, 'error') }
  }

  async function deleteTable(table) {
    if (!window.confirm('Delete table ' + table.table_number + '? This cannot be undone.')) return
    try { await mutate('/api/tables/' + table.id + '/status', { method: 'PATCH', body: { action: 'delete' } }, 'Table deleted') } catch (requestError) { notify(requestError.message, 'error') }
  }

  async function addFloor(name) { await mutate('/api/tables/floors', { method: 'POST', body: { name } }, 'Floor created!') }
  async function deleteFloor(floor) {
    if (!window.confirm("Are you sure you want to delete this floor? Tables assigned to it will remain but won't have a floor.")) return
    try { await mutate('/api/tables/floors/' + floor.id, { method: 'DELETE' }, 'Floor deleted', false) } catch (requestError) { notify(requestError.message, 'error') }
  }
  async function saveMode(mode) {
    await api('/api/tables/access-config', { method: 'PATCH', body: { mode } })
    setAccess(current => ({ ...current, mode }))
    notify(mode === 'assigned' ? 'Waiters will see only their assigned tables' : 'Waiters will see all tables')
  }
  async function assign(tableId, waiterId) {
    await api('/api/tables/' + tableId + '/assignment', { method: 'PATCH', body: { waiter_id: waiterId } })
    setTables(current => current.map(table => Number(table.id) === Number(tableId) ? { ...table, assigned_waiter_id: waiterId } : table))
    notify(waiterId ? 'Table assigned' : 'Table unassigned')
  }

  const filtered = useMemo(() => floorFilter ? tables.filter(table => Number(table.floor_id) === Number(floorFilter)) : tables, [tables, floorFilter])
  const readOnly = !has('manage') && !has('create') && !has('update') && !has('delete')
  const available = filtered.filter(table => table.status === 'available').length
  const occupied = filtered.filter(table => table.status === 'occupied').length

  if (loadingAuth) return <main className="tables-state"><h1>Loading tables…</h1></main>
  if (authError) return <main className="tables-state"><h1>Tables unavailable</h1><p>{authError}</p><a href="/app/lobby">Back to modules</a></main>

  return <div className="analytics-page tables-page"><AnalyticsTopbar user={session} /><main className="tables-shell">
    {error && <div className="tables-error"><span>{error}</span><button onClick={load}>Retry</button></div>}
    {view === 'tables' ? <><header className="tables-header"><div className="tables-title"><div>🪑</div><span><h3>Floor Plan</h3><p>{available} available, {occupied} occupied</p></span></div><div className="tables-tools">
      <label className="floor-filter"><span>⌂</span><select value={floorFilter} onChange={event => setFloorFilter(event.target.value)}><option value="">All Floors</option>{floors.map(floor => <option value={floor.id} key={floor.id}>{floor.name}</option>)}</select></label>
      {!readOnly && <div className="tables-buttons">{canManage && <button className="neutral" onClick={() => setView('floors')}>🏢 Floors</button>}{canManage && <button className="violet" onClick={() => setModal({ kind: 'access' })}>Table Access</button>}{has('create') && <button className="green" onClick={() => setModal({ kind: 'add' })}>＋ Add Table</button>}</div>}
    </div></header>
    <div className="tables-legend"><span><i className="available" />Available</span><span><i className="occupied" />Occupied</span><span><i className="reserved" />Reserved</span></div>
    <section className="tables-grid">{filtered.length ? filtered.map(table => <button className={'table-card ' + (table.status || 'unknown')} key={table.id} onClick={() => setModal({ kind: 'actions', table })}><i /><b>🪑</b><strong>{table.table_number}</strong><span>Cap: {table.capacity} guests</span>{table.assigned_waiter_id && <em>{table.assigned_waiter_name || table.assigned_waiter_username || 'Assigned'}</em>}<small>{table.status}</small></button>) : <div className="tables-empty"><b>🪑</b><p>{loading ? 'Loading tables…' : 'No tables found in this section'}</p>{has('create') && !loading && <button onClick={() => setModal({ kind: 'add' })}>Add New Table</button>}</div>}</section></>
      : <><header className="tables-header"><div className="tables-title"><div className="indigo">🏢</div><span><h3>Floor Management</h3><p>{floors.length} floors configured</p></span></div><div className="tables-buttons"><button className="neutral" onClick={() => setView('tables')}>Back to Tables</button><button className="indigo" onClick={() => setModal({ kind: 'floor' })}>＋ Add Floor</button></div></header><section className="floors-grid">{floors.length ? floors.map(floor => <article key={floor.id}><span>🏢 <b>{floor.name}</b></span><button onClick={() => deleteFloor(floor)} aria-label={'Delete ' + floor.name}>⌫</button></article>) : <div className="tables-empty"><p>No floors configured yet</p></div>}</section></>}
  </main>
  {modal?.kind === 'add' && <Modal title="Add New Table" onClose={() => setModal(null)}><TableForm floors={floors} onClose={() => setModal(null)} onSave={payload => saveTable(payload)} /></Modal>}
  {modal?.kind === 'edit' && <Modal title="Edit Table" onClose={() => setModal(null)}><TableForm table={modal.table} floors={floors} onClose={() => setModal(null)} onSave={payload => saveTable(payload, modal.table)} /></Modal>}
  {modal?.kind === 'floor' && <Modal title="Add New Floor" onClose={() => setModal(null)}><FloorForm onSave={addFloor} /></Modal>}
  {modal?.kind === 'access' && <Modal wide title="Waiter Table Access" onClose={() => setModal(null)}><AccessForm tables={tables} config={access} onMode={saveMode} onAssign={assign} /></Modal>}
  {modal?.kind === 'actions' && <Modal title={'Table ' + modal.table.table_number} onClose={() => setModal(null)}><div className="table-actions"><p>Current status: <b className={modal.table.status}>{String(modal.table.status).toUpperCase()}</b></p>{has('update') && <button className="sky" onClick={() => setModal({ kind: 'edit', table: modal.table })}>Edit Table</button>}{has('delete') && <button className="rose" onClick={() => deleteTable(modal.table)}>Delete Table</button>}{canManage && <><button className="green" onClick={() => setStatus(modal.table, 'available')}>✅ Mark Available</button><button className="red" onClick={() => setStatus(modal.table, 'occupied')}>🔴 Mark Occupied</button><button className="amber" onClick={() => setStatus(modal.table, 'reserved')}>🟡 Mark Reserved</button></>}<button className="indigo" onClick={() => window.location.assign(legacyUrl('/dashboard#pos'))}>🍽️ New Order for this Table</button></div></Modal>}
  {toast && <div className={'tables-toast ' + toast.type}><span>{toast.message}</span><button onClick={() => setToast(null)}>×</button></div>}
  </div>
}
