import { useEffect, useMemo, useState } from 'react'
import { api } from '../../../api/client'
import RolePermissionEditor from './RolePermissionEditor'
import StaffModal from './StaffModal'

async function fetchRoleBundle() {
  const [roles, catalog] = await Promise.all([api('/api/roles'), api('/api/roles/catalog')])
  return { roles: Array.isArray(roles) ? roles : [], catalog: Array.isArray(catalog) ? catalog : [] }
}

export default function RoleManagementPanel({ has, onClose, embedded = false }) {
  const [roles, setRoles] = useState([])
  const [catalog, setCatalog] = useState([])
  const [editing, setEditing] = useState(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const catalogByKey = useMemo(() => new Map(catalog.map((permission) => [permission.key, permission])), [catalog])

  async function reload() {
    const bundle = await fetchRoleBundle()
    setRoles(bundle.roles)
    setCatalog(bundle.catalog)
  }
  useEffect(() => {
    let cancelled = false
    fetchRoleBundle().then((bundle) => {
      if (cancelled) return
      setRoles(bundle.roles)
      setCatalog(bundle.catalog)
    }).catch((requestError) => { if (!cancelled) setError(requestError.message) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  async function remove(role) {
    if (!window.confirm(`Delete the ${role.name} role? Assigned staff must be moved first.`)) return
    try { await api(`/api/roles/${role.id}`, { method: 'DELETE' }); await reload() } catch (requestError) { setError(requestError.message) }
  }

  const content = <div className="role-workspace">
    {embedded && <header className="embedded-panel-heading"><div><p className="section-label">Access control</p><h2>Roles & permissions</h2><p>Define reusable roles and server-enforced capabilities.</p></div></header>}
    {error && <div className="form-error">{error}</div>}
    {editing !== undefined ? <RolePermissionEditor role={editing} catalog={catalog} has={has} onCancel={() => setEditing(undefined)} onSaved={reload} /> : <>
      <header><div><p>Define reusable restaurant roles and review every permission before assignment.</p></div>{has('roles.create') && <button className="primary-button" onClick={() => setEditing(null)}>+ Create role</button>}</header>
      {loading && <div className="access-empty">Loading roles…</div>}
      <div className="role-list">{roles.map((role) => <article className="role-card" key={role.id}><div><h3>{role.name}</h3><p>{role.description || 'No description'}</p></div><span>{role.user_count} staff</span><div className="permission-chips">{role.permissions?.map((key) => <span key={key} title={catalogByKey.get(key)?.label}>{key}</span>)}</div><footer>{(has('roles.update') || has('roles.assign_permissions')) && <button className="secondary-button" onClick={() => setEditing(role)}>Manage</button>}{has('roles.delete') && !role.is_system && <button className="danger-button" onClick={() => remove(role)}>Delete</button>}</footer></article>)}{!loading && !roles.length && <div className="empty-state">No roles are available for this restaurant.</div>}</div>
    </>}
  </div>
  return embedded ? content : <StaffModal title="Roles & permissions" onClose={onClose} wide>{content}</StaffModal>
}
