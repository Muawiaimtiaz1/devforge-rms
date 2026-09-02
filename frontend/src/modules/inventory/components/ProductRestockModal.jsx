import { useState } from 'react'
import InventoryModal from './InventoryModal'

export default function ProductRestockModal({ product, onClose, onSubmit }) {
  const variants = product.stock_variants || []
  const [form, setForm] = useState({ variantId: String(variants[0]?.id || ''), delta: '', buying_price: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) { event.preventDefault(); const delta = Number(form.delta); if (!form.variantId) return setError('Select a variant'); if (!Number.isInteger(delta) || delta <= 0) return setError('Enter a whole number of units'); setBusy(true); setError(''); try { await onSubmit(Number(form.variantId), { delta, buying_price: form.buying_price === '' ? undefined : Number(form.buying_price) }) } catch (requestError) { setError(requestError.message); setBusy(false) } }
  return <InventoryModal onClose={onClose} size="small" label="Add product stock"><form className="inventory-form" onSubmit={submit}><header><div><h2>Add Stock</h2><p>{product.name}</p></div><button type="button" onClick={onClose} aria-label="Close">×</button></header>{error && <div className="inventory-form-error">{error}</div>}<div className="inventory-form-stack"><label><span>Which variant are you restocking?</span><select value={form.variantId} onChange={(event) => setForm({ ...form, variantId: event.target.value })}>{variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name} — {Number(variant.stock)} currently</option>)}</select></label><label><span>Quantity to add (units)</span><input type="number" min="1" step="1" value={form.delta} onChange={(event) => setForm({ ...form, delta: event.target.value })} /></label><label><span>Buying price per unit</span><input type="number" min="0" step="0.01" value={form.buying_price} onChange={(event) => setForm({ ...form, buying_price: event.target.value })} /></label></div><footer><button type="button" className="inventory-cancel" onClick={onClose}>Cancel</button><button type="submit" className="inventory-primary" disabled={busy}>{busy ? 'Adding…' : 'Add Stock'}</button></footer></form></InventoryModal>
}
