import { useEffect, useState } from 'react'
import { api, legacyUrl } from '../../api/client'
import './lobby.css'

function subscriptionLabel(subscription) {
  if (!subscription) return 'No active subscription'
  return subscription.label || (subscription.is_lifetime ? 'Lifetime access' : 'Subscription active')
}

function Lobby() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches))

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => {
    api('/api/lobby').then((lobby) => {
      if (lobby.user?.role === 'superadmin') {
        window.location.replace(legacyUrl('/admin/store-monitoring'))
        return
      }
      setData(lobby)
    }).catch((requestError) => {
      if (requestError.status === 401) window.location.replace(legacyUrl('/'))
      else setError(requestError.message)
    })
  }, [])

  function openModule(module) {
    if (module.frontend === 'react') {
      window.location.assign(module.target)
      return
    }
    sessionStorage.setItem('lobby_selected', 'true')
    sessionStorage.setItem('react_lobby_owner', 'true')
    localStorage.setItem('pos_page', module.id)
    window.location.assign(legacyUrl(module.target))
  }

  async function logout() {
    if (data.register?.active) {
      const manage = window.confirm('You have an active register shift. Select OK to manage it before logging out, or Cancel to continue.')
      if (manage) {
        openModule({ id: 'register', frontend: 'legacy', target: '/dashboard#register' })
        return
      }
      if (!window.confirm('Log out without closing the register shift? Drawer totals will remain pending.')) return
    }
    await api('/api/auth/logout', { method: 'POST' })
    localStorage.clear()
    sessionStorage.clear()
    window.location.replace(legacyUrl('/'))
  }

  if (error) return <main className="lobby-state"><h1>Could not load modules</h1><p>{error}</p><button onClick={() => window.location.reload()}>Try again</button></main>
  if (!data) return <main className="lobby-state"><div className="lobby-spinner" /><p>Loading your workspace…</p></main>

  const { user, register, modules } = data
  return (
    <main className="react-lobby">
      <header className="lobby-topbar">
        <div className="lobby-brand"><div className="brand-mark">D</div><div><strong>{user.shop_name || 'DevForge OS'}</strong><span>Restaurant Management</span></div></div>
        <div className="lobby-statuses">
          <span className={`status-pill ${register.active ? 'open' : register.can_manage ? 'closed' : 'neutral'}`}>{register.active ? 'Register open' : register.can_manage ? 'Register closed' : 'Shift required'}</span>
          <span className="status-pill subscription" title={user.subscription?.end_date ? `Valid until ${user.subscription.end_date}` : ''}>{subscriptionLabel(user.subscription)}</span>
        </div>
        <div className="lobby-account">
          <button className="theme-button" onClick={() => setDark((value) => !value)} aria-label="Toggle theme">{dark ? '☀' : '☾'}</button>
          <div><strong>{user.name || user.username}</strong><span>@{user.username}</span></div>
          <button className="logout-button" onClick={logout}>Log out</button>
        </div>
      </header>

      <section className="lobby-content">
        <header className="lobby-heading"><div><p>Workspace launcher</p><h1>Switch Modules</h1><span>Select a workspace based on the kind of work you are doing.</span></div><div className="module-count">{modules.length}<span>Available modules</span></div></header>
        <section className="module-grid" aria-label="Available modules">
          {modules.map((module, index) => (
            <button className="module-card" style={{ '--delay': `${index * 40}ms` }} key={module.id} onClick={() => openModule(module)}>
              <span className="module-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" dangerouslySetInnerHTML={{ __html: module.icon }} /></span>
              <span className="module-copy"><strong>{module.label}</strong><small>{module.desc}</small></span>
              <span className="module-arrow">→</span>
            </button>
          ))}
        </section>
      </section>
    </main>
  )
}

export default Lobby
