function safeList(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch (_) { return []; }
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}

function changeKey(change) {
  return [
    Number(change.product_id) || 0,
    String(change.name || '').trim().toLowerCase(),
    String(change.product_category || '').trim().toLowerCase(),
    stable(change.variants || []),
    stable(change.addons || []),
    String(change.special_instructions || '').trim(),
  ].join('|');
}

function mergeKitchenChanges(existing, incoming) {
  const merged = new Map();
  for (const change of [...safeList(existing), ...safeList(incoming)]) {
    const quantity = Number(change.quantity || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    const key = changeKey(change);
    const signed = change.change_action === 'remove' ? -quantity : quantity;
    const current = merged.get(key) || { signed: 0, change };
    current.signed += signed;
    current.change = { ...current.change, ...change };
    merged.set(key, current);
  }
  return [...merged.values()].filter(entry => Math.abs(entry.signed) > 0.000001).map(entry => ({
    ...entry.change,
    quantity: Math.abs(entry.signed),
    change_action: entry.signed < 0 ? 'remove' : 'add',
  }));
}

module.exports = { mergeKitchenChanges, safeList };
