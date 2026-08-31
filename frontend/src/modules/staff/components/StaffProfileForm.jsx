import { useState } from 'react'
import { api } from '../../../api/client'
import { EMPTY_PROFILE, STATUS_LABELS } from '../staff.constants'
import StaffModal from './StaffModal'

export default function StaffProfileForm({ profile, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({ ...EMPTY_PROFILE, ...profile, joining_date: profile?.joining_date ? String(profile.joining_date).slice(0, 10) : '' }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const editing = Boolean(profile?.id)
  function set(field, value) { setForm((current) => ({ ...current, [field]: value })) }

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
      await api(editing ? `/api/staff/${profile.id}` : '/api/staff', { method: editing ? 'PUT' : 'POST', body })
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
    <footer><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save staff member'}</button></footer>
  </form></StaffModal>
}
