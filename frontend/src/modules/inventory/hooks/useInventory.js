import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../../api/client'
import { PAGE_SIZE } from '../inventory.utils'

const EMPTY_PAGE = { items: [], pagination: { page: 1, page_size: PAGE_SIZE, total: 0, total_pages: 1 } }

export default function useInventory(activeTab, search) {
  const [ingredients, setIngredients] = useState(EMPTY_PAGE)
  const [products, setProducts] = useState(EMPTY_PAGE)
  const [ingredientPage, setIngredientPage] = useState(1)
  const [productPage, setProductPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const requestId = useRef(0)

  const load = useCallback(async ({ quiet = false, nextIngredientPage = ingredientPage, nextProductPage = productPage } = {}) => {
    const id = ++requestId.current
    if (quiet) setRefreshing(true); else setLoading(true)
    setError('')
    const common = { paginate: '1', page_size: String(PAGE_SIZE) }
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
  }, [activeTab, ingredientPage, productPage, search])

  useEffect(() => {
    const timer = window.setTimeout(() => { setIngredientPage(1); setProductPage(1); load({ nextIngredientPage: 1, nextProductPage: 1 }).catch(() => {}) }, 200)
    return () => window.clearTimeout(timer)
  }, [activeTab, search]) // eslint-disable-line react-hooks/exhaustive-deps

  const changeIngredientPage = useCallback((page) => { setIngredientPage(page); load({ quiet: true, nextIngredientPage: page }).catch(() => {}) }, [load])
  const changeProductPage = useCallback((page) => { setProductPage(page); load({ quiet: true, nextProductPage: page }).catch(() => {}) }, [load])
  const refresh = useCallback(() => load({ quiet: true }), [load])

  return { ingredients, products, loading, refreshing, error, setError, changeIngredientPage, changeProductPage, refresh }
}
