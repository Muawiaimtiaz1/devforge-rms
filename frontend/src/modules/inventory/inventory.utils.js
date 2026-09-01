export const PURCHASE_UNITS = ['kg', 'liter', 'piece', 'packet', 'box', 'dozen', 'bag', 'crate', 'lb']
export const USAGE_UNITS = ['g', 'ml', 'piece', 'mg', 'oz', 'lb']
export const PAGE_SIZE = 20

export function number(value, digits = 3) {
  return Number(Number(value || 0).toFixed(digits))
}

export function money(value) {
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function dateOnly(value) {
  return value ? String(value).slice(0, 10) : ''
}

export function automaticCode(id) {
  return `ING-${String(id).padStart(5, '0')}`
}

export function activeBatches(stock) {
  return (stock?.batches || []).filter((batch) => Number(batch.quantity) > 0)
}

export function nearestExpiry(stock) {
  return activeBatches(stock).map((batch) => dateOnly(batch.expiry_date)).filter(Boolean).sort()[0] || ''
}

export function expiryWarnings(stocks) {
  const now = new Date()
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return stocks.flatMap((stock) => activeBatches(stock)
    .filter((batch) => batch.expiry_date)
    .map((batch) => ({
      id: `${stock.id}-${batch.id}`,
      name: stock.name,
      unit: stock.unit,
      quantity: Number(batch.quantity),
      daysLeft: Math.ceil((Date.parse(`${dateOnly(batch.expiry_date)}T00:00:00Z`) - todayUtc) / 86400000),
    })))
    .filter((item) => Number.isFinite(item.daysLeft) && item.daysLeft <= 4)
    .sort((a, b) => a.daysLeft - b.daysLeft)
}

export function unitDefaults(unit) {
  if (unit === 'kg') return { usage_unit: 'g', conversion_factor: 1000 }
  if (unit === 'liter') return { usage_unit: 'ml', conversion_factor: 1000 }
  if (unit === 'dozen') return { usage_unit: 'piece', conversion_factor: 12 }
  if (unit === 'lb') return { usage_unit: 'oz', conversion_factor: 16 }
  return { usage_unit: 'piece', conversion_factor: 1 }
}
