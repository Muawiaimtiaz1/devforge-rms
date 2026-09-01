import InventoryModal from './InventoryModal'
import { activeBatches, dateOnly, money, number } from '../inventory.utils'

export default function BatchDetailsModal({ stock, onClose }) {
  const batches = activeBatches(stock)
  const total = batches.reduce((sum, batch) => sum + Number(batch.quantity) * Number(batch.buying_price || 0), 0)
  const today = dateOnly(new Date().toISOString())
  return <InventoryModal onClose={onClose} size="wide" label={`${stock.name} stock batches`}><div className="batch-details"><header><div><p>Stock batches</p><h2>{stock.name}</h2><span>{batches.length} active batch{batches.length === 1 ? '' : 'es'} · {number(stock.current_stock)} {stock.unit} total stock</span></div><button type="button" onClick={onClose} aria-label="Close batch details">×</button></header><div className="stock-value"><span>Total Current Stock Value</span><strong>Rs. {money(total)}</strong></div><div className="batch-details-table"><table><thead><tr><th>Batch</th><th>Remaining</th><th>Buying Price</th><th>Stock Value</th><th>Received</th><th>Expiry</th></tr></thead><tbody>{batches.map((batch) => { const expiry = dateOnly(batch.expiry_date); return <tr key={batch.id}><td>#{batch.id}</td><td>{number(batch.quantity)} {stock.unit}</td><td>Rs. {money(batch.buying_price)}</td><td className="batch-value">Rs. {money(Number(batch.quantity) * Number(batch.buying_price || 0))}</td><td>{dateOnly(batch.created_at) || '—'}</td><td className={expiry && expiry <= today ? 'expiry-expired' : ''}>{expiry || 'Not set'}</td></tr> })}{!batches.length && <tr><td colSpan="6" className="inventory-empty">No active stock batches.</td></tr>}</tbody></table></div><footer><button type="button" className="inventory-cancel" onClick={onClose}>Close</button></footer></div></InventoryModal>
}
