export function initials(profile) {
  return String(profile.full_name || profile.username || '?')
    .split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

export function roleName(profile) {
  return profile.roles?.map((role) => role.name).join(', ') || (profile.user_id ? 'Account linked' : 'No login account')
}

export function formatType(value) {
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}
