import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../../api/client'
import { PAGE_SIZE } from '../inventory.utils'

const EMPTY_PAGE = { items: [], pagination: { page: 1, page_size: PAGE_SIZE, total: 0, total_pages: 1 } }

function matchesExpiry(stock, filter) {
  const today = new Date(); const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return (stock.batches || []).some((batch) => {
    if (Number(batch.quantity) <= 0 || !batch.expiry_date) return false
    const days = Math.ceil((Date.parse(`${String(batch.expiry_date).slice(0, 10)}T00:00:00Z`) - todayUtc) / 86400000)
    return filter === 'expiry-expired' ? days < 0 : days >= 0 && days <= 3
  })
}

function matchesStock(item, filter, stockKey = 'current_stock') {
  const stock = Number(item[stockKey] || 0); const minimum = Number(item.min_stock_level || 0)
  return filter === 'out-of-stock' ? stock <= 0 : stock > 0 && stock <= minimum
}

export default function useInventory(activeTab, search) {
  const [ingredients, setIngredients] = useState(EMPTY_PAGE)
  const [products, setProducts] = useState(EMPTY_PAGE)
  const [ingredientPage, setIngredientPage] = useState(1)
  const [productPage, setProductPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [alertFilter, setAlertFilter] = useState(() => new URLSearchParams(window.location.search).get('alert') || '')
  const requestId = useRef(0)

  const load = useCallback(async ({ quiet = false, nextIngredientPage = ingredientPage, nextProductPage = productPage } = {}) => {
    const id = ++requestId.current
    if (quiet) setRefreshing(true); else setLoading(true)
    setError('')
    const common = { paginate: '1', page_size: String(alertFilter ? 100 : PAGE_SIZE) }
    const ingredientParams = new URLSearchParams({ ...common, page: String(nextIngredientPage) })
    const productParams = new URLSearchParams({ ...common, page: String(nextProductPage), product_type: 'stock_based', exclude_components: '1' })
    if (search.trim()) { ingredientParams.set('search', search.trim()); productParams.set('search', search.trim()) }
    try {
      const ingredientRequest = activeTab !== 'stock' ? api(`/api/raw-stock?${ingredientParams}`) : Promise.resolve(null)
      const productRequest = activeTab !== 'ingredients' ? api(`/api/products?${productParams}`) : Promise.resolve(null)
      const [ingredientResult, productResult] = await Promise.all([ingredientRequest, productRequest])
      if (id !== requestId.current) return
      if (ingredientResult) { setIngredients(ingredientResult); setIngredientPage(Number(ingredientResult.pagination?.page || 1)) }
      if (productResult) { setProducts(productResult); setProductPage(Number(productResult.pagination?.page || 1)) }
    } catch (requestError) { if (id === requestId.current) setError(requestError.message); throw requestError } finally { if (id === requestId.current) { setLoading(false); setRefreshing(false) } }
  }, [activeTab, alertFilter, ingredientPage, productPage, search])

  useEffect(() => {
    const update = (event) => setAlertFilter(String(event.detail || ''))
    window.addEventListener('inventory-alert-filter', update)
    return () => window.removeEventListener('inventory-alert-filter', update)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { setIngredientPage(1); setProductPage(1); load({ nextIngredientPage: 1, nextProductPage: 1 }).catch(() => {}) }, 200)
    return () => window.clearTimeout(timer)
  }, [activeTab, alertFilter, search]) // eslint-disable-line react-hooks/exhaustive-deps

  const changeIngredientPage = useCallback((page) => { setIngredientPage(page); load({ quiet: true, nextIngredientPage: page }).catch(() => {}) }, [load])
  const changeProductPage = useCallback((page) => { setProductPage(page); load({ quiet: true, nextProductPage: page }).catch(() => {}) }, [load])
  const refresh = useCallback(() => load({ quiet: true }), [load])

  const filterPage = (page, predicate) => {
    if (!alertFilter) return page
    const items = (page.items || []).filter(predicate)
    return { items, pagination: { page: 1, page_size: items.length || 1, total: items.length, total_pages: 1 } }
  }
  const visibleIngredients = filterPage(ingredients, (stock) => alertFilter.startsWith('expiry-') ? matchesExpiry(stock, alertFilter) : matchesStock(stock, alertFilter))
  const visibleProducts = filterPage(products, (product) => {
    if (alertFilter.startsWith('expiry-')) return false
    return (product.stock_variants || []).some((variant) => matchesStock(variant, alertFilter, 'stock'))
  })
  return { ingredients: visibleIngredients, products: visibleProducts, loading, refreshing, error, setError, changeIngredientPage, changeProductPage, refresh }
}
