import { useCallback, useEffect, useState } from 'react'
import { api } from '../../../api/client'
import StaffModal from './StaffModal'
import StaffHierarchyTree from './StaffHierarchyTree'
import OrganizationCatalogForm from './OrganizationCatalogForm'

const EMPTY = { departments: [], designations: [], locations: [], classifications: [], managers: [] }
export default function OrganizationStructurePanel({ canUpdate, onClose, onChanged, embedded = false }) {
  const [options, setOptions] = useState(EMPTY); const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const load = useCallback(async () => {
    try {
      const [nextOptions, hierarchy] = await Promise.all([api('/api/staff/organization/options'), api('/api/staff/organization/hierarchy')])
      setOptions(nextOptions); setPeople(hierarchy)
    } catch (requestError) { setError(requestError.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer) }, [load])
  async function created() { await load(); await onChanged?.() }
  async function deactivate(kind, item) {
    if (!window.confirm(`Deactivate ${item.name || item.title}? Existing staff history will be preserved.`)) return
    try { await api(`/api/staff/organization/catalog/${kind}/${item.id}`, { method: 'PATCH', body: { is_active: false } }); await created() } catch (requestError) { setError(requestError.message) }
  }
  const content = <div className="organization-panel">
    {embedded && <header className="embedded-panel-heading"><div><p className="section-label">Structure</p><h2>Organization</h2><p>Departments, positions, work locations, and reporting hierarchy.</p></div></header>}
    {error && <div className="form-error">{error}</div>}{loading ? <p>Loading organization…</p> : <>
      <section><h3>Reporting hierarchy</h3><StaffHierarchyTree people={people} /></section>
      <section className="catalog-summary"><h3>Organization catalogs</h3><dl>{[['departments', options.departments], ['designations', options.designations], ['locations', options.locations], ['classifications', options.classifications]].map(([kind, items]) => <div key={kind}><dt>{kind}</dt><dd>{items.length}</dd>{items.map((item) => <span className="catalog-item" key={item.id}>{item.name || item.title}{canUpdate && <button type="button" aria-label={`Deactivate ${item.name || item.title}`} onClick={() => deactivate(kind, item)}>×</button>}</span>)}</div>)}</dl></section>
      {canUpdate && <OrganizationCatalogForm options={options} onCreated={created} />}
    </>}
    {!embedded && <footer><button className="secondary-button" onClick={onClose}>Close</button></footer>}
  </div>
  return embedded ? content : <StaffModal title="Organization structure" onClose={onClose} wide>{content}</StaffModal>
}
