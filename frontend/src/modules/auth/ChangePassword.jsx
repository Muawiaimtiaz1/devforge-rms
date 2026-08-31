import { useEffect, useState } from 'react'
import { api, legacyUrl } from '../../api/client'
import './change-password.css'

export default function ChangePassword() {
  const [user, setUser] = useState(null)
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api('/api/auth/me').then(({ user: currentUser }) => {
      if (!currentUser.must_change_password) window.location.replace('/app/lobby')
      setUser(currentUser)
    }).catch((requestError) => {
      if (requestError.status === 401) window.location.replace(legacyUrl('/'))
      else setError(requestError.message)
    })
  }, [])

  function set(field, value) { setForm((current) => ({ ...current, [field]: value })) }
  async function submit(event) {
    event.preventDefault()
    setError('')
    if (form.new_password.length < 10) return setError('New password must contain at least 10 characters.')
    if (form.new_password !== form.confirm_password) return setError('New password confirmation does not match.')
    try {
      setSaving(true)
      await api('/api/auth/change-password', { method: 'POST', body: { current_password: form.current_password, new_password: form.new_password } })
      window.location.replace('/app/lobby')
    } catch (requestError) { setError(requestError.message) } finally { setSaving(false) }
  }

  return <main className="password-change-page"><section className="password-change-card"><p className="password-change-label">Account security</p><h1>Choose a new password</h1><p>Welcome {user?.name || user?.username || ''}. Replace the temporary password before opening DevForge RMS.</p>{error && <div className="password-change-error">{error}</div>}<form onSubmit={submit}><label>Temporary password<input type="password" autoComplete="current-password" value={form.current_password} onChange={(event) => set('current_password', event.target.value)} required /></label><label>New password<input type="password" autoComplete="new-password" minLength="10" value={form.new_password} onChange={(event) => set('new_password', event.target.value)} required /></label><label>Confirm new password<input type="password" autoComplete="new-password" minLength="10" value={form.confirm_password} onChange={(event) => set('confirm_password', event.target.value)} required /></label><button disabled={saving}>{saving ? 'Updating…' : 'Update password'}</button></form></section></main>
}
