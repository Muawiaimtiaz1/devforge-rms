import { useState } from 'react'
import InventoryModal from './InventoryModal'

export default function IngredientRestockModal({ stock, onClose, onSubmit }) {
  const [form, setForm] = useState({ delta: '', buying_price: '', expiry_date: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) { event.preventDefault(); const delta = Number(form.delta); if (!Number.isFinite(delta) || delta <= 0) return setError('Quantity required'); setBusy(true); setError(''); try { await onSubmit({ delta, buying_price: form.buying_price === '' ? 0 : Number(form.buying_price), expiry_date: form.expiry_date || null }) } catch (requestError) { setError(requestError.message); setBusy(false) } }
  return <InventoryModal onClose={onClose} size="small" label="Restock ingredient"><form className="inventory-form" onSubmit={submit}><header><div><h2>Restock Ingredient</h2><p className="modal-kicker">{stock.name}</p></div><button type="button" onClick={onClose} aria-label="Close">×</button></header>{error && <div className="inventory-form-error">{error}</div>}<div className="inventory-form-stack"><label><span>Quantity to Add</span><input type="number" min="0.001" step="0.001" value={form.delta} onChange={(event) => setForm({ ...form, delta: event.target.value })} /></label><label><span>Buying Price</span><input type="number" min="0" step="0.01" value={form.buying_price} onChange={(event) => setForm({ ...form, buying_price: event.target.value })} /></label><label><span>Expiry Date (Optional)</span><input type="date" value={form.expiry_date} onChange={(event) => setForm({ ...form, expiry_date: event.target.value })} /></label></div><footer><button type="button" className="inventory-cancel" onClick={onClose}>Cancel</button><button type="submit" className="inventory-primary" disabled={busy}>{busy ? 'Updating…' : 'Update Stock'}</button></footer></form></InventoryModal>
}
