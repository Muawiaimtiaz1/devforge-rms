const db = require('../db/knex');
const preferenceService = require('../src/modules/notification-preferences/notification-preferences.service');
const pushNotificationService = require('./PushNotificationService');

function dateKey(value) {
  if (typeof value === 'string') {
    const isoDate = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoDate) return isoDate[1];
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

class ExpiryNotificationService {
  // Item-level expiry-${expired ? 'expired' : 'near'} alerts were replaced by daily summaries.
  async syncForUser(user, permissions = []) {
    const shopId = Number(user?.shop_id);
    const canViewIngredients = permissions.includes('raw_stock.view');
    const canViewProducts = permissions.includes('products.view');
    if (!Number.isInteger(shopId) || shopId <= 0 || (!canViewIngredients && !canViewProducts)) return 0;

    let created = 0;
    if (canViewIngredients) created += await this.syncExpiry(user, shopId);
    created += await this.syncOutOfStock(user, shopId, { canViewIngredients, canViewProducts });
    return created;
  }

  async syncExpiry(user, shopId) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const reportDate = dateKey(today);
    const warningEnd = new Date(today);
    // The previous window used getUTCDate() + 4; alerts now begin three days before expiry.
    warningEnd.setUTCDate(warningEnd.getUTCDate() + 3);

    const batches = await db('raw_stock_batches as b')
      .join('raw_stocks as rs', 'rs.id', 'b.raw_stock_id')
      .where('b.shop_id', shopId)
      .where('rs.shop_id', shopId)
      .where('rs.is_deleted', 0)
      .where('b.quantity', '>', 0)
      .whereNotNull('b.expiry_date')
      .where('b.expiry_date', '<=', dateKey(warningEnd))
      .select('b.id', 'b.quantity', 'b.expiry_date', 'rs.name', 'rs.unit');

    const alertTypes = new Set(batches.flatMap((batch) => {
      const expiryDate = dateKey(batch.expiry_date);
      if (!expiryDate) return [];
      const daysLeft = Math.round((Date.parse(`${expiryDate}T00:00:00Z`) - today.getTime()) / 86400000);
      return [daysLeft < 0 ? 'expired' : 'near'];
    }));
    const [nearSelection, expiredSelection] = await Promise.all([
      preferenceService.selection(shopId, 'inventory.expiry_near'),
      preferenceService.selection(shopId, 'inventory.expired'),
    ]);
    const alerts = [...alertTypes].map((type) => type === 'expired' ? {
      alert_key: 'inventory.expired', action_url: `/app/inventory?alert=expiry-expired&report_date=${reportDate}`,
      title: 'Inventory expiry alert', message: 'Check your inventory for expired items.', priority: 'urgent',
    } : {
      alert_key: 'inventory.expiry_near', action_url: `/app/inventory?alert=expiry-near&report_date=${reportDate}`,
      title: 'Inventory expiry warning', message: 'Check your inventory for items near expiry.', priority: 'high',
    });
    const filteredAlerts = alerts.filter((alert) => {
      const selected = alert.alert_key === 'inventory.expired' ? expiredSelection : nearSelection;
      return selected === null || selected.map(Number).includes(Number(user.id));
    });
    return this.reconcile(user, shopId, filteredAlerts, [
      '/app/inventory?alert=expiry-%',
      '/app/inventory?expiry_batch=%',
    ]);
  }

  async syncOutOfStock(user, shopId, access) {
    const alertTypes = new Set();
    if (access.canViewIngredients) {
      const ingredients = await db('raw_stocks')
        .where({ shop_id: shopId, is_deleted: 0 })
        .whereRaw('current_stock <= min_stock_level')
        .select('id', 'name', 'unit', 'current_stock', 'min_stock_level');
      ingredients.forEach((item) => {
        const out = Number(item.current_stock) <= 0;
        alertTypes.add(out ? 'out' : 'low');
      });
    }

    if (access.canViewProducts) {
      const variants = await db('product_stock_variants as variant')
        .join('products as product', 'product.id', 'variant.product_id')
        .where('variant.shop_id', shopId)
        .where('product.shop_id', shopId)
        .where('product.is_deleted', 0)
        .where('product.product_type', 'stock_based')
        .where('variant.is_active', true)
        .whereRaw('variant.stock <= variant.min_stock_level')
        .select('variant.id', 'variant.product_id', 'variant.name as variant_name', 'variant.stock', 'variant.min_stock_level', 'product.name as product_name');
      variants.forEach((variant) => {
        const out = Number(variant.stock) <= 0;
        alertTypes.add(out ? 'out' : 'low');
      });
    }

    const [lowSelection, outSelection] = await Promise.all([
      preferenceService.selection(shopId, 'inventory.low_stock'),
      preferenceService.selection(shopId, 'inventory.out_of_stock'),
    ]);
    const reportDate = dateKey(new Date());
    const alerts = [...alertTypes].map((type) => type === 'out' ? {
      alert_key: 'inventory.out_of_stock', action_url: `/app/inventory?alert=out-of-stock&report_date=${reportDate}`,
      title: 'Inventory stock alert', message: 'Check your inventory for out-of-stock items.', priority: 'urgent',
    } : {
      alert_key: 'inventory.low_stock', action_url: `/app/inventory?alert=low-stock&report_date=${reportDate}`,
      title: 'Inventory stock warning', message: 'Check your inventory for items that are near out of stock.', priority: 'high',
    });
    const filteredAlerts = alerts.filter((alert) => {
      const selected = alert.alert_key === 'inventory.out_of_stock' ? outSelection : lowSelection;
      return selected === null || selected.map(Number).includes(Number(user.id));
    });
    return this.reconcile(user, shopId, filteredAlerts, [
      '/app/inventory?alert=out-of-stock%',
      '/app/inventory?alert=low-stock%',
    ]);
  }

  async reconcile(user, shopId, alerts, actionPatterns) {
    const active = await db('notifications')
      .where({ shop_id: shopId, target_user_id: user.id, status: 'active', type: 'inventory' })
      .where(function () {
        actionPatterns.forEach((pattern, index) => {
          if (index === 0) this.where('action_url', 'like', pattern);
          else this.orWhere('action_url', 'like', pattern);
        });
      })
      .select('id', 'action_url');
    const currentUrls = new Set(alerts.map((alert) => alert.action_url));
    const staleIds = active.filter((row) => !currentUrls.has(row.action_url)).map((row) => row.id);
    if (staleIds.length) await db('notifications').whereIn('id', staleIds).update({ status: 'archived', updated_at: db.fn.now() });

    const existingUrls = new Set(active.map((row) => row.action_url));
    const newAlerts = alerts.filter((alert) => !existingUrls.has(alert.action_url));
    const rows = newAlerts.map((alert) => ({
      shop_id: shopId, target_user_id: user.id, created_by_user_id: user.id,
      type: 'inventory', priority: alert.priority || 'high', title: alert.title, message: alert.message,
      action_label: 'Open inventory', action_url: alert.action_url, due_at: alert.due_at || null,
      status: 'active', created_at: db.fn.now(), updated_at: db.fn.now(),
    }));
    if (rows.length) {
      await db('notifications').insert(rows);
      await Promise.all(newAlerts.map((alert) => pushNotificationService.sendToUser(user.id, {
        title: alert.title, body: alert.message, tag: `inventory-${alert.alert_key}-${user.id}-${alert.action_url}`,
        url: alert.action_url,
      }).catch((error) => console.error(`Inventory alert push failed for user ${user.id}:`, error.message))));
    }
    return rows.length;
  }

}

module.exports = new ExpiryNotificationService();
module.exports.dateKey = dateKey;
