import { useState } from 'react'
import InventoryModal from './InventoryModal'

export default function IngredientRestockModal({ stock, onClose, onSubmit }) {
  const [form, setForm] = useState({ quantity_usage_unit: '', total_cost: '', expiry_date: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const usageUnit = stock.usage_unit || stock.unit || 'unit'
  const quantity = Number(form.quantity_usage_unit)
  const totalCost = Number(form.total_cost)
  const factor = Number(stock.conversion_factor)
  const largeQuantity = quantity > 0 && factor > 0 ? quantity / factor : 0
  const unitPrice = largeQuantity > 0 && totalCost >= 0 ? totalCost / largeQuantity : 0

  async function submit(event) {
    event.preventDefault()
    if (!Number.isFinite(quantity) || quantity <= 0) return setError(`Enter a valid quantity in ${usageUnit}`)
    if (form.total_cost === '' || !Number.isFinite(totalCost) || totalCost < 0) return setError('Enter a valid total purchase price')
    setBusy(true)
    setError('')
    try {
      await onSubmit({ quantity_usage_unit: quantity, total_cost: totalCost, expiry_date: form.expiry_date || null })
    } catch (requestError) {
      setError(requestError.message)
      setBusy(false)
    }
  }

  return <InventoryModal onClose={onClose} size="small" label="Restock ingredient"><form className="inventory-form" onSubmit={submit}><header><div><h2>Restock Ingredient</h2><p className="modal-kicker">{stock.name}</p></div><button type="button" onClick={onClose} aria-label="Close">×</button></header>{error && <div className="inventory-form-error">{error}</div>}<div className="restock-guide"><span>Enter the delivered quantity in {usageUnit}, not {stock.unit}.</span><span>Enter the total amount paid; unit cost is calculated automatically.</span></div><div className="inventory-form-stack"><label><span>Quantity to Add</span><div className="inventory-input-unit"><input type="number" min="0.001" step="0.001" value={form.quantity_usage_unit} onChange={(event) => setForm({ ...form, quantity_usage_unit: event.target.value })} autoFocus /><strong>{usageUnit}</strong></div></label><label><span>Total Purchase Price</span><div className="inventory-input-unit inventory-input-currency"><input type="number" min="0" step="0.01" value={form.total_cost} onChange={(event) => setForm({ ...form, total_cost: event.target.value })} /><strong>PKR</strong></div></label>{largeQuantity > 0 && form.total_cost !== '' && <div className="restock-preview">Adds <strong>{Number(largeQuantity.toFixed(3))} {stock.unit}</strong> at <strong>PKR {unitPrice.toFixed(2)} per {stock.unit}</strong></div>}<label><span>Expiry Date (Optional)</span><input type="date" value={form.expiry_date} onChange={(event) => setForm({ ...form, expiry_date: event.target.value })} /></label></div><footer><button type="button" className="inventory-cancel" onClick={onClose}>Cancel</button><button type="submit" className="inventory-primary" disabled={busy}>{busy ? 'Adding…' : 'Add Stock'}</button></footer></form></InventoryModal>
}
