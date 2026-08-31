import { useCallback, useEffect, useState } from 'react'
import { api } from '../../../api/client'

const displayTime = (value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const shiftLabel = (shift) => `${shift.name} · ${String(shift.start_time).slice(0, 5)}–${String(shift.end_time).slice(0, 5)}${shift.register_id ? ' · Attendance started' : ''}`

export default function ShiftAttendanceRegister() {
  const [data, setData] = useState(null), [shiftId, setShiftId] = useState(''), [error, setError] = useState(''), [savingStaffId, setSavingStaffId] = useState(null)
  const load = useCallback(async (selectedShift = shiftId) => {
    try { setError(''); const result = await api(`/api/attendance/shift-register${selectedShift ? `?shift_template_id=${selectedShift}` : ''}`); setData(result); if (!selectedShift && result.shifts.length) setShiftId(String(result.shifts[0].id)) }
    catch (requestError) { setError(requestError.message) }
  }, [shiftId])
  useEffect(() => { const timer = window.setTimeout(() => load(), 0); return () => window.clearTimeout(timer) }, [load])

  async function markPresent(person) {
    setSavingStaffId(person.id); setError('')
    try { await api(`/api/attendance/shift-register/staff/${person.id}`, { method: 'POST', body: { shift_template_id: Number(shiftId), attendance_status: 'present', reason: 'Employee arrived and was marked present', idempotency_key: window.crypto.randomUUID() } }); await load(shiftId) }
    catch (requestError) { setError(requestError.message) } finally { setSavingStaffId(null) }
  }
  async function clockOut(person) {
    if (!data?.shift?.register_id) return
    setSavingStaffId(person.id); setError('')
    try { await api(`/api/attendance/shift-register/${data.shift.register_id}/staff/${person.id}/clock-out`, { method: 'POST', body: { idempotency_key: window.crypto.randomUUID() } }); await load(shiftId) }
    catch (requestError) { setError(requestError.message) } finally { setSavingStaffId(null) }
  }

  return <section className="daily-register shift-register">
    <header><div><h3>Today’s shift attendance</h3><p>Mark an employee present when they arrive, then mark them out when they leave. Final status is calculated from worked time.</p></div><div className="shift-register-context"><span><strong>Business date</strong>{data?.business_date || 'Loading…'}</span><span><strong>Timezone</strong>{data?.timezone || '—'}</span></div></header>
    {error && <div className="form-error">{error}</div>}
    <div className="daily-register-tools"><label>Shift<select value={shiftId} onChange={(event) => setShiftId(event.target.value)}>{!data?.shifts?.length && <option value="">No assigned shifts today</option>}{data?.shifts?.map((shift) => <option key={shift.id} value={shift.id}>{shiftLabel(shift)}</option>)}</select></label></div>
    <div className="info-banner">75%+ worked = Present · 50–74.99% = Half day · below 50% after attending = Less than half day · no clock-in by shift end = Absent. Approved leave comes from Leave Management.</div>
    <div className="daily-register-list">
      <div className="daily-register-row daily-register-head"><span>Employee</span><span>Department</span><span>Attendance</span><span>Time control</span></div>
      {data?.staff?.map((person) => <div className="daily-register-row" key={person.id}>
        <span><strong>{person.full_name}</strong><small>{person.employee_id}</small></span><span>{person.department || person.designation || '—'}</span>
        <span className="person-attendance-control">{person.mark ? <strong className="attendance-recorded">Attendance recorded</strong> : <button className="primary-button" type="button" disabled={savingStaffId === person.id} onClick={() => markPresent(person)}>{savingStaffId === person.id ? 'Marking…' : 'Mark present'}</button>}</span>
        <span className="shift-time-control">{person.mark ? <><small>In: {person.clock_in_at ? displayTime(person.clock_in_at) : 'Pending'}</small>{person.clock_out_at ? <small>Out: {displayTime(person.clock_out_at)}</small> : <button className="danger-button" type="button" disabled={savingStaffId === person.id} onClick={() => clockOut(person)}>Mark out</button>}</> : <small>Waiting for arrival</small>}</span>
      </div>)}
      {data && shiftId && !data.staff.length && <div className="empty-state">No employees are assigned to this shift today.</div>}
    </div>
  </section>
}
