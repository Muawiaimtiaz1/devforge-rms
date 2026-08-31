import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { api, legacyUrl } from '../../api/client'
import StaffTable from './components/StaffTable'
import StaffAccessPanel from './components/StaffAccessPanel'
const RoleManagementPanel = lazy(() => import('./components/RoleManagementPanel'))
const MySessionsPanel = lazy(() => import('./components/MySessionsPanel'))
const OrganizationStructurePanel = lazy(() => import('./components/OrganizationStructurePanel'))
import StaffAssignmentPanel from './components/StaffAssignmentPanel'
const AttendanceWorkspacePanel = lazy(() => import('./components/AttendanceWorkspacePanel'))
import StaffWorkspaceSidebar from './components/StaffWorkspaceSidebar'
const LeaveWorkspacePanel = lazy(() => import('./components/LeaveWorkspacePanel'))
const PayrollWorkspacePanel = lazy(() => import('./components/PayrollWorkspacePanel'))
const StaffDocumentsWorkspacePanel = lazy(() => import('./components/StaffDocumentsWorkspacePanel'))
const StaffActivityWorkspacePanel = lazy(() => import('./components/StaffActivityWorkspacePanel'))
import StaffDirectorySkeleton from './components/StaffDirectorySkeleton'
import StaffFilters from './components/StaffFilters'
import StaffPagination from './components/StaffPagination'
import StaffProfileDetail from './components/StaffProfileDetail'
import StaffProfileForm from './components/StaffProfileForm'
import StaffSummary from './components/StaffSummary'
import './staff-directory.css'

const INITIAL_RESULT = {
  items: [], summary: {}, filters: { departments: [], designations: [] }, pagination: { page: 1, pages: 1, total: 0 },
}
const INITIAL_FILTERS = {
  search: '', status: 'all', employment_type: 'all', department: '', designation: '', sort: 'name', direction: 'asc', page: 1,
}

export default function StaffDirectory() {
  const [session, setSession] = useState(null)
  const [result, setResult] = useState(INITIAL_RESULT)
  const [filters, setFilters] = useState(INITIAL_FILTERS)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(undefined)
  const [selected, setSelected] = useState(null)
  const [accessProfile, setAccessProfile] = useState(null)
  const [assignmentProfile, setAssignmentProfile] = useState(null)
  const [activePanel, setActivePanel] = useState('directory')
  const has = useCallback((key) => session?.role === 'superadmin' || session?.permissions?.includes(key), [session])

  const loadStaff = useCallback(async (nextFilters = filters, quiet = false) => {
    if (quiet) setRefreshing(true)
    const params = new URLSearchParams({ ...nextFilters, page_size: '24' })
    try { setResult(await api(`/api/staff?${params}`)) } finally { if (quiet) setRefreshing(false) }
  }, [filters])

  useEffect(() => {
    async function bootstrap() {
      try {
        const auth = await api('/api/auth/me')
        const user = auth.user
        const mayViewStaff = user.role === 'superadmin' || user.permissions?.includes('users.view')
        const mayViewAttendance = user.role === 'superadmin' || user.permissions?.includes('attendance.view')
        const mayViewPayroll = user.role === 'superadmin' || user.permissions?.includes('payroll.view')
        const mayViewDocuments = user.role === 'superadmin' || user.permissions?.includes('documents.view')
        const mayViewActivity = user.role === 'superadmin' || user.permissions?.includes('staff_activity.view')
        if (!mayViewStaff && !mayViewAttendance && !mayViewPayroll && !mayViewDocuments && !mayViewActivity) {
          setError('You do not have permission to view Staff Management.')
          return
        }
        setSession(user)
        if (mayViewStaff) {
          const staffData = await api('/api/staff?page=1&page_size=24&status=all&employment_type=all&sort=name&direction=asc')
          setResult(staffData)
        } else setActivePanel(mayViewAttendance ? 'attendance' : mayViewPayroll ? 'payroll' : mayViewDocuments ? 'documents' : 'activity')
      } catch (requestError) {
        if (requestError.status === 401) return window.location.replace(legacyUrl('/'))
        setError(requestError.message)
      } finally { setLoading(false) }
    }
    bootstrap()
  }, [])

  useEffect(() => {
    if (!session || !has('users.view')) return undefined
    const timer = window.setTimeout(() => loadStaff(filters, true).catch((requestError) => setError(requestError.message)), 250)
    return () => window.clearTimeout(timer)
  }, [filters, session, loadStaff, has])

  function openEditor(profile = null) { setEditing(profile) }

  async function saved() { await loadStaff(filters, true) }
  function changeFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value, page: field === 'page' ? value : 1 }))
  }

  if (loading) return <StaffDirectorySkeleton />

  return <main className="staff-page">
    <nav className="staff-topbar"><a href="/app/lobby">← Shop lobby</a><div><span>{session?.shop_name || 'DevForge RMS'}</span><strong>{session?.name || session?.username}</strong></div></nav>
    <div className="staff-workspace-layout">
      <StaffWorkspaceSidebar active={activePanel} has={has} onSelect={setActivePanel} />
      <section className="staff-shell">
        {error && <div className="page-error"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
        {activePanel === 'directory' && has('users.view') && <><header className="staff-heading"><div><p className="section-label">People workspace</p><h1>Staff Directory</h1><p>Employment profiles are separate from login accounts and preserved throughout the employee lifecycle.</p></div>{has('users.create') && <div className="heading-actions"><button className="primary-button" onClick={() => openEditor()}>+ Add staff member</button></div>}</header><StaffSummary summary={result.summary || {}} selectedStatus={filters.status} onStatusChange={(status) => changeFilter('status', status)} /><StaffFilters filters={filters} departments={result.filters?.departments || []} designations={result.filters?.designations || []} onChange={changeFilter} /><div className="staff-result-meta"><span>{result.pagination?.total || 0} staff member{result.pagination?.total === 1 ? '' : 's'}</span>{refreshing && <span role="status">Updating…</span>}</div><StaffTable profiles={result.items} canUpdate={has('users.update')} canManageAccess={has('users.view')} onView={setSelected} onEdit={openEditor} onAccess={setAccessProfile} onAssignment={setAssignmentProfile} /><StaffPagination page={filters.page} pages={result.pagination?.pages || 1} onPageChange={(page) => changeFilter('page', page)} /></>}
        <Suspense fallback={<div className="staff-panel-loader" role="status">Loading staff panel…</div>}>
          {activePanel === 'organization' && has('users.view') && <OrganizationStructurePanel embedded canUpdate={has('users.update')} onChanged={() => loadStaff(filters, true)} />}
          {activePanel === 'attendance' && has('attendance.view') && <AttendanceWorkspacePanel embedded has={has} />}
          {activePanel === 'roles' && has('roles.view') && <RoleManagementPanel embedded has={has} />}
          {activePanel === 'sessions' && <MySessionsPanel embedded />}
          {activePanel === 'leave' && has('leave.view') && <LeaveWorkspacePanel has={has} />}
          {activePanel === 'payroll' && has('payroll.view') && <PayrollWorkspacePanel has={has} />}
          {activePanel === 'documents' && has('documents.view') && <StaffDocumentsWorkspacePanel has={has} />}
          {activePanel === 'activity' && has('staff_activity.view') && <StaffActivityWorkspacePanel has={has} />}
        </Suspense>
      </section>
    </div>
    {editing !== undefined && <StaffProfileForm profile={editing} onClose={() => setEditing(undefined)} onSaved={saved} />}
    {selected && <StaffProfileDetail profile={selected} canUpdate={has('users.update')} canManageAccess={has('users.view')} onClose={() => setSelected(null)} onAssignment={() => { const profile = selected; setSelected(null); setAssignmentProfile(profile) }} onAccess={() => { const profile = selected; setSelected(null); setAccessProfile(profile) }} onEdit={() => { const profile = selected; setSelected(null); openEditor(profile) }} />}
    {accessProfile && <StaffAccessPanel profile={accessProfile} has={has} onClose={() => setAccessProfile(null)} onChanged={saved} />}
    {assignmentProfile && <StaffAssignmentPanel profile={assignmentProfile} canUpdate={has('users.update')} isSuperadmin={session?.role === 'superadmin'} onClose={() => setAssignmentProfile(null)} onChanged={() => loadStaff(filters, true)} />}
  </main>
}
