import { useCallback, useEffect, useState } from 'react'
import { api, legacyUrl } from '../../api/client'
import DashboardTopbar from './components/DashboardTopbar'
import DashboardFilters from './components/DashboardFilters'
import DashboardMetrics from './components/DashboardMetrics'
import PaymentReceivers from './components/PaymentReceivers'
import PartnerTables from './components/PartnerTables'
import DashboardLists from './components/DashboardLists'
import GlobalDashboard from './components/GlobalDashboard'
import DashboardSkeleton from './components/DashboardSkeleton'
import { defaultRange } from './dashboard.utils'
import './dashboard.css'

const INITIAL_FILTERS = { period: 'today', brandId: '', from: '', to: '' }

export default function DashboardPage() {
  const [user, setUser] = useState(null)
  const [data, setData] = useState(null)
  const [filters, setFilters] = useState(INITIAL_FILTERS)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (nextFilters, quiet = false, global = false) => {
    if (quiet) setRefreshing(true); else setLoading(true)
    setError('')
    const params = new URLSearchParams()
    if (nextFilters.period !== 'all') params.set('period', nextFilters.period)
    if (nextFilters.period === 'custom') { if (nextFilters.from) params.set('from', nextFilters.from); if (nextFilters.to) params.set('to', nextFilters.to) }
    if (nextFilters.brandId) params.set('brand_id', nextFilters.brandId)
    const endpoint = global ? '/api/analytics' : '/api/analytics/dashboard-data'
    try { setData(await api(`${endpoint}${params.size ? `?${params}` : ''}`)) }
    catch (requestError) { setError(requestError.message) }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => {
    api('/api/auth/me').then(({ user: sessionUser }) => {
      if (sessionUser.role !== 'superadmin' && !sessionUser.permissions?.includes('dashboard.view')) { setError('You do not have permission to view Dashboard.'); setLoading(false); return }
      setUser(sessionUser); load(INITIAL_FILTERS, false, sessionUser.role === 'superadmin')
    }).catch((requestError) => { if (requestError.status === 401) window.location.replace(legacyUrl('/')); else { setError(requestError.message); setLoading(false) } })
  }, [load])

  function changeFilters(change) {
    setFilters((current) => {
      const next = { ...current, ...change }
      if (change.period === 'custom' && (!next.from || !next.to)) Object.assign(next, defaultRange())
      if (change.period && change.period !== 'custom') { next.from = ''; next.to = '' }
      window.clearTimeout(window.__dashboardFilterTimer)
      window.__dashboardFilterTimer = window.setTimeout(() => load(next, true, user?.role === 'superadmin'), change.from !== undefined || change.to !== undefined ? 300 : 0)
      return next
    })
  }

  if (loading) return <DashboardSkeleton />
  if (!user || (!data && error)) return <main className="dashboard-state"><h1>Could not load Dashboard</h1><p>{error}</p><a href="/app/lobby">Return to shop lobby</a></main>
  return <main className="dashboard-page"><DashboardTopbar user={user} /><section className={`dashboard-shell ${refreshing ? 'refreshing' : ''}`}>{error && <div className="dashboard-error"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error">x</button></div>}{data?.isGlobal ? <GlobalDashboard /> : <><header className="dashboard-heading"><h1>Main Dashboard</h1><p>Real-time overview of your store performance</p></header><DashboardFilters filters={filters} brands={data?.brands || []} onChange={changeFilters} onClear={() => { setFilters({ ...INITIAL_FILTERS, period: 'all' }); load({ ...INITIAL_FILTERS, period: 'all' }, true, user?.role === 'superadmin') }} /><DashboardMetrics data={data || {}} /><PaymentReceivers rows={data?.staffPerformance} /><PartnerTables data={data || {}} /><DashboardLists topProducts={data?.topProducts} recentSales={data?.recentSales} /></>}</section></main>
}
