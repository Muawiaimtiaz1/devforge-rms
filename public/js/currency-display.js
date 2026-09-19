function shopCurrencyCode() {
  return window.shopCurrency || 'PKR';
}
function formatShopCurrency(value, options = {}) {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: shopCurrencyCode(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    ...options
  }).format(Number(value) || 0);
}