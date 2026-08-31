import { useEffect, useState } from 'react'
import { api } from '../../../api/client'

const today = new Date()
const first = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10)
const STATUS = { present: 'Present', half_day: 'Half day', less_than_half_day: 'Less than half day', absent: 'Absent', clocked_in: 'Clocked in', late: 'Late', early_departure: 'Early departure', missing_clock_in: 'Missing clock-in', missing_clock_out: 'Missing clock-out', scheduled: 'Scheduled', weekly_off: 'Weekly off', holiday: 'Holiday', approved_leave: 'Approved leave', unauthorized_absence: 'Unauthorized absence', authorized_absence: 'Authorized absence', sick_absence: 'Sick absence', other_absence: 'Other absence' }
const formatMinutes = (minutes = 0) => `${Math.floor(minutes / 60)}h ${minutes % 60}m`
const formatExceptions = (row) => [row.late_minutes ? `${row.late_minutes}m late` : '', row.early_departure_minutes ? `${row.early_departure_minutes}m early` : ''].filter(Boolean).join(' · ') || '—'

export default function AttendanceCalendar({ staff, shifts = [], canManage }) {
  const [range, setRange] = useState({ from: first, to: last, staff_profile_id: '', shift_template_id: '', search: '' })
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(Object.fromEntries(Object.entries(range).filter(([, value]) => value)))
      api(`/api/attendance/calendar?${params}`).then((result) => { setData(result); setError('') }).catch((requestError) => setError(requestError.message))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [range])

  const set = (field, value) => setRange((current) => ({ ...current, [field]: value }))
  return <section className="attendance-calendar">
    <header><div><h3>Attendance report</h3><p>{data?.timezone ? `Filter by date, shift, or employee. Business dates use ${data.timezone}.` : 'Loading attendance…'}</p></div></header>
    <div className="attendance-filters">
      <label>From<input type="date" value={range.from} onChange={(event) => set('from', event.target.value)} /></label>
      <label>To<input type="date" value={range.to} onChange={(event) => set('to', event.target.value)} /></label>
      {canManage && <>
        <label>Shift<select value={range.shift_template_id} onChange={(event) => set('shift_template_id', event.target.value)}><option value="">All shifts</option>{shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name}</option>)}</select></label>
        <label>Employee<select value={range.staff_profile_id} onChange={(event) => set('staff_profile_id', event.target.value)}><option value="">All employees</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.full_name} · {person.employee_id}</option>)}</select></label>
        <label className="attendance-search">Search name or ID<input type="search" value={range.search} placeholder="Name or employee ID" onChange={(event) => set('search', event.target.value)} /></label>
      </>}
    </div>
    {error && <div className="form-error">{error}</div>}
    {data && <>
      <div className="attendance-summary"><span><strong>{data.summary.marked_present || data.summary.present || 0}</strong> Present</span><span><strong>{data.summary.clocked_in || 0}</strong> Clocked in</span><span><strong>{data.summary.late_count || 0}</strong> Late</span><span><strong>{(data.summary.missing_clock_in || 0) + (data.summary.missing_clock_out || 0)}</strong> Missing clocks</span><span><strong>{formatMinutes(data.summary.work_minutes)}</strong> Worked</span></div>
      <div className="attendance-table-shell"><table className="attendance-table"><thead><tr><th>Date</th><th>Staff</th><th>Shift</th><th>Status</th><th>Worked</th><th>Exceptions</th></tr></thead><tbody>
        {data.rows.map((row) => <tr key={`${row.staff.id}-${row.date}`}><td data-label="Date">{new Date(`${row.date}T00:00:00`).toLocaleDateString()}</td><td data-label="Staff"><strong>{row.staff.full_name}</strong><span>{row.staff.employee_id}</span></td><td data-label="Shift">{row.shift_name || '—'}</td><td data-label="Status"><span className={`attendance-status ${row.status}`}>{STATUS[row.status] || row.status}</span></td><td data-label="Worked">{row.work_minutes ? formatMinutes(row.work_minutes) : '—'}</td><td data-label="Exceptions">{formatExceptions(row)}</td></tr>)}
        {!data.rows.length && <tr><td colSpan="6" className="empty-cell">No attendance matches these filters.</td></tr>}
      </tbody></table></div>
    </>}
  </section>
}
