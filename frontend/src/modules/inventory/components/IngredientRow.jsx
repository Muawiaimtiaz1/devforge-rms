import InventoryActionButton from './InventoryActionButton'
import { activeBatches, automaticCode, dateOnly, nearestExpiry, number } from '../inventory.utils'

export default function IngredientRow({ stock, canAdjust, onRestock, onEdit, onView }) {
  const batches = activeBatches(stock)
  const expiry = nearestExpiry(stock)
  const expired = expiry && expiry <= dateOnly(new Date().toISOString())
  const low = Number(stock.current_stock) <= Number(stock.min_stock_level)
  return <tr>
    <td><span className="ingredient-code">{stock.ingredient_code || automaticCode(stock.id)}</span></td>
    <td><strong>{stock.name}</strong>{stock.usage_unit && <small>1 {stock.unit} = {Number(stock.conversion_factor)} {stock.usage_unit}</small>}</td>
    <td><strong className={low ? 'stock-low' : 'stock-ok'}>{number(stock.current_stock)} {stock.unit}</strong>{stock.usage_unit && <small>{number(Number(stock.current_stock) * Number(stock.conversion_factor), 2)} {stock.usage_unit}</small>}</td>
    <td className="table-emphasis">{Number(stock.min_stock_level)} {stock.unit}</td>
    <td><span className="batch-count">{batches.length}</span></td>
    <td className={expired ? 'expiry-expired' : 'table-emphasis'}>{expiry || 'Not set'}</td>
    <td><div className="ingredient-actions">{canAdjust && <><InventoryActionButton onClick={() => onRestock(stock)}>Restock</InventoryActionButton><InventoryActionButton tone="indigo" onClick={() => onEdit(stock)}>Edit</InventoryActionButton></>}<InventoryActionButton onClick={() => onView(stock)} label={`View ${stock.name} batch details`}>View</InventoryActionButton></div></td>
  </tr>
}
