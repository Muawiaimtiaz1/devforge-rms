import { useEffect, useState } from 'react'

const ICONS = { directory: '▦', organization: '⌘', attendance: '◷', leave: '◇', roles: '⚿', sessions: '◉' }
export default function StaffWorkspaceSidebar({ active, has, onSelect }) {
  const icons = { ...ICONS, payroll: '$', documents: 'D', activity: 'A' }
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('rms_staff_sidebar_collapsed') === 'true')
  const [mobileOpen, setMobileOpen] = useState(false)
  useEffect(() => { localStorage.setItem('rms_staff_sidebar_collapsed', String(collapsed)) }, [collapsed])
  const items = [
    has('users.view') && ['directory', 'Directory'], has('users.view') && ['organization', 'Organization'],
    has('attendance.view') && ['attendance', 'Attendance'], has('leave.view') && ['leave', 'Leave'],
    has('payroll.view') && ['payroll', 'Payroll'],
    has('documents.view') && ['documents', 'Documents'],
    has('staff_activity.view') && ['activity', 'Activity & records'],
    has('roles.view') && ['roles', 'Roles & permissions'], ['sessions', 'My sessions'],
  ].filter(Boolean)
  function choose(value) { onSelect(value); setMobileOpen(false) }
  return <><button className="staff-sidebar-mobile-toggle" onClick={() => setMobileOpen(true)} aria-label="Open Staff panels">☰ <span>Staff panels</span></button>{mobileOpen && <button className="staff-sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label="Close Staff panels" />}<aside className={`staff-workspace-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}><header><div><strong>Staff panels</strong><span>People operations</span></div><button onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? '›' : '‹'}</button></header><nav aria-label="Staff management panels">{items.map(([value, label]) => <button key={value} className={active === value ? 'active' : ''} aria-current={active === value ? 'page' : undefined} onClick={() => choose(value)} title={collapsed ? label : undefined}><i aria-hidden="true">{icons[value]}</i><span>{label}</span></button>)}</nav><footer><a href="/app/lobby"><i aria-hidden="true">←</i><span>Shop lobby</span></a></footer></aside></>
}
