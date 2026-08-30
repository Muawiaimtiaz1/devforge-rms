import { useEffect, useRef, useState } from 'react'
import { api, legacyUrl } from '../../api/client'
import './lobby.css'

function Lobby() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches))
  const [profileOpen, setProfileOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const profileRef = useRef(null)
  const installPrompt = useRef(null)

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

  useEffect(() => {
    function captureInstallPrompt(event) { event.preventDefault(); installPrompt.current = event }
    function closeProfile(event) { if (profileRef.current && !profileRef.current.contains(event.target)) setProfileOpen(false) }
    function closeOnEscape(event) { if (event.key === 'Escape') setProfileOpen(false) }
    window.addEventListener('beforeinstallprompt', captureInstallPrompt)
    window.addEventListener('click', closeProfile)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('beforeinstallprompt', captureInstallPrompt)
      window.removeEventListener('click', closeProfile)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  useEffect(() => {
    if (!data?.modules.some((module) => module.id === 'notifications')) return
    api('/api/notifications/unread-count').then((result) => setUnreadCount(Number(result.count || 0))).catch(() => {})
  }, [data])

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

  async function installApp() {
    setProfileOpen(false)
    if (installPrompt.current) {
      await installPrompt.current.prompt()
      await installPrompt.current.userChoice
      installPrompt.current = null
      return
    }
    window.alert('On iPhone: Share → Add to Home Screen. On Android: browser menu → Install app.')
  }

  function urlBase64ToUint8Array(value) {
    const padding = '='.repeat((4 - value.length % 4) % 4)
    const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
    return Uint8Array.from(window.atob(base64), (character) => character.charCodeAt(0))
  }

  async function enableNotifications() {
    setProfileOpen(false)
    try {
      if (!window.isSecureContext || !('Notification' in window) || !('serviceWorker' in navigator)) throw new Error('Notifications require HTTPS and a supported browser.')
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('Notification permission was not granted.')
      const registration = await navigator.serviceWorker.ready
      const { publicKey } = await api('/api/notifications/push/public-key')
      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) })
      await api('/api/notifications/push/subscribe', { method: 'POST', body: { subscription: subscription.toJSON(), device_name: navigator.userAgent } })
      window.alert('Notifications enabled for this device.')
    } catch (notificationError) { window.alert(notificationError.message) }
  }

  if (error) return <main className="lobby-state"><h1>Could not load modules</h1><p>{error}</p><button onClick={() => window.location.reload()}>Try again</button></main>
  if (!data) return <main className="lobby-state"><div className="lobby-spinner" /><p>Loading your workspace…</p></main>

  const { user, register, modules } = data
  return (
    <main className="react-lobby">
      <header className="lobby-topbar">
        <div className="lobby-controls">
          <div className="lobby-user-copy"><strong>{user.name || user.username}</strong><span>{user.role}</span></div>
          {modules.some((module) => module.id === 'notifications') && <button className="header-icon-button notification-button" title="Notifications" onClick={() => openModule(modules.find((module) => module.id === 'notifications'))}>
            <svg viewBox="0 0 24 24"><path d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0a3 3 0 01-6 0m6 0H9" /></svg>
            {unreadCount > 0 && <span>{unreadCount > 99 ? '99+' : unreadCount}</span>}
          </button>}
          <div className="profile-wrap" ref={profileRef}>
            <button className="profile-trigger" onClick={(event) => { event.stopPropagation(); setProfileOpen((value) => !value) }} aria-label="Open profile menu" aria-haspopup="menu" aria-expanded={profileOpen}>
              <span className="profile-avatar">{String(user.name || user.username).charAt(0).toUpperCase()}</span>
              <svg viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" /></svg>
            </button>
            <div className={`profile-dropdown ${profileOpen ? 'active' : ''}`} role="menu" aria-label="Profile options">
              <div className="profile-mobile-user"><strong>{user.name || user.username}</strong><span>{user.role}</span></div>
              <button type="button" role="menuitem" className="dropdown-item" onClick={() => { setDark((value) => !value); setProfileOpen(false) }}>
                <svg viewBox="0 0 24 24"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.4 6.4-.7-.7M6.3 6.3l-.7-.7m12.8 0-.7.7M6.3 17.7l-.7.7M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg><span>{dark ? 'Switch to light mode' : 'Switch to dark mode'}</span>
              </button>
              <button type="button" role="menuitem" className="dropdown-item" onClick={installApp}>
                <svg viewBox="0 0 24 24"><path d="M12 3v12m0 0-4-4m4 4 4-4M5 19h14" /></svg><span>Download app</span>
              </button>
              <button type="button" role="menuitem" className="dropdown-item" onClick={enableNotifications}>
                <svg viewBox="0 0 24 24"><path d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0a3 3 0 01-6 0m6 0H9" /></svg><span>Device notifications</span>
              </button>
              <div className="dropdown-separator"><button type="button" role="menuitem" className="dropdown-item sign-out" onClick={logout}>
                <svg viewBox="0 0 24 24"><path d="M17 16l4-4m0 0-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg><span>Sign out</span>
              </button></div>
            </div>
          </div>
        </div>
      </header>

      <section className="lobby-content">
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
