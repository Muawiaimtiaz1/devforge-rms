import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import './login.css'

function redirectFor(user) {
  if (user?.must_change_password) return '/app/change-password'
  return user?.role === 'superadmin' ? '/admin/store-monitoring' : '/app/lobby'
}

function BrandLogo() {
  return <span className="login-logo-tile"><img className="login-logo-light" src="/icons/logo-light.png" alt="Orbit OS" /><img className="login-logo-dark" src="/icons/logo-dark.png" alt="Orbit OS" /></span>
}

export default function LoginPage() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const [form, setForm] = useState(() => ({ username: localStorage.getItem('remembered_username') || '', password: '', remember: Boolean(localStorage.getItem('remembered_username')) }))
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api('/api/auth/me').then(({ user }) => { if (active) window.location.replace(redirectFor(user)) }).catch(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
    document.cookie = `rms_theme=${dark ? 'dark' : 'light'}; Path=/; Max-Age=31536000; SameSite=Lax`
  }, [dark])

  function change(name, value) { setForm(current => ({ ...current, [name]: value })) }

  async function submit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await api('/api/auth/login', { method: 'POST', body: { username: form.username.trim(), password: form.password } })
      if (form.remember) localStorage.setItem('remembered_username', form.username.trim())
      else localStorage.removeItem('remembered_username')
      window.location.replace(redirectFor(result.user))
    } catch (requestError) {
      setError(requestError.message || 'Unable to sign in. Please try again.')
      setLoading(false)
    }
  }

  if (checking) return <main className="login-checking" aria-label="Checking your session"><BrandLogo /><span>Opening your Orbit…</span></main>

  return <main className="orbit-login-page">
    <button className="login-theme-toggle" type="button" onClick={() => setDark(value => !value)} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>{dark ? <svg viewBox="0 0 24 24"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.4 6.4-.7-.7M6.3 6.3l-.7-.7m12.8 0-.7.7M6.3 17.7l-.7.7M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg> : <svg viewBox="0 0 24 24"><path d="M20.4 15.4A9 9 0 018.6 3.6 9 9 0 1012 21a9 9 0 008.4-5.6z" /></svg>}</button>
    <section className="login-shell">
      <section className="login-visual-panel" aria-label="Orbit OS platform overview">
        <a className="login-brand" href="/app/login" aria-label="Orbit OS login"><BrandLogo /><span><strong>ORBIT OS</strong><small>One Business. One Orbit.</small></span></a>
        <div className="login-visual-copy"><h2>Power your business<br />with one <em>smart system.</em></h2><span>Simplify operations, boost productivity, and make data-driven decisions with Orbit OS.</span></div>
        <dl className="login-stats"><div><dt><span className="login-stat-icon"><svg viewBox="0 0 24 24"><path d="M4 21V8l8-5 8 5v13M9 21v-5h6v5M8 10h.01M12 10h.01M16 10h.01" /></svg></span><strong>100+</strong></dt><dd>Businesses</dd></div><div><dt><span className="login-stat-icon"><svg viewBox="0 0 24 24"><path d="M4 17l4-4 3 3 7-8M14 8h4v4" /></svg></span><strong>10K+</strong></dt><dd>Daily transactions</dd></div><div><dt><span className="login-stat-icon"><svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.7-2.9 8.1-7 10-4.1-1.9-7-5.3-7-10V6l7-3zm-3 9 2 2 4-4" /></svg></span><strong>99.9%</strong></dt><dd>Uptime</dd></div></dl>
        <div className="login-artwork-slot"><img className="login-artwork-image" src={`${import.meta.env.BASE_URL}images/${dark ? 'login-artwork-dark.png' : 'login-artwork-light.png'}`} alt="Orbit OS business platform overview" /></div>
      </section>
      <section className="login-access-panel">
        <div className="login-form-wrap">
          <div className="login-heading"><h1>Welcome back</h1><span>Sign in to continue to your Orbit.</span></div>
          <form onSubmit={submit} autoComplete="off">
            <label><span>Email or username</span><div className="login-input-wrap"><svg viewBox="0 0 24 24"><path d="M20 21a8 8 0 00-16 0m12-13a4 4 0 11-8 0 4 4 0 018 0z" /></svg><input value={form.username} onChange={event => change('username', event.target.value)} autoComplete="off" data-lpignore="true" data-1p-ignore spellCheck="false" placeholder="Enter your email or username" required autoFocus /></div></label>
            <label><span>Password</span><div className="login-input-wrap"><svg viewBox="0 0 24 24"><path d="M7 10V7a5 5 0 0110 0v3M6 10h12v11H6z" /></svg><input type={showPassword ? 'text' : 'password'} value={form.password} onChange={event => change('password', event.target.value)} autoComplete="new-password" data-lpignore="true" data-1p-ignore placeholder="Enter your password" required /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}><svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zm10 3a3 3 0 100-6 3 3 0 000 6z" /></svg></button></div></label>
            <div className="login-form-options"><label className="remember-control"><input type="checkbox" checked={form.remember} onChange={event => change('remember', event.target.checked)} /><span>Remember me</span></label><a href="mailto:support@orbit-os.com">Forgot password?</a></div>
            {error && <div className="login-error" role="alert">{error}</div>}
            <button className="login-submit" disabled={loading}>{loading ? <><span className="login-button-spinner" />Authenticating…</> : <>Sign in <span>→</span></>}</button>
          </form>
          <div className="login-divider"><span>OR</span></div>
          <button className="login-sso" type="button" disabled title="SSO is not configured"><svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.7-2.9 8.1-7 10-4.1-1.9-7-5.3-7-10V6l7-3zm-3 9 2 2 4-4" /></svg>Sign in with SSO</button>
          <div className="login-support">Need help? <a href="mailto:support@orbit-os.com">Contact IT Support</a></div>
        </div>
      </section>
    </section>
  </main>
}