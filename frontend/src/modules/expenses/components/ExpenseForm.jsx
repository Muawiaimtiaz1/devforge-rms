import { useState } from 'react'
import { getShopCurrency } from '../../../currency'

export default function ExpenseForm({ expense, categories, onSave, onCancel }) {
  const [form, setForm] = useState(() => ({ title: expense?.title || '', category: expense?.category || categories[0]?.name || 'Restaurant Expense', amount: expense?.amount || '', date: String(expense?.date || new Date().toISOString().slice(0, 10)).slice(0, 10), note: expense?.note || '' }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }))
  async function submit(event) {
    event.preventDefault()
    if (!form.title.trim() || !(Number(form.amount) > 0)) return setError('Title and amount required')
    try { setSaving(true); setError(''); await onSave({ ...form, title: form.title.trim(), note: form.note.trim(), amount: Number(form.amount) }) }
    catch (requestError) { setError(requestError.message) } finally { setSaving(false) }
  }
  return <form className="expense-form" onSubmit={submit}>
    {error && <div className="expense-error" role="alert">{error}</div>}
    <label>Title *<input autoFocus value={form.title} onChange={event => update('title', event.target.value)} placeholder="e.g. Electricity Bill" /></label>
    <div className="expense-form-grid"><label>Category<select value={form.category} onChange={event => update('category', event.target.value)}>{categories.map(category => <option key={category.name} value={category.name}>{category.emoji || ''} {category.name}</option>)}</select></label><label>Date<input type="date" value={form.date} onChange={event => update('date', event.target.value)} /></label></div>
    <label>Amount ({getShopCurrency()}) *<input type="number" min="0" step="0.01" value={form.amount} onChange={event => update('amount', event.target.value)} placeholder="0" /></label>
    <label>Note (optional)<textarea rows="3" value={form.note} onChange={event => update('note', event.target.value)} placeholder="Add some details..." /></label>
    <div className="expense-form-actions">{onCancel && <button type="button" onClick={onCancel}>Cancel</button>}<button className="primary" disabled={saving}>{saving ? 'Saving...' : expense ? 'Update Expense' : 'Save Expense'}</button></div>
  </form>
}
