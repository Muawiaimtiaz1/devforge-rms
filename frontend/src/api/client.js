import { setShopCurrency } from '../currency'
export async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detailMessage = Array.isArray(data.details) && data.details.length ? data.details.join(' ') : ''
    const error = new Error(detailMessage || data.error || `Request failed (${response.status})`)
    error.status = response.status
    error.details = data
    throw error
  }
  if (path === '/api/auth/me' && data.user) setShopCurrency(data.user.shop_currency)
  return data
}

export function legacyUrl(path = '/dashboard#lobby') {
  const local = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  return local ? `${window.location.protocol}//${window.location.hostname}:4000${path}` : path
}
