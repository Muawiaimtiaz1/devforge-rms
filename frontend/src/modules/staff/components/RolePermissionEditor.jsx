import { useMemo, useState } from 'react'
import { api } from '../../../api/client'

export default function RolePermissionEditor({ role, catalog, has, onCancel, onSaved }) {
  const [name, setName] = useState(role?.name || '')
  const [description, setDescription] = useState(role?.description || '')
  const [selected, setSelected] = useState(role?.permissions || [])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const editing = Boolean(role?.id)
  const canEditDetails = editing ? has('roles.update') : has('roles.create')
  const canAssign = has('roles.assign_permissions')
  const groups = useMemo(() => catalog.reduce((result, permission) => {
    result[permission.module] = [...(result[permission.module] || []), permission]
    return result
  }, {}), [catalog])

  function toggle(key) {
    setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])
  }
  async function submit(event) {
    event.preventDefault()
    setError('')
    if (canEditDetails && !name.trim()) return setError('Role name is required.')
    const body = {}
    if (canEditDetails) Object.assign(body, { name: name.trim(), description: description.trim() })
    if (canAssign) body.permissions = selected
    try {
      setSaving(true)
      await api(editing ? `/api/roles/${role.id}` : '/api/roles', { method: editing ? 'PUT' : 'POST', body })
      await onSaved()
      onCancel()
    } catch (requestError) { setError(requestError.message) } finally { setSaving(false) }
  }

  return <form className="role-editor" onSubmit={submit}>{error && <div className="form-error">{error}</div>}<div className="form-grid"><label>Role name<input value={name} disabled={!canEditDetails} onChange={(event) => setName(event.target.value)} /></label><label>Description<input value={description} disabled={!canEditDetails} onChange={(event) => setDescription(event.target.value)} /></label></div><div className="permission-groups">{Object.entries(groups).map(([module, items]) => <fieldset key={module}><legend>{module.replaceAll('_', ' ')}</legend>{items.map((permission) => <label key={permission.key}><input type="checkbox" checked={selected.includes(permission.key)} disabled={!canAssign} onChange={() => toggle(permission.key)} />{permission.action.replaceAll('_', ' ')}</label>)}</fieldset>)}</div><footer><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save role'}</button></footer></form>
}
