import { useEffect, useState } from 'react'
import { api, legacyUrl } from '../../api/client'
import { AnalyticsFrame } from './AnalyticsFrame'
import { AnalyticsTopbar } from './AnalyticsTopbar'
import { OverviewTab } from './OverviewTab'
import { SpecificTab } from './SpecificTab'
import './analytics.generated.css'

const initialFilters = { period: '7days', from: '', to: '', brandId: '' }
const localDate = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')

function Loading() {
  return <div className="flex flex-col items-center justify-center h-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 gap-4" role="status"><div className="w-10 h-10 border-4 border-slate-200 dark:border-slate-800 border-t-slate-800 dark:border-t-slate-200 rounded-full animate-spin" /><span className="text-sm font-bold text-slate-500">Aggregating transactional data in under 1 second...</span></div>
}

export default function AnalyticsPage() {
  const [session, setSession] = useState(null)
  const [authError, setAuthError] = useState('')
  const [filters, setFilters] = useState(initialFilters)
  const [customDateLimits, setCustomDateLimits] = useState(null)
  const [tab, setTab] = useState('overview')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [result, setResult] = useState({})
  const [retry, setRetry] = useState(0)
  const [toast, setToast] = useState('')
  const queryKey = JSON.stringify([filters, retry])
  const data = result.key === queryKey ? result.data : null
  const error = result.key === queryKey ? result.error : ''
  const brands = result.data?.brands || []

  useEffect(() => {
    document.documentElement.classList.add('analytics-document')
    const oldTitle = document.title
    document.title = 'Analytics & Reports — DevForge RMS'
    let active = true
    api('/api/auth/me').then(({ user }) => {
      if (!active) return
      if (user.role !== 'superadmin' && !user.permissions?.includes('analytics.view')) setAuthError('You do not have permission to view Analytics.')
      else setSession(user)
    }).catch(error => {
      if (error.status === 401) window.location.replace(legacyUrl('/'))
      else if (active) setAuthError(error.message)
    })
    return () => { active = false; document.documentElement.classList.remove('analytics-document'); document.title = oldTitle }
  }, [])

  useEffect(() => {
    if (!session) return
    const controller = new AbortController()
    const params = new URLSearchParams({ period: filters.period, t: String(Date.now()) })
    if (filters.period === 'custom') { params.set('from', filters.from); params.set('to', filters.to) }
    if (filters.brandId) params.set('brand_id', filters.brandId)
    api('/api/analytics/dashboard-data?' + params, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setResult({ key: queryKey, data })
    }).catch(error => {
      if (controller.signal.aborted) return
      if (error.status === 401) window.location.replace(legacyUrl('/'))
      else setResult({ key: queryKey, error: error.message })
    })
    return () => controller.abort()
  }, [session, filters, queryKey])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3500)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const close = event => { if (event.key === 'Escape') setDrawerOpen(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [])

  function changePeriod(period) {
    setFilters(previous => {
      const next = { ...previous, period }
      if (period === 'custom' && (!next.from || !next.to)) {
        const date = new Date()
        next.to = localDate(date)
        date.setDate(date.getDate() - 29)
        next.from = localDate(date)
      }
      return next
    })
  }

  function changeDate(field, value) {
    if (field === 'from' && value) { const max = new Date(value); max.setDate(max.getDate() + 29); setCustomDateLimits({ min: value, max: localDate(max) }) }
    setFilters(previous => {
      const next = { ...previous, [field]: value }
      if (field === 'from' && value) {
        const max = new Date(value)
        max.setDate(max.getDate() + 29)
        const maxDate = localDate(max)
        if (!next.to || next.to > maxDate) next.to = maxDate
        if (next.to < value) next.to = value
      }
      return next
    })
  }

  return <div className="analytics-page min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-200 transition-colors duration-300">
    {session && <AnalyticsTopbar user={session} />}
    <main className="pt-20 min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
      <div className="container mx-auto px-3 sm:px-6 pb-20 overflow-x-hidden">
        {authError ? <div role="alert" className="p-6 text-rose-600"><p>{authError}</p><a href="/app/lobby">Return to shop lobby</a></div> :
          <AnalyticsFrame pageHeader={<header className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3"><h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tighter">Analytics & Reports</h2><div className="hidden sm:block h-px flex-1 bg-slate-200 dark:bg-slate-800 mx-5 lg:mx-8" />{data?.dataAsOf && <div className="sm:text-right text-[10px] font-bold text-slate-500"><div>As of {new Date(data.dataAsOf).toLocaleString()}</div><div>{data.metricVersion} · live reporting data</div></div>}</header>} customDateLimits={customDateLimits} activeAnalyticsTab={tab} analyticsPeriod={filters.period} analyticsCustomFrom={filters.from} analyticsCustomTo={filters.to} analyticsBrandId={data && !data.selectedBrandId ? '' : filters.brandId} brands={brands} drawerOpen={drawerOpen} toggleAnalyticsSidebar={() => setDrawerOpen(value => !value)} switchAnalyticsTab={tab => { setTab(tab); setDrawerOpen(false) }} onPeriodChange={changePeriod} onDateChange={changeDate} onPartnerChange={brandId => setFilters(previous => ({ ...previous, brandId }))} notify={setToast}>
            {error ? <div role="alert" className="p-6 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded-2xl border border-rose-100 dark:border-rose-900/60 font-medium text-sm flex flex-col gap-2"><span className="font-bold">❌ Error Computing Analytics</span><span>{error}</span><button onClick={() => setRetry(value => value + 1)} className="mt-2 w-fit px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all shadow-md">Retry Query</button></div> : !data ? <Loading /> : tab === 'overview' ? <OverviewTab data={data} analyticsPeriod={filters.period} /> : <SpecificTab tabId={tab} data={data} analyticsPeriod={filters.period} />}
          </AnalyticsFrame>}
      </div>
    </main>
    {toast && <div role="status" className="fixed bottom-4 left-3 right-3 sm:bottom-6 sm:left-auto sm:right-6 z-[200] rounded-xl bg-slate-900 text-white p-4 shadow-xl">{toast}</div>}
  </div>
}

