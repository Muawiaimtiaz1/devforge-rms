const db = require('../db/knex');
const notificationService = require('./NotificationService');
const preferenceService = require('../src/modules/notification-preferences/notification-preferences.service');
const pushNotificationService = require('./PushNotificationService');

class CashDropNotificationService {
  async verifierUsers(shopId, excludeUserId = null) {
    const query = db('users as u').join('user_roles as ur', 'ur.user_id', 'u.id')
      .join('roles as r', 'r.id', 'ur.role_id').join('role_permissions as rp', 'rp.role_id', 'r.id')
      .join('permissions as p', 'p.id', 'rp.permission_id').where('u.shop_id', shopId)
      .where('r.shop_id', shopId).where('p.key', 'register.verify_cash')
      .where((builder) => builder.whereNull('u.status').orWhere('u.status', 'active')).distinct('u.id');
    if (excludeUserId) query.whereNot('u.id', excludeUserId);
    return query;
  }

  async notifyRequested({ shopId, requesterId, amount, note }) {
    const [requester, recipients] = await Promise.all([
      db('users').where({ id: requesterId, shop_id: shopId }).first('name', 'username'),
      this.verifierUsers(shopId, requesterId),
    ]);
    const configuredRecipients = await preferenceService.selection(shopId, 'register.cash_drop_requested');
    const eligibleRecipients = configuredRecipients === null
      ? recipients
      : recipients.filter((recipient) => configuredRecipients.map(Number).includes(Number(recipient.id)));
    const requesterName = requester?.name || requester?.username || 'A staff member';
    const message = `${requesterName} requested a cash drop of Rs. ${Number(amount).toFixed(2)}${note ? ` - ${note}` : ''}.`;
    await Promise.all(eligibleRecipients.map(async (recipient) => {
      await notificationService.create({
        shop_id: shopId, target_user_id: recipient.id, type: 'assignment', priority: 'high',
        title: 'Cash drop awaiting verification', message, action_label: 'Review cash drop',
        action_url: '/dashboard#register', status: 'active',
      }, { id: requesterId, shop_id: shopId });
      await pushNotificationService.sendToUser(recipient.id, {
        title: 'Cash drop awaiting verification', body: message,
        tag: `cash-drop-requested-${shopId}-${requesterId}-${recipient.id}`, url: '/dashboard#register',
      }).catch((error) => console.error(`Cash drop push failed for user ${recipient.id}:`, error.message));
    }));
    return eligibleRecipients.length;
  }
}

module.exports = new CashDropNotificationService();
