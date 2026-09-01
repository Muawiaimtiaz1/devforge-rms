import { useState } from 'react'
import InventoryActionButton from './InventoryActionButton'
import { money, number } from '../inventory.utils'

function StockVariantRow({ productId, variant, canEdit, onToggleMenu }) {
  const low = Number(variant.stock) <= Number(variant.min_stock_level)
  return <tr className="stock-variant-row"><td><strong>{variant.name}</strong><small>{variant.sku}{variant.barcode ? ` · ${variant.barcode}` : ''}</small></td><td><strong className={low ? 'stock-low' : 'stock-ok'}>{number(variant.stock)} in stock</strong><small>Minimum {number(variant.min_stock_level)}</small></td><td><strong>Rs. {money(variant.buying_price)}</strong><small>Buying price</small></td><td><strong>Rs. {money(variant.selling_price)}</strong><small>Selling price</small></td><td><span className={variant.is_on_menu ? 'menu-status published' : 'menu-status'}>{variant.is_on_menu ? 'On menu' : 'Not published'}</span></td><td>{canEdit && <button type="button" className={variant.is_on_menu ? 'variant-menu-button remove-menu' : 'variant-menu-button publish-menu'} onClick={() => onToggleMenu(productId, variant.id, !variant.is_on_menu)}>{variant.is_on_menu ? 'Remove from Menu' : 'Publish to Menu'}</button>}</td></tr>
}

export default function StockProductRow({ product, canAdjust, canEdit, onRestock, onEdit, onToggleMenu }) {
  const [expanded, setExpanded] = useState(false)
  const variants = product.stock_variants || []
  const totalStock = variants.reduce((sum, variant) => sum + Number(variant.stock || 0), 0)
  const totalValue = variants.reduce((sum, variant) => sum + Number(variant.stock || 0) * Number(variant.buying_price || 0), 0)
  const lowVariants = variants.filter((variant) => Number(variant.stock) <= Number(variant.min_stock_level)).length
  return <><tr className="stock-product-row"><td><button type="button" className="stock-product-name" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}><span>{expanded ? '−' : '+'}</span><span><strong>{product.name}</strong><small>{product.category}</small></span></button></td><td><span className="batch-count">{variants.length}</span></td><td><strong className={lowVariants ? 'stock-low' : 'stock-ok'}>{number(totalStock)}</strong>{lowVariants > 0 && <small>{lowVariants} low-stock variant{lowVariants === 1 ? '' : 's'}</small>}</td><td><strong>Rs. {money(totalValue)}</strong><small>At buying price</small></td><td><div className="ingredient-actions">{canAdjust && <InventoryActionButton tone="primary" onClick={() => onRestock(product)}>Add Stock</InventoryActionButton>}{canEdit && <InventoryActionButton onClick={() => onEdit(product)}>Edit</InventoryActionButton>}<InventoryActionButton onClick={() => setExpanded((value) => !value)}>{expanded ? 'Hide' : 'View'}</InventoryActionButton></div></td></tr>{expanded && <tr className="stock-product-expanded"><td colSpan="5"><div className="stock-variant-table-wrap"><table className="stock-variant-table"><thead><tr><th>Variant</th><th>Stock</th><th>Cost Price</th><th>Selling Price</th><th>Menu Status</th><th>Action</th></tr></thead><tbody>{variants.map((variant) => <StockVariantRow key={variant.id} productId={product.id} variant={variant} canEdit={canEdit} onToggleMenu={onToggleMenu} />)}{!variants.length && <tr><td colSpan="6" className="inventory-empty">No active variants.</td></tr>}</tbody></table></div></td></tr>}</>
}
