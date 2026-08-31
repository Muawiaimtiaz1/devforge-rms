import { useCallback, useEffect, useState } from 'react'
import { api } from '../../../api/client'
import StaffModal from './StaffModal'
import AttendanceClockPanel from './AttendanceClockPanel'
import AttendanceCalendar from './AttendanceCalendar'
import ShiftTemplateManager from './ShiftTemplateManager'
import WeeklyScheduleEditor from './WeeklyScheduleEditor'
import HolidayManager from './HolidayManager'
import AttendanceCorrectionsPanel from './AttendanceCorrectionsPanel'
import AttendanceSnapshotPanel from './AttendanceSnapshotPanel'
import DailyAttendanceRegister from './DailyAttendanceRegister'

export default function AttendanceWorkspacePanel({ has, onClose, embedded = false }) {
  const [tab, setTab] = useState('overview'); const [staff, setStaff] = useState([]); const [templates, setTemplates] = useState([]); const [error, setError] = useState('')
  const canManage = has('attendance.manage_schedules'); const canApprove = has('attendance.approve'); const canCorrect = has('attendance.correct')
  const load = useCallback(async () => { try { const [staffResult, templateResult] = await Promise.all([api('/api/attendance/staff-options'), api('/api/attendance/templates')]); setStaff(staffResult); setTemplates(templateResult) } catch (requestError) { setError(requestError.message) } }, [])
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer) }, [load])
  const canMarkDaily = has('attendance.mark_daily'); const tabs = [['overview', 'Overview'], ...(canMarkDaily ? [['daily', 'Daily attendance']] : []), ...(canManage ? [['schedules', 'Schedules']] : []), ...(canCorrect || canApprove ? [['corrections', 'Corrections']] : []), ...(canApprove ? [['snapshots', 'Payroll snapshots']] : [])]
  const content = <div className="attendance-workspace">{embedded && <header className="embedded-panel-heading"><div><p className="section-label">Time operations</p><h2>Scheduling & attendance</h2><p>Clock events, daily marking, weekly schedules, exceptions, and audited corrections.</p></div></header>}<nav>{tabs.map(([value, label]) => <button key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{label}</button>)}</nav>{error && <div className="form-error">{error}</div>}{tab === 'overview' && <><AttendanceClockPanel /><AttendanceCalendar staff={staff} canManage={canManage || canApprove} /></>}{tab === 'daily' && canMarkDaily && <DailyAttendanceRegister />}{tab === 'schedules' && canManage && <div className="attendance-config"><ShiftTemplateManager templates={templates} onChanged={load} /><WeeklyScheduleEditor staff={staff} templates={templates} /><HolidayManager /></div>}{tab === 'corrections' && (canCorrect || canApprove) && <AttendanceCorrectionsPanel staff={staff} canApprove={canApprove} />}{tab === 'snapshots' && canApprove && <AttendanceSnapshotPanel />}{!embedded && <footer><button className="secondary-button" onClick={onClose}>Close</button></footer>}</div>
  return embedded ? content : <StaffModal title="Scheduling & attendance" onClose={onClose} wide>{content}</StaffModal>
}
