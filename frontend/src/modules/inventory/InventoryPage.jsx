import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { api, legacyUrl } from '../../api/client'
import InventoryHeader from './components/InventoryHeader'
import InventoryToolbar from './components/InventoryToolbar'
import ExpiryNotifications from './components/ExpiryNotifications'
import IngredientTable from './components/IngredientTable'
import StockProductsSection from './components/StockProductsSection'
import InventoryToast from './components/InventoryToast'
import InventorySkeleton from './components/InventorySkeleton'
import useInventory from './hooks/useInventory'
import { expiryWarnings } from './inventory.utils'
import './inventory.css'

const IngredientFormModal = lazy(() => import('./components/IngredientFormModal'))
const IngredientRestockModal = lazy(() => import('./components/IngredientRestockModal'))
const BatchDetailsModal = lazy(() => import('./components/BatchDetailsModal'))
const ProductRestockModal = lazy(() => import('./components/ProductRestockModal'))

export default function InventoryPage() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [toast, setToast] = useState(null)
  const inventory = useInventory(activeTab, search)
  const has = useCallback((permission) => session?.role === 'superadmin' || session?.permissions?.includes(permission), [session])

  useEffect(() => { api('/api/auth/me').then(({ user }) => { const allowed = user.role === 'superadmin' || user.permissions?.some((permission) => permission === 'raw_stock.view' || permission === 'products.view'); if (!allowed) setAuthError('You do not have permission to view Inventory.'); else setSession(user) }).catch((error) => { if (error.status === 401) window.location.replace(legacyUrl('/')); else setAuthError(error.message) }).finally(() => setAuthLoading(false)) }, [])
  useEffect(() => { if (!toast) return undefined; const timer = window.setTimeout(() => setToast(null), 3500); return () => window.clearTimeout(timer) }, [toast])

  function notify(message, type = 'success') { setToast({ message, type }) }
  function legacyProductEditor(action, productId) { sessionStorage.setItem('inventory_product_editor', JSON.stringify({ action, productId })); window.location.assign(legacyUrl('/dashboard#products')) }
  async function createIngredient(payload) { await api('/api/raw-stock', { method: 'POST', body: payload }); setModal(null); notify('Ingredient added!'); await inventory.refresh() }
  async function editIngredient(payload) { await api(`/api/raw-stock/${modal.stock.id}/details`, { method: 'PATCH', body: payload }); setModal(null); notify('Ingredient updated'); await inventory.refresh() }
  async function restockIngredient(payload) { await api(`/api/raw-stock/${modal.stock.id}/stock`, { method: 'PATCH', body: payload }); setModal(null); notify('Stock updated!'); await inventory.refresh() }
  async function restockProduct(variantId, payload) { await api(`/api/products/${modal.product.id}/variants/${variantId}/stock`, { method: 'PATCH', body: payload }); setModal(null); notify('Variant stock updated'); await inventory.refresh() }
  async function toggleMenu(productId, variantId, isOnMenu) { try { await api(`/api/products/${productId}/variants/${variantId}/menu`, { method: 'PATCH', body: { is_on_menu: isOnMenu } }); notify(isOnMenu ? 'Variant published to Menu' : 'Variant removed from Menu'); await inventory.refresh() } catch (error) { notify(error.message, 'error') } }

  if (authLoading) return <InventorySkeleton />
  if (authError) return <main className="inventory-state"><h1>Could not load Inventory</h1><p>{authError}</p><a href="/app/lobby">Return to shop lobby</a></main>
  const ingredients = Array.isArray(inventory.ingredients?.items) ? inventory.ingredients.items : []
  const products = (Array.isArray(inventory.products?.items) ? inventory.products.items : []).filter((product) => product.product_type === 'stock_based' && product.is_component !== 1)
  return <main className="inventory-page"><nav className="inventory-topbar"><a href="/app/lobby">← Shop lobby</a><div><span>{session.shop_name || 'DevForge RMS'}</span><strong>{session.name || session.username}</strong></div></nav><section className="inventory-shell">{inventory.error && <div className="inventory-page-error"><span>{inventory.error}</span><button type="button" onClick={() => inventory.setError('')} aria-label="Dismiss error">×</button></div>}<InventoryHeader canCreateIngredient={has('raw_stock.create')} canCreateProduct={has('products.create')} onAddIngredient={() => setModal({ type: 'add-ingredient' })} onAddProduct={() => legacyProductEditor('add')} /><ExpiryNotifications warnings={expiryWarnings(ingredients)} /><InventoryToolbar active={activeTab} search={search} onTabChange={setActiveTab} onSearchChange={setSearch} />{inventory.loading ? <div className="inventory-content-loader" role="status"><span />Loading inventory…</div> : <>{activeTab !== 'stock' && <IngredientTable stocks={ingredients} pagination={inventory.ingredients.pagination} canAdjust={has('raw_stock.adjust')} onPageChange={inventory.changeIngredientPage} onRestock={(stock) => setModal({ type: 'restock-ingredient', stock })} onEdit={(stock) => setModal({ type: 'edit-ingredient', stock })} onView={(stock) => setModal({ type: 'view-batches', stock })} loading={inventory.refreshing} />}{activeTab !== 'ingredients' && <StockProductsSection products={products} pagination={inventory.products.pagination} canAdjust={has('products.adjust_stock')} canEdit={has('products.update')} onPageChange={inventory.changeProductPage} onRestock={(product) => setModal({ type: 'restock-product', product })} onEdit={(product) => legacyProductEditor('edit', product.id)} onToggleMenu={toggleMenu} loading={inventory.refreshing} />}</>}</section><Suspense fallback={<div className="inventory-modal-loading" role="status">Loading form…</div>}>{modal?.type === 'add-ingredient' && <IngredientFormModal onClose={() => setModal(null)} onSubmit={createIngredient} />}{modal?.type === 'edit-ingredient' && <IngredientFormModal stock={modal.stock} onClose={() => setModal(null)} onSubmit={editIngredient} />}{modal?.type === 'restock-ingredient' && <IngredientRestockModal stock={modal.stock} onClose={() => setModal(null)} onSubmit={restockIngredient} />}{modal?.type === 'view-batches' && <BatchDetailsModal stock={modal.stock} onClose={() => setModal(null)} />}{modal?.type === 'restock-product' && <ProductRestockModal product={modal.product} onClose={() => setModal(null)} onSubmit={restockProduct} />}</Suspense><InventoryToast toast={toast} onDismiss={() => setToast(null)} /></main>
}
