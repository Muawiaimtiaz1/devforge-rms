import { useEffect, useMemo, useState } from 'react'
import { api } from '../../../api/client'
import StaffModal from './StaffModal'

async function fetchAccessBundle(profileId) {
  const [accessData, roleData, accountData] = await Promise.all([
    api(`/api/staff/${profileId}/access`),
    api('/api/roles').catch(() => []),
    api(`/api/staff/options/accounts?profile_id=${profileId}`).catch(() => []),
  ])
  return { accessData, roleData, accountData }
}

function PermissionSummary({ permissions }) {
  const groups = useMemo(() => permissions.reduce((result, permission) => {
    result[permission.module] = [...(result[permission.module] || []), permission]
    return result
  }, {}), [permissions])
  if (!permissions.length) return <div className="access-empty">This role currently grants no permissions.</div>
  return <div className="access-permissions">{Object.entries(groups).map(([module, items]) => <section key={module}><strong>{module.replaceAll('_', ' ')}</strong><div>{items.map((permission) => <span key={permission.key}>{permission.action.replaceAll('_', ' ')}</span>)}</div></section>)}</div>
}

function TemporaryPassword({ password, onDismiss }) {
  if (!password) return null
  return <div className="temporary-password" role="status"><div><strong>Temporary password</strong><code>{password}</code><p>Share it securely. It is displayed only now and must be changed after login.</p></div><div><button className="secondary-button" onClick={() => navigator.clipboard?.writeText(password)}>Copy</button><button className="icon-button" onClick={onDismiss} aria-label="Dismiss temporary password">×</button></div></div>
}

export default function StaffAccessPanel({ profile, has, onClose, onChanged }) {
  const [access, setAccess] = useState(null)
  const [roles, setRoles] = useState([])
  const [accounts, setAccounts] = useState([])
  const [mode, setMode] = useState('create')
  const [form, setForm] = useState({ username: '', role_id: '', status: 'active', can_manage_register: false, existing_user_id: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [issuedPassword, setIssuedPassword] = useState('')

  function applyBundle({ accessData, roleData, accountData }) {
    setAccess(accessData)
    setRoles(Array.isArray(roleData) ? roleData : [])
    setAccounts(Array.isArray(accountData) ? accountData : [])
    if (accessData.account) {
      setForm({
        username: accessData.account.username,
        role_id: accessData.account.role?.id || '',
        status: accessData.account.status || 'active',
        can_manage_register: Boolean(accessData.account.can_manage_register),
        existing_user_id: '',
      })
    }
  }

  useEffect(() => {
    let cancelled = false
    fetchAccessBundle(profile.id)
      .then((bundle) => {
        if (cancelled) return
        setAccess(bundle.accessData)
        setRoles(Array.isArray(bundle.roleData) ? bundle.roleData : [])
        setAccounts(Array.isArray(bundle.accountData) ? bundle.accountData : [])
        if (bundle.accessData.account) {
          setForm({
            username: bundle.accessData.account.username,
            role_id: bundle.accessData.account.role?.id || '',
            status: bundle.accessData.account.status || 'active',
            can_manage_register: Boolean(bundle.accessData.account.can_manage_register),
            existing_user_id: '',
          })
        }
      })
      .catch((requestError) => { if (!cancelled) setError(requestError.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [profile.id])

  function set(field, value) { setForm((current) => ({ ...current, [field]: value })) }

  async function createOrLink(event) {
    event.preventDefault()
    setError('')
    const body = mode === 'link'
      ? { existing_user_id: Number(form.existing_user_id) }
      : { username: form.username.trim(), role_id: Number(form.role_id), status: form.status, can_manage_register: form.can_manage_register }
    if (mode === 'link' && !body.existing_user_id) return setError('Select an account to link.')
    if (mode === 'create' && (!body.username || !body.role_id)) return setError('Username and role are required.')
    try {
      setSaving(true)
      const result = await api(`/api/staff/${profile.id}/access`, { method: 'POST', body })
      setAccess(result)
      setIssuedPassword(result.temporary_password || '')
      await onChanged()
    } catch (requestError) { setError(requestError.message) } finally { setSaving(false) }
  }

  async function saveAccess(event) {
    event.preventDefault()
    const roleChanged = Number(form.role_id) !== Number(access.account.role?.id)
    const blocking = form.status === 'blocked' && access.account.status !== 'blocked'
    if ((roleChanged || blocking) && !window.confirm(`Apply ${roleChanged ? 'the new role' : ''}${roleChanged && blocking ? ' and ' : ''}${blocking ? 'account blocking' : ''} for ${profile.full_name}?`)) return
    try {
      setSaving(true)
      setError('')
      setAccess(await api(`/api/staff/${profile.id}/access`, { method: 'PATCH', body: { role_id: Number(form.role_id), status: form.status, can_manage_register: form.can_manage_register } }))
      await onChanged()
    } catch (requestError) { setError(requestError.message) } finally { setSaving(false) }
  }

  async function resetPassword() {
    if (!window.confirm(`Reset the password for @${access.account.username}? Existing login credentials will stop working.`)) return
    try {
      setSaving(true)
      setError('')
      const result = await api(`/api/staff/${profile.id}/access/reset-password`, { method: 'POST' })
      setIssuedPassword(result.temporary_password)
      applyBundle(await fetchAccessBundle(profile.id))
    } catch (requestError) { setError(requestError.message) } finally { setSaving(false) }
  }

  const selectedRole = roles.find((role) => Number(role.id) === Number(form.role_id))
  return <StaffModal title={`Account access · ${profile.full_name}`} onClose={onClose} wide>
    <div className="staff-access-panel">
      {error && <div className="form-error">{error}</div>}
      <TemporaryPassword password={issuedPassword} onDismiss={() => setIssuedPassword('')} />
      {loading && <div className="access-empty">Loading account access…</div>}
      {!loading && !access?.account && <>
        <div className="access-mode"><button className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>Create account</button><button className={mode === 'link' ? 'active' : ''} onClick={() => setMode('link')}>Link existing</button></div>
        <form className="staff-form access-create" onSubmit={createOrLink}>
          {mode === 'create' ? <><label>Username<input value={form.username} minLength="3" required onChange={(event) => set('username', event.target.value)} /></label><label>Role<select value={form.role_id} required onChange={(event) => set('role_id', event.target.value)}><option value="">Select role</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label><div className="form-grid"><label>Account status<select value={form.status} onChange={(event) => set('status', event.target.value)}><option value="active">Active</option><option value="blocked">Blocked</option></select></label><label className="check-field"><input type="checkbox" checked={form.can_manage_register} onChange={(event) => set('can_manage_register', event.target.checked)} /> Register management</label></div></> : <label>Existing unlinked account<select value={form.existing_user_id} required onChange={(event) => set('existing_user_id', event.target.value)}><option value="">Select account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} (@{account.username})</option>)}</select></label>}
          {mode === 'create' && selectedRole && <PermissionSummary permissions={(selectedRole.permissions || []).map((key) => ({ key, module: key.split('.')[0], action: key.split('.')[1] }))} />}
          <footer><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : mode === 'create' ? 'Create account' : 'Link account'}</button></footer>
        </form>
      </>}
      {!loading && access?.account && <>
        <form className="staff-form access-settings" onSubmit={saveAccess}>
          <div className="access-account-heading"><div><span>Linked account</span><strong>@{access.account.username}</strong></div><span className={`account-state ${access.account.status}`}>{access.account.status}</span></div>
          <div className="form-grid"><label>Role<select value={form.role_id} disabled={!has('users.assign_roles')} onChange={(event) => set('role_id', event.target.value)}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label><label>Account status<select value={form.status} disabled={!has('users.update')} onChange={(event) => set('status', event.target.value)}><option value="active">Active</option><option value="blocked">Blocked</option></select></label></div>
          <label className="check-field"><input type="checkbox" checked={form.can_manage_register} disabled={!has('users.update')} onChange={(event) => set('can_manage_register', event.target.checked)} /> Can manage register</label>
          <footer><button type="button" className="danger-button" disabled={saving || !has('users.update')} onClick={resetPassword}>Reset password</button><button className="primary-button" disabled={saving || (!has('users.update') && !has('users.assign_roles'))}>{saving ? 'Saving…' : 'Save access'}</button></footer>
        </form>
        <section className="access-section"><header><h3>Effective permissions</h3><span>{access.permissions.length}</span></header><PermissionSummary permissions={access.permissions} /></section>
        <section className="access-section"><header><h3>Access history</h3><span>{access.audit.length}</span></header><div className="access-audit">{access.audit.map((event) => <article key={event.id}><div><strong>{event.action.replaceAll('_', ' ')}</strong><span>{event.actor_name || event.actor_username || 'System'}</span></div><time>{new Date(event.created_at).toLocaleString()}</time></article>)}{!access.audit.length && <div className="access-empty">No access changes recorded yet.</div>}</div></section>
      </>}
    </div>
  </StaffModal>
}
