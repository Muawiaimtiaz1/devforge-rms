import InventoryPagination from './InventoryPagination'
import StockProductRow from './StockProductRow'
import './stock-product-table.css'

export default function StockProductsSection({ products, pagination, canAdjust, canEdit, onPageChange, onRestock, onEdit, onToggleMenu, loading }) {
  return <section className="inventory-section"><div className="inventory-section-copy"><h2>Finished Stock Products</h2><p>Purchase stock here, then publish individual variants to Menu.</p></div><InventoryPagination pagination={pagination} onPageChange={onPageChange} /><div className={`stock-product-table-wrap ${loading ? 'refreshing' : ''}`}><table className="stock-product-table"><thead><tr><th>Product</th><th>Variants</th><th>Total Stock</th><th>Stock Value</th><th className="align-right">Actions</th></tr></thead><tbody>{products.map((product) => <StockProductRow key={product.id} product={product} canAdjust={canAdjust} canEdit={canEdit} onRestock={onRestock} onEdit={onEdit} onToggleMenu={onToggleMenu} />)}{!products.length && <tr><td colSpan="5" className="inventory-empty">No finished stock products yet.</td></tr>}</tbody></table></div></section>
}
