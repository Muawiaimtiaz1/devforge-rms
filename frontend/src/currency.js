let shopCurrency = 'PKR'
export function setShopCurrency(code) {
  if (typeof code === 'string' && /^[A-Z]{3}$/.test(code)) shopCurrency = code
}
export function getShopCurrency() {
  return shopCurrency
}
export function formatShopCurrency(value, options = {}) {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: shopCurrency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    ...options,
  }).format(Number(value) || 0)
}