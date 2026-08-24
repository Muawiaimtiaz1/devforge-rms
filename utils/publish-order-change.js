const db = require('../db/knex');
const salesService = require('../services/SalesService');
const orderRealtime = require('../services/OrderRealtimeService');

async function publishOrderChange(type, saleId, shopId) {
  try {
    const [sale, routedKitchenIds, kitchenStatuses] = await Promise.all([
      db('sales').where({ id: saleId, shop_id: shopId }).first('id', 'kitchen_id', 'updated_at'),
      salesService.getRoutedKitchenIdsForSale(saleId, shopId),
      db.schema.hasTable('kitchen_order_statuses').then(exists => exists
        ? db('kitchen_order_statuses').where({ sale_id: saleId, shop_id: shopId }).pluck('kitchen_id')
        : []),
    ]);
    if (!sale) return false;
    const kitchenIds = [sale.kitchen_id, ...routedKitchenIds, ...kitchenStatuses]
      .map(Number)
      .filter(id => Number.isInteger(id) && id > 0);
    return orderRealtime.publishOrderChange({
      type,
      shopId,
      orderId: sale.id,
      kitchenIds,
      version: sale.updated_at || null,
    });
  } catch (error) {
    console.error(`Realtime ${type} publish failed for order #${saleId}:`, error.message);
    return false;
  }
}

module.exports = publishOrderChange;
