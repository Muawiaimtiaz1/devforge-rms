import { useEffect, useState } from 'react'
import { api } from '../../../api/client'
import { EMPTY_PROFILE, STATUS_LABELS } from '../staff.constants'
import StaffModal from './StaffModal'
import StaffSalarySection from './StaffSalarySection'

function todayInKarachi() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const part = (type) => parts.find((value) => value.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
function emptySalary(editing) { return { compensation_type: 'monthly', currency: 'PKR', base_amount: '', effective_from: todayInKarachi(), standard_monthly_minutes: 10400, overtime_enabled: false, overtime_multiplier: '1.500', monthly_unpaid_absence_policy: 'prorate_scheduled_days', paid_full_leave_allowance: 0, paid_half_leave_allowance: 0, deduct_excess_paid_leave: true, change_reason: editing ? 'Salary raise or policy change' : 'New employee salary' } }

export default function StaffProfileForm({ profile, onClose, onSaved, canEditSalary }) {
  const [form, setForm] = useState(() => ({ ...EMPTY_PROFILE, ...profile, joining_date: profile?.joining_date ? String(profile.joining_date).slice(0, 10) : '' }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const editing = Boolean(profile?.id)
  const [savedStaffId, setSavedStaffId] = useState(profile?.id || null)
  const [salary, setSalary] = useState(() => emptySalary(editing))
  const [salaryEnabled, setSalaryEnabled] = useState(() => canEditSalary && !editing)
  const [salaryHistory, setSalaryHistory] = useState([])
  const [currentSalary, setCurrentSalary] = useState(null)
  const [salaryLoading, setSalaryLoading] = useState(Boolean(editing && canEditSalary))
  function set(field, value) { setForm((current) => ({ ...current, [field]: value })) }

  useEffect(() => {
    if (!editing || !canEditSalary) return undefined
    let active = true
    api(`/api/payroll/staff/${profile.id}/salary`).then((result) => { if (active) { setSalaryHistory(result.history || []); setCurrentSalary(result.current || null); if (result.current) setSalary((current) => ({ ...current, compensation_type: result.current.compensation_type, currency: result.current.currency, base_amount: result.current.base_amount, standard_monthly_minutes: result.current.standard_monthly_minutes || 10400, overtime_enabled: result.current.overtime_enabled, overtime_multiplier: result.current.overtime_multiplier, monthly_unpaid_absence_policy: result.current.monthly_unpaid_absence_policy, paid_full_leave_allowance: result.current.paid_full_leave_allowance, paid_half_leave_allowance: result.current.paid_half_leave_allowance, deduct_excess_paid_leave: result.current.deduct_excess_paid_leave })) } }).catch((requestError) => { if (active) setError(requestError.message) }).finally(() => { if (active) setSalaryLoading(false) })
    return () => { active = false }
  }, [editing, canEditSalary, profile?.id])

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (!form.full_name.trim()) return setError('Full name is required.')
    const body = Object.fromEntries(Object.keys(EMPTY_PROFILE).map((key) => {
      const value = form[key]
      return [key, typeof value === 'string' ? value.trim() : value]
    }))
    try {
      setSaving(true)
      const targetId = savedStaffId
      const savedProfile = await api(targetId ? `/api/staff/${targetId}` : '/api/staff', { method: targetId ? 'PUT' : 'POST', body })
      const staffId = targetId || savedProfile.id
      setSavedStaffId(staffId)
      if (canEditSalary && salaryEnabled) {
        try { await api(`/api/payroll/staff/${staffId}/salary`, { method: 'POST', body: salary }) }
        catch (salaryError) { setError(`Staff profile saved, but salary was not saved: ${salaryError.message}`); await onSaved(); return }
      }
      await onSaved()
      onClose()
    } catch (requestError) { setError(requestError.message) } finally { setSaving(false) }
  }

  return <StaffModal title={editing ? 'Edit staff profile' : 'Add staff profile'} onClose={onClose} wide><form className="staff-form" onSubmit={submit}>
    {error && <div className="form-error">{error}</div>}
    <div className="form-grid"><label>Full name<input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} required /></label><label>Employee ID<input value={form.employee_id || ''} placeholder="Generated automatically" onChange={(e) => set('employee_id', e.target.value)} /></label></div>
    <div className="form-grid"><label>Email<input type="email" value={form.email || ''} onChange={(e) => set('email', e.target.value)} /></label><label>Phone<input value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} /></label></div>
    <label>Address<input value={form.address || ''} onChange={(e) => set('address', e.target.value)} /></label>
    <div className="form-grid"><label>Emergency contact<input value={form.emergency_contact_name || ''} onChange={(e) => set('emergency_contact_name', e.target.value)} /></label><label>Emergency phone<input value={form.emergency_contact_phone || ''} onChange={(e) => set('emergency_contact_phone', e.target.value)} /></label></div>
    <div className="form-grid"><label>Department<input value={form.department || ''} onChange={(e) => set('department', e.target.value)} /></label><label>Designation<input value={form.designation || ''} onChange={(e) => set('designation', e.target.value)} /></label></div>
    <div className="form-grid"><label>Employment type<select value={form.employment_type} onChange={(e) => set('employment_type', e.target.value)}><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="contract">Contract</option><option value="temporary">Temporary</option></select></label><label>Joining date<input type="date" value={form.joining_date || ''} onChange={(e) => set('joining_date', e.target.value)} /></label></div>
    <label>Employment status<select value={form.employment_status} onChange={(e) => set('employment_status', e.target.value)}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>Photo URL<input type="url" value={form.photo_url || ''} onChange={(e) => set('photo_url', e.target.value)} /></label>
    <label>Notes<textarea rows="4" value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} /></label>
    {canEditSalary && <StaffSalarySection salary={salary} setSalary={setSalary} enabled={salaryEnabled} setEnabled={setSalaryEnabled} editing={editing} loading={salaryLoading} current={currentSalary} history={salaryHistory} />}
    <footer><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save staff member'}</button></footer>
  </form></StaffModal>
}
