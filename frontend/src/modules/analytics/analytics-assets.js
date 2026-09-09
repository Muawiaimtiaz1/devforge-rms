import { legacyUrl } from '../../api/client'

export function analyticsAssetUrl(value) {
  if (/^(?:https?:|data:|blob:)/i.test(value)) return value
  return legacyUrl(value.startsWith('/') ? value : '/' + value)
}
