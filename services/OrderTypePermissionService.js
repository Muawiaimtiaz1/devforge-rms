const db = require('../db/knex');

const RESTAURANT_ORDER_TYPES = ['dine_in', 'takeaway', 'delivery'];
const ORDER_TYPES = [...RESTAURANT_ORDER_TYPES, 'walk_in'];

function normalizeOrderTypes(value, shopType = 'restaurant') {
  let source = value;
  if (typeof source === 'string') {
    try { source = JSON.parse(source); } catch { source = source.split(','); }
  }
  const selected = ORDER_TYPES.filter(type => Array.isArray(source) && source.includes(type));
  const normalized = selected.length ? selected : [...RESTAURANT_ORDER_TYPES];
  if (['retail', 'retail_restaurant'].includes(shopType) && !normalized.includes('walk_in')) {
    normalized.push('walk_in');
  }
  return normalized;
}

async function assertOrderTypeAllowed(shopId, orderType, dbInstance = db) {
  const shop = await dbInstance('shops').where({ id: shopId }).select('allowed_order_types', 'shop_type').first();
  if (!normalizeOrderTypes(shop?.allowed_order_types, shop?.shop_type).includes(orderType)) {
    const error = new Error('This order type is not enabled for this shop.');
    error.status = 403;
    throw error;
  }
}

module.exports = { ORDER_TYPES, RESTAURANT_ORDER_TYPES, normalizeOrderTypes, assertOrderTypeAllowed };
