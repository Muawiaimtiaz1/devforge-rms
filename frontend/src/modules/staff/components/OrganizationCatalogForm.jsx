import { useState } from 'react'
import { api } from '../../../api/client'

const LABELS = { departments: 'Department', designations: 'Designation', locations: 'Work location', classifications: 'Classification' }

export default function OrganizationCatalogForm({ options, onCreated }) {
  const [kind, setKind] = useState('departments')
  const [form, setForm] = useState({ name: '', code: '', department_id: '', address: '', is_primary: false })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  async function submit(event) {
    event.preventDefault(); setError(''); setSaving(true)
    try {
      await api('/api/staff/organization/catalog', { method: 'POST', body: { kind, ...form } })
      setForm({ name: '', code: '', department_id: '', address: '', is_primary: false }); await onCreated()
    } catch (requestError) { setError(requestError.message) } finally { setSaving(false) }
  }
  return <form className="organization-catalog-form" onSubmit={submit}>
    <h3>Add organization item</h3>{error && <div className="form-error">{error}</div>}
    <div className="form-grid"><label>Type<select value={kind} onChange={(event) => setKind(event.target.value)}>{Object.entries(LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>{LABELS[kind]} name<input value={form.name} onChange={(event) => set('name', event.target.value)} required /></label></div>
    {kind !== 'designations' && <label>Code<input value={form.code} onChange={(event) => set('code', event.target.value)} required={kind === 'classifications'} /></label>}
    {kind === 'designations' && <label>Department<select value={form.department_id} onChange={(event) => set('department_id', event.target.value)}><option value="">Any department</option>{options.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    {kind === 'locations' && <><label>Address<input value={form.address} onChange={(event) => set('address', event.target.value)} /></label><label className="check-row"><input type="checkbox" checked={form.is_primary} onChange={(event) => set('is_primary', event.target.checked)} /> Primary location</label></>}
    <button className="primary-button" disabled={saving}>{saving ? 'Adding…' : `Add ${LABELS[kind].toLowerCase()}`}</button>
  </form>
}
