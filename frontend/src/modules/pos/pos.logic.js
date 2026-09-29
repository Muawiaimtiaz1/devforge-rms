export const parseList = value => {
  if (Array.isArray(value)) return value
  try { return value ? JSON.parse(value) : [] } catch { return [] }
}

export const isRecipeProduct = product => product?.product_type === 'recipe_based' || parseList(product?.variants).length > 0 || parseList(product?.ingredients).length > 0

export const menuVariants = product => isRecipeProduct(product)
  ? parseList(product?.variants)
  : parseList(product?.stock_variants).filter(variant => variant.is_on_menu).map(variant => ({ ...variant, price:Number(variant.selling_price) }))

export const menuStock = product => {
  if (isRecipeProduct(product)) return Infinity
  const variants = parseList(product?.stock_variants)
  return variants.length ? variants.filter(variant => variant.is_on_menu).reduce((sum, variant) => sum + Number(variant.stock || 0), 0) : Number(product?.stock || 0)
}

export const normalizedNote = value => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 300)

export const cartSelectionKey = item => {
  const variant = item.stock_variant_id || item.variants?.[0]?.id || 'regular'
  const addons = (item.addons || []).map(addon => `${addon.id}:${Number(addon.selection_quantity || 0)}`).sort().join(',')
  return `${item.product_id}|${variant}|${addons}|${normalizedNote(item.special_instructions).toLowerCase()}`
}

export const cartItemStock = item => {
  if (isRecipeProduct(item.product)) return Infinity
  if (item.stock_variant_id) return Number(parseList(item.product?.stock_variants).find(variant => Number(variant.id) === Number(item.stock_variant_id))?.stock || 0)
  return menuStock(item.product)
}

export const isRetailOrder = (user, orderType) => user?.shop_type === 'retail' || orderType === 'walk_in'

export const configuredItemName = item => {
  const variant = parseList(item.variants)[0]?.name
  const addons = parseList(item.addons).map(addon => `${addon.name}${Number(addon.selection_quantity || 1) > 1 ? ` x${addon.selection_quantity}` : ''}`)
  return [item.name || item.product?.name, variant, ...addons].filter(Boolean).join(' · ')
}

export const saleItemPayload = item => ({
  product_id:item.product_id,
  parent_id:item.parent_id || null,
  name:item.name || null,
  quantity:Number(item.quantity),
  selling_price:Number(item.selling_price),
  special_instructions:item.special_instructions || null,
  variants:item.variants || null,
  addons:item.addons || null,
  stock_variant_id:item.stock_variant_id || null,
  batch_id:item.batch_id || null,
})