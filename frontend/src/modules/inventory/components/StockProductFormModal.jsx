import { useEffect, useMemo, useState } from 'react'
import { api } from '../../../api/client'
import InventoryModal from './InventoryModal'

const code = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`
const emptyVariant = (isDefault = false) => ({ name: isDefault ? 'Regular' : '', sku: code('VAR'), barcode: '', buying_price: '', selling_price: '', stock: '', min_stock_level: '0', is_default: isDefault, is_on_menu: false })

export default function StockProductFormModal({ product, onClose, onSaved }) {
  const editing = Boolean(product?.id)
  const [brands, setBrands] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [image, setImage] = useState(null)
  const [requestId] = useState(() => crypto.randomUUID?.() || code('product'))
  const [form, setForm] = useState(() => ({
    sku: product?.sku || code('SKU'), name: product?.name || '', category: product?.category || '',
    description: product?.description || '', brand_id: product?.brand_id ? String(product.brand_id) : '',
    variants: product?.stock_variants?.length
      ? product.stock_variants.map((variant) => ({ ...variant, barcode: variant.barcode || '', stock: String(variant.stock ?? 0), buying_price: String(variant.buying_price ?? 0), selling_price: String(variant.selling_price ?? ''), min_stock_level: String(variant.min_stock_level ?? 0) }))
      : [emptyVariant(true)]
  }))

  useEffect(() => {
    let active = true
    Promise.all([api('/api/brands'), api('/api/product-categories')]).then(([rows, categoryRows]) => {
      if (!active) return
      setBrands(Array.isArray(rows) ? rows : [])
      setCategories(Array.isArray(categoryRows) ? categoryRows : [])
      setForm((current) => ({ ...current, brand_id: current.brand_id || String(rows?.[0]?.id || '') }))
    }).catch((requestError) => active && setError(requestError.message)).finally(() => active && setLoading(false))
    return () => { active = false }
  }, [])

  const defaultIndex = useMemo(() => Math.max(form.variants.findIndex((variant) => variant.is_default), 0), [form.variants])
  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const setVariant = (index, field, value) => setForm((current) => ({ ...current, variants: current.variants.map((variant, row) => row === index ? { ...variant, [field]: value } : variant) }))
  const makeDefault = (index) => setForm((current) => ({ ...current, variants: current.variants.map((variant, row) => ({ ...variant, is_default: row === index })) }))
  const removeVariant = (index) => setForm((current) => {
    if (current.variants.length === 1) return current
    const variants = current.variants.filter((_, row) => row !== index)
    if (!variants.some((variant) => variant.is_default)) variants[0] = { ...variants[0], is_default: true }
    return { ...current, variants }
  })

  async function submit(event) {
    event.preventDefault()
    setError('')
    const name = form.name.trim(); const sku = form.sku.trim(); const category = form.category.trim()
    const variants = form.variants.map((variant, index) => ({
      ...(variant.id ? { id: Number(variant.id) } : {}), name: variant.name.trim(), sku: variant.sku.trim(),
      barcode: variant.barcode.trim() || null, buying_price: Number(variant.buying_price), selling_price: Number(variant.selling_price),
      stock: Number(variant.stock || 0), min_stock_level: Number(variant.min_stock_level || 0),
      is_default: index === defaultIndex, is_on_menu: Boolean(variant.is_on_menu)
    }))
    if (!name || !sku || !category || !Number(form.brand_id)) return setError('Product name, SKU, category and brand are required.')
    if (!variants.length || variants.some((variant) => !variant.name || !variant.sku || variant.selling_price <= 0 || variant.buying_price < 0 || variant.stock < 0 || variant.min_stock_level < 0)) return setError('Every variant needs a name, SKU, valid prices, stock and minimum level.')
    if (new Set(variants.map((variant) => variant.name.toLowerCase())).size !== variants.length || new Set(variants.map((variant) => variant.sku.toLowerCase())).size !== variants.length) return setError('Variant names and SKUs must be unique.')

    const payload = new FormData()
    payload.append('sku', sku); payload.append('name', name); payload.append('category', category)
    payload.append('description', form.description.trim()); payload.append('product_type', 'stock_based')
    payload.append('brand_id', form.brand_id); payload.append('barcode', '')
    payload.append('buying_price', String(variants[defaultIndex].buying_price)); payload.append('selling_price', String(variants[defaultIndex].selling_price))
    payload.append('stock', String(variants.reduce((sum, variant) => sum + variant.stock, 0))); payload.append('min_stock_level', '0')
    payload.append('components', '[]'); payload.append('ingredients', '[]'); payload.append('variants', '[]'); payload.append('addons', '[]')
    payload.append('stock_variants', JSON.stringify(variants))
    if (!editing) payload.append('client_request_id', requestId)
    if (image) payload.append('image', image)
    setBusy(true)
    try {
      const response = await fetch(editing ? `/api/products/${product.id}` : '/api/products', { method: editing ? 'PUT' : 'POST', credentials: 'include', headers: { Accept: 'application/json' }, body: payload })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result.error) throw new Error(result.error || `Request failed (${response.status})`)
      await onSaved(editing ? 'Stock product updated' : 'Stock product created')
    } catch (requestError) { setError(requestError.message) } finally { setBusy(false) }
  }

  return <InventoryModal onClose={onClose} size="wide" label={editing ? 'Edit stock product' : 'Add stock product'}><form className="inventory-form stock-product-form" onSubmit={submit}><header><div><h2>{editing ? 'Edit Stock Product' : 'Add Stock Product'}</h2><p>Manage the purchased product and its sellable variants directly in Inventory.</p></div><button type="button" onClick={onClose} aria-label="Close">×</button></header>{error && <div className="inventory-form-error">{error}</div>}{loading ? <div className="inventory-content-loader"><span />Loading product form…</div> : <><div className="inventory-form-grid"><label><span>Product SKU</span><input required value={form.sku} onChange={(event) => setField('sku', event.target.value)} /></label><label><span>Product Name</span><input required autoFocus value={form.name} onChange={(event) => setField('name', event.target.value)} /></label><label><span>Category</span><select required value={form.category} onChange={(event) => setField('category', event.target.value)}><option value="">Select category</option>{form.category && !categories.some((category) => category.name === form.category) && <option value={form.category}>{form.category}</option>}{categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}</select></label><label><span>Brand</span><select required value={form.brand_id} onChange={(event) => setField('brand_id', event.target.value)}><option value="">Select brand</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label><label className="field-wide"><span>Description</span><input value={form.description} onChange={(event) => setField('description', event.target.value)} /></label><label className="field-wide"><span>Product Image (Optional)</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImage(event.target.files?.[0] || null)} /></label></div><section className="stock-variant-editor"><div className="stock-variant-editor-heading"><div><h3>Stock Variants</h3><p>{editing ? 'Use Add Stock to change existing quantities.' : 'Enter the opening quantity for each variant.'}</p></div><button type="button" className="inventory-product-button" onClick={() => setForm((current) => ({ ...current, variants: [...current.variants, emptyVariant(false)] }))}>Add Variant</button></div>{form.variants.map((variant, index) => <div className="stock-variant-editor-row" key={variant.id || index}><div className="stock-variant-editor-row-title"><strong>Variant {index + 1}</strong><label><input type="radio" name="default-variant" checked={index === defaultIndex} onChange={() => makeDefault(index)} /> Default</label><button type="button" onClick={() => removeVariant(index)} disabled={form.variants.length === 1}>Remove</button></div><div className="inventory-form-grid"><label><span>Name</span><input required value={variant.name} onChange={(event) => setVariant(index, 'name', event.target.value)} /></label><label><span>Variant SKU</span><input required value={variant.sku} onChange={(event) => setVariant(index, 'sku', event.target.value)} /></label><label><span>Barcode</span><input value={variant.barcode} onChange={(event) => setVariant(index, 'barcode', event.target.value)} /></label><label><span>Buying Price</span><input type="number" min="0" step="0.01" required value={variant.buying_price} onChange={(event) => setVariant(index, 'buying_price', event.target.value)} /></label><label><span>Selling Price</span><input type="number" min="0.01" step="0.01" required value={variant.selling_price} onChange={(event) => setVariant(index, 'selling_price', event.target.value)} /></label><label><span>{editing ? 'Current Stock' : 'Opening Stock'}</span><input type="number" min="0" step="1" required disabled={editing && Boolean(variant.id)} value={variant.stock} onChange={(event) => setVariant(index, 'stock', event.target.value)} /></label><label><span>Minimum Stock</span><input type="number" min="0" step="1" value={variant.min_stock_level} onChange={(event) => setVariant(index, 'min_stock_level', event.target.value)} /></label><label className="stock-menu-check"><input type="checkbox" checked={Boolean(variant.is_on_menu)} onChange={(event) => setVariant(index, 'is_on_menu', event.target.checked)} /><span>Publish on Menu</span></label></div></div>)}</section></>}<footer><button type="button" className="inventory-cancel" onClick={onClose}>Cancel</button><button type="submit" className="inventory-primary" disabled={busy || loading}>{busy ? 'Saving…' : editing ? 'Save Changes' : 'Create Product'}</button></footer></form></InventoryModal>
}
