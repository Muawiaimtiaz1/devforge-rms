import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, legacyUrl } from '../../api/client'
import './staff-directory.css'

const EMPTY_FORM = {
  name: '', username: '', password: '', email: '', phone: '', status: 'active',
  role_ids: [], can_manage_register: false,
}

function initials(user) {
  return String(user.name || user.username || '?').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

function roleName(user) {
  return user.roles?.map((role) => role.name).join(', ') || String(user.role || 'staff').replaceAll('_', ' ')
}

function Modal({ title, children, onClose, wide = false }) {
  return (
    <div className="staff-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`staff-modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close">×</button></header>
        {children}
      </section>
    </div>
  )
}

function StaffForm({ user, roles, canUpdate, canAssignRole, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    ...user,
    password: '',
    role_ids: user?.roles?.[0]?.id ? [Number(user.roles[0].id)] : (roles[0]?.id ? [Number(roles[0].id)] : []),
    can_manage_register: Boolean(user?.can_manage_register),
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const editing = Boolean(user?.id)

  function set(field, value) { setForm((current) => ({ ...current, [field]: value })) }

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (!form.name.trim() || !form.username.trim()) return setError('Name and username are required.')
    if (!editing && !form.password) return setError('Password is required for a new staff member.')
    if (canAssignRole && !form.role_ids.length) return setError('Please assign a role.')

    const body = {}
    if (canUpdate || !editing) {
      Object.assign(body, {
        name: form.name.trim(), username: form.username.trim(), email: form.email?.trim() || null,
        phone: form.phone?.trim() || null, status: form.status, can_manage_register: form.can_manage_register,
      })
      if (form.password) body.password = form.password
    }
    if (canAssignRole || !editing) body.role_ids = form.role_ids

    try {
      setSaving(true)
      await api(editing ? `/api/users/${user.id}` : '/api/users', {
        method: editing ? 'PUT' : 'POST', body,
      })
      await onSaved()
      onClose()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={editing ? 'Edit staff member' : 'Add staff member'} onClose={onClose}>
      <form className="staff-form" onSubmit={submit}>
        {error && <div className="form-error">{error}</div>}
        <label>Full name<input value={form.name} disabled={editing && !canUpdate} onChange={(e) => set('name', e.target.value)} /></label>
        <label>Username<input value={form.username} disabled={editing && !canUpdate} onChange={(e) => set('username', e.target.value)} /></label>
        <label>{editing ? 'New password (optional)' : 'Password'}<input type="password" value={form.password} disabled={editing && !canUpdate} onChange={(e) => set('password', e.target.value)} /></label>
        <div className="form-grid">
          <label>Email<input type="email" value={form.email || ''} disabled={editing && !canUpdate} onChange={(e) => set('email', e.target.value)} /></label>
          <label>Phone<input value={form.phone || ''} disabled={editing && !canUpdate} onChange={(e) => set('phone', e.target.value)} /></label>
        </div>
        <label>Role<select value={form.role_ids[0] || ''} disabled={editing && !canAssignRole} onChange={(e) => set('role_ids', e.target.value ? [Number(e.target.value)] : [])}>
          <option value="">Select a role</option>
          {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
        </select></label>
        <div className="form-grid">
          <label>Status<select value={form.status || 'active'} disabled={editing && !canUpdate} onChange={(e) => set('status', e.target.value)}><option value="active">Active</option><option value="blocked">Blocked</option></select></label>
          <label className="check-field"><input type="checkbox" checked={form.can_manage_register} disabled={editing && !canUpdate} onChange={(e) => set('can_manage_register', e.target.checked)} /> Can manage register</label>
        </div>
        <footer><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save staff member'}</button></footer>
      </form>
    </Modal>
  )
}

function RoleEditor({ role, permissions, has, onClose, onSaved }) {
  const [name, setName] = useState(role?.name || '')
  const [description, setDescription] = useState(role?.description || '')
  const [selected, setSelected] = useState(role?.permissions || [])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const editing = Boolean(role?.id)
  const canEditDetails = editing ? has('roles.update') : has('roles.create')
  const canAssign = has('roles.assign_permissions')
  const groups = permissions.reduce((result, permission) => {
    result[permission.module] = [...(result[permission.module] || []), permission]
    return result
  }, {})

  function toggle(key) {
    setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])
  }

  async function submit(event) {
    event.preventDefault()
    if (canEditDetails && !name.trim()) return setError('Role name is required.')
    const body = {}
    if (canEditDetails) Object.assign(body, { name: name.trim(), description: description.trim() })
    if (canAssign) body.permissions = selected
    try {
      setSaving(true)
      await api(editing ? `/api/roles/${role.id}` : '/api/roles', { method: editing ? 'PUT' : 'POST', body })
      await onSaved()
      onClose()
    } catch (requestError) { setError(requestError.message) } finally { setSaving(false) }
  }

  return (
    <form className="role-editor" onSubmit={submit}>
      {error && <div className="form-error">{error}</div>}
      <div className="form-grid">
        <label>Role name<input value={name} disabled={!canEditDetails} onChange={(event) => setName(event.target.value)} /></label>
        <label>Description<input value={description} disabled={!canEditDetails} onChange={(event) => setDescription(event.target.value)} /></label>
      </div>
      <div className="permission-groups">
        {Object.entries(groups).map(([module, items]) => <fieldset key={module}><legend>{module.replaceAll('_', ' ')}</legend>{items.map((permission) => <label key={permission.key}><input type="checkbox" checked={selected.includes(permission.key)} disabled={!canAssign} onChange={() => toggle(permission.key)} />{permission.action.replaceAll('_', ' ')}</label>)}</fieldset>)}
      </div>
      <footer><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save role'}</button></footer>
    </form>
  )
}

function RoleManager({ roles, permissions, has, onClose, onChanged }) {
  const [editing, setEditing] = useState(undefined)
  const [error, setError] = useState('')
  const groups = useMemo(() => permissions.reduce((result, permission) => {
    result[permission.module] = [...(result[permission.module] || []), permission]
    return result
  }, {}), [permissions])
  async function remove(role) {
    if (!window.confirm(`Delete the ${role.name} role?`)) return
    try {
      await api(`/api/roles/${role.id}`, { method: 'DELETE' })
      await onChanged()
    } catch (requestError) { setError(requestError.message) }
  }

  if (editing !== undefined) return <Modal title={editing ? `Edit ${editing.name}` : 'Create role'} onClose={() => setEditing(undefined)} wide><RoleEditor role={editing} permissions={permissions} has={has} onClose={() => setEditing(undefined)} onSaved={onChanged} /></Modal>

  return (
    <Modal title="Roles & permissions" onClose={onClose} wide>
      {error && <div className="role-page-error form-error">{error}</div>}
      <div className="role-list">
        {roles.map((role) => (
          <article className="role-card" key={role.id}>
            <div><h3>{role.name}</h3><p>{role.description || 'No description'}</p></div>
            <span>{role.user_count} staff</span>
            <div className="permission-chips">
              {role.permissions?.map((key) => <span key={key} title={groups[key.split('.')[0]]?.find((item) => item.key === key)?.label}>{key}</span>)}
            </div>
            <footer>
              {(has('roles.update') || has('roles.assign_permissions')) && <button className="secondary-button" onClick={() => setEditing(role)}>Manage</button>}
              {has('roles.delete') && !role.is_system && <button className="danger-button" onClick={() => remove(role)}>Delete</button>}
            </footer>
          </article>
        ))}
        {!roles.length && <div className="empty-state">No roles are available for this shop.</div>}
        {has('roles.create') && <button className="primary-button create-role-button" onClick={() => setEditing(null)}>+ Create role</button>}
      </div>
    </Modal>
  )
}

export default function StaffDirectory() {
  const [session, setSession] = useState(null)
  const [staff, setStaff] = useState([])
  const [roles, setRoles] = useState([])
  const [permissionCatalog, setPermissionCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(undefined)
  const [showRoles, setShowRoles] = useState(false)

  const has = useCallback(
    (key) => session?.role === 'superadmin' || session?.permissions?.includes(key),
    [session],
  )

  const loadStaff = useCallback(async () => {
    const [users] = await Promise.all([api('/api/users')])
    setStaff(Array.isArray(users) ? users : [])
  }, [])

  const loadRoles = useCallback(async () => {
    const roleData = await api('/api/roles')
    setRoles(Array.isArray(roleData) ? roleData : [])
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const auth = await api('/api/auth/me')
        const user = auth.user
        const userPermissions = user.permissions || []
        if (user.role !== 'superadmin' && !userPermissions.includes('users.view')) {
          setError('You do not have permission to view the Staff Directory.')
          return
        }
        setSession(user)
        const [users, roleData, catalog] = await Promise.all([
          api('/api/users'),
          user.role === 'superadmin' || userPermissions.includes('roles.view') ? api('/api/roles').catch(() => []) : [],
          user.role === 'superadmin' || userPermissions.includes('roles.view') ? api('/api/roles/catalog').catch(() => []) : [],
        ])
        setStaff(Array.isArray(users) ? users : [])
        setRoles(Array.isArray(roleData) ? roleData : [])
        setPermissionCatalog(Array.isArray(catalog) ? catalog : [])
      } catch (requestError) {
        if (requestError.status === 401) {
          window.location.replace(legacyUrl('/'))
          return
        }
        setError(requestError.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const visibleStaff = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return staff
    return staff.filter((user) => [user.name, user.username, user.email, roleName(user)].some((value) => String(value || '').toLowerCase().includes(needle)))
  }, [query, staff])

  async function remove(user) {
    if (!window.confirm(`Delete ${user.name}? This cannot be undone.`)) return
    try {
      await api(`/api/users/${user.id}`, { method: 'DELETE' })
      await loadStaff()
    } catch (requestError) { setError(requestError.message) }
  }

  if (loading) return <main className="staff-page"><div className="loading-state">Loading Staff Directory…</div></main>

  return (
    <main className="staff-page">
      <nav className="staff-topbar"><a href={legacyUrl('/dashboard#lobby')}>← Shop lobby</a><div><span>{session?.shop_name || 'DevForge RMS'}</span><strong>{session?.name || session?.username}</strong></div></nav>
      <section className="staff-shell">
        <header className="staff-heading">
          <div><p className="section-label">Team management</p><h1>Staff Directory</h1><p>Manage staff accounts, access roles, and register responsibilities.</p></div>
          <div className="heading-actions">
            {has('roles.view') && <button className="secondary-button" onClick={() => setShowRoles(true)}>Roles & permissions</button>}
            {has('users.create') && <button className="primary-button" onClick={() => setEditing(null)}>+ Add staff member</button>}
          </div>
        </header>
        {error && <div className="page-error"><span>{error}</span><button onClick={() => setError('')}>×</button></div>}
        <div className="staff-toolbar"><label><span>Search staff</span><input type="search" value={query} placeholder="Name, username, role…" onChange={(e) => setQuery(e.target.value)} /></label><span>{visibleStaff.length} staff member{visibleStaff.length === 1 ? '' : 's'}</span></div>
        <section className="staff-grid">
          {visibleStaff.map((user) => (
            <article className="staff-card" key={user.id}>
              <div className={`staff-avatar ${user.status === 'blocked' ? 'blocked' : ''}`}>{initials(user)}</div>
              <div className="staff-identity"><h2>{user.name}</h2><p>@{user.username}</p></div>
              <span className="role-badge">{roleName(user)}</span>
              <dl><div><dt>Status</dt><dd className={user.status === 'blocked' ? 'blocked-text' : 'active-text'}>{user.status || 'active'}</dd></div><div><dt>Register</dt><dd>{user.can_manage_register ? 'Allowed' : 'Not allowed'}</dd></div></dl>
              <footer>
                {(has('users.update') || has('users.assign_roles')) && <button className="secondary-button" onClick={() => setEditing(user)}>Manage</button>}
                {has('users.delete') && Number(user.id) !== Number(session?.id) && <button className="danger-button" onClick={() => remove(user)}>Delete</button>}
              </footer>
            </article>
          ))}
          {!visibleStaff.length && <div className="empty-state">No staff members match your search.</div>}
        </section>
      </section>
      {editing !== undefined && <StaffForm user={editing} roles={roles} canUpdate={has('users.update')} canAssignRole={has('users.assign_roles')} onClose={() => setEditing(undefined)} onSaved={loadStaff} />}
      {showRoles && <RoleManager roles={roles} permissions={permissionCatalog} has={has} onClose={() => setShowRoles(false)} onChanged={loadRoles} />}
    </main>
  )
}
