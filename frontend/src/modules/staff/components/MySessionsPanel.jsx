import { useEffect, useState } from 'react'
import { api, legacyUrl } from '../../../api/client'
import StaffModal from './StaffModal'

async function fetchSecurityBundle() {
  const [sessions, events] = await Promise.all([api('/api/auth/sessions'), api('/api/auth/security-events?limit=50')])
  return { sessions: Array.isArray(sessions) ? sessions : [], events: Array.isArray(events) ? events : [] }
}

function deviceLabel(userAgent) {
  const value = String(userAgent || '')
  const browser = value.includes('Edg/') ? 'Microsoft Edge' : value.includes('Chrome/') ? 'Chrome' : value.includes('Firefox/') ? 'Firefox' : value.includes('Safari/') ? 'Safari' : 'Unknown browser'
  const platform = value.includes('Windows') ? 'Windows' : value.includes('Android') ? 'Android' : /iPhone|iPad/.test(value) ? 'iOS' : value.includes('Mac OS') ? 'macOS' : 'Unknown device'
  return `${browser} on ${platform}`
}

export default function MySessionsPanel({ onClose, embedded = false }) {
  const [bundle, setBundle] = useState({ sessions: [], events: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function reload() { setBundle(await fetchSecurityBundle()) }
  useEffect(() => {
    let cancelled = false
    fetchSecurityBundle().then((result) => { if (!cancelled) setBundle(result) }).catch((requestError) => { if (!cancelled) setError(requestError.message) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  async function revoke(session) {
    if (!window.confirm(`Sign out ${session.is_current ? 'this device' : deviceLabel(session.user_agent)}?`)) return
    try {
      const result = await api(`/api/auth/sessions/${session.device_id}`, { method: 'DELETE' })
      if (result.logged_out) return window.location.replace(legacyUrl('/'))
      await reload()
    } catch (requestError) { setError(requestError.message) }
  }

  async function revokeOthers() {
    if (!window.confirm('Sign out every other active device?')) return
    try { await api('/api/auth/sessions/others', { method: 'DELETE' }); await reload() } catch (requestError) { setError(requestError.message) }
  }

  const content = <div className="sessions-panel">
    {embedded && <header className="embedded-panel-heading"><div><p className="section-label">Account security</p><h2>Sessions & security</h2><p>Review active devices and recent security events.</p></div></header>}
    {error && <div className="form-error">{error}</div>}
    <section><header><div><h3>Active devices</h3><p>Review browsers currently signed into your account.</p></div>{bundle.sessions.some((session) => !session.is_current) && <button className="danger-button" onClick={revokeOthers}>Sign out others</button>}</header>{loading ? <div className="access-empty">Loading sessions…</div> : <div className="session-list">{bundle.sessions.map((session) => <article key={session.device_id}><div><strong>{deviceLabel(session.user_agent)}</strong><span>{session.ip_address || 'IP unavailable'} · Last seen {new Date(session.last_seen_at).toLocaleString()}</span>{session.is_current && <em>Current device</em>}</div><button className="secondary-button" onClick={() => revoke(session)}>Sign out</button></article>)}{!bundle.sessions.length && <div className="access-empty">No active sessions were found.</div>}</div>}</section>
    <section><header><div><h3>Security history</h3><p>Recent login, logout, password, and session events.</p></div></header><div className="security-event-list">{bundle.events.map((event) => <article key={event.id}><div><strong>{event.event_type.replaceAll('_', ' ')}</strong><span>{deviceLabel(event.user_agent)}{event.ip_address ? ` · ${event.ip_address}` : ''}</span></div><time>{new Date(event.created_at).toLocaleString()}</time></article>)}{!loading && !bundle.events.length && <div className="access-empty">No security events recorded yet.</div>}</div></section>
  </div>
  return embedded ? content : <StaffModal title="Sessions & security" onClose={onClose} wide>{content}</StaffModal>
}
