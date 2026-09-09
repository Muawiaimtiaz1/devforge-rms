import { useEffect, useRef, useState } from 'react'
import { api, legacyUrl } from '../../api/client'


export function useAnalyticsShell() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [dark, setDark] = useState(() => {
    const sharedTheme = document.cookie.match(/(?:^|; )rms_theme=(dark|light)(?:;|$)/)?.[1] || localStorage.getItem('theme')
    return sharedTheme === 'dark' || (!sharedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)
  })
  const [profileOpen, setProfileOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const profileRef = useRef(null)
  const installPrompt = useRef(null)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
    document.cookie = `rms_theme=${dark ? 'dark' : 'light'}; Path=/; Max-Age=31536000; SameSite=Lax`
  }, [dark])

  useEffect(() => {
    api('/api/lobby').then((lobby) => {

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
    if (data?.register?.active) {
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


return {data,error,dark,setDark,profileOpen,setProfileOpen,unreadCount,profileRef,openModule,logout,installApp,enableNotifications};
}