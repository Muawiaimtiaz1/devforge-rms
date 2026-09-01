import IngredientRow from './IngredientRow'
import InventoryPagination from './InventoryPagination'

export default function IngredientTable({ stocks, pagination, canAdjust, onPageChange, onRestock, onEdit, onView, loading }) {
  return <section className="inventory-section"><div className="inventory-section-copy"><h2>Raw Ingredients</h2><p>Ingredients consumed by recipe products and add-ons.</p></div><InventoryPagination pagination={pagination} onPageChange={onPageChange} /><div className={`ingredient-table-wrap ${loading ? 'refreshing' : ''}`}><table className="ingredient-table"><thead><tr><th>ID</th><th>Ingredient</th><th>Current Stock</th><th>Minimum</th><th>Batches</th><th>Nearest Expiry</th><th className="align-right">Actions</th></tr></thead><tbody>{stocks.map((stock) => <IngredientRow key={stock.id} stock={stock} canAdjust={canAdjust} onRestock={onRestock} onEdit={onEdit} onView={onView} />)}{!stocks.length && <tr><td colSpan="7" className="inventory-empty">No ingredients found. Start by adding one!</td></tr>}</tbody></table></div></section>
}
