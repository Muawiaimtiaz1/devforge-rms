const webpush = require('web-push');
const db = require('../db/knex');

class PushNotificationService {
  async ensureSchema() {
    if (!(await db.schema.hasTable('push_settings'))) {
      await db.schema.createTable('push_settings', table => {
        table.string('key').primary();
        table.text('value').notNullable();
      });
    }
    if (!(await db.schema.hasTable('push_subscriptions'))) {
      await db.schema.createTable('push_subscriptions', table => {
        table.increments('id').primary();
        table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.integer('shop_id').nullable().references('id').inTable('shops').onDelete('CASCADE');
        table.text('endpoint').notNullable().unique();
        table.text('p256dh').notNullable();
        table.text('auth').notNullable();
        table.string('device_name', 200).nullable();
        table.boolean('enabled').notNullable().defaultTo(true);
        table.timestamp('created_at').defaultTo(db.fn.now());
        table.timestamp('updated_at').defaultTo(db.fn.now());
        table.index(['user_id', 'enabled']);
      });
    }
    await this.configureVapid();
  }

  async configureVapid() {
    let publicKey = process.env.VAPID_PUBLIC_KEY;
    let privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) {
      const rows = await db('push_settings').whereIn('key', ['vapid_public_key', 'vapid_private_key']);
      const saved = Object.fromEntries(rows.map(row => [row.key, row.value]));
      publicKey = publicKey || saved.vapid_public_key;
      privateKey = privateKey || saved.vapid_private_key;
    }
    if (!publicKey || !privateKey) {
      const generated = webpush.generateVAPIDKeys();
      publicKey = generated.publicKey;
      privateKey = generated.privateKey;
      await db('push_settings').insert([
        { key: 'vapid_public_key', value: publicKey },
        { key: 'vapid_private_key', value: privateKey },
      ]).onConflict('key').merge();
    }
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', publicKey, privateKey);
    this.publicKey = publicKey;
  }

  async subscribe(user, subscription, deviceName) {
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      throw new Error('Invalid push subscription');
    }
    await db('push_subscriptions').insert({
      user_id: user.id,
      shop_id: user.shop_id || null,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      device_name: String(deviceName || '').slice(0, 200) || null,
      enabled: true,
      updated_at: db.fn.now(),
    }).onConflict('endpoint').merge({
      user_id: user.id,
      shop_id: user.shop_id || null,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      device_name: String(deviceName || '').slice(0, 200) || null,
      enabled: true,
      updated_at: db.fn.now(),
    });
  }

  async unsubscribe(userId, endpoint) {
    await db('push_subscriptions').where({ user_id: userId, endpoint }).del();
  }

  async listDevices(userId) {
    return db('push_subscriptions')
      .where({ user_id: userId, enabled: true })
      .select('id', 'device_name', 'created_at', 'updated_at')
      .orderBy('updated_at', 'desc');
  }

  async sendToUser(userId, payload) {
    const rows = await db('push_subscriptions').where({ user_id: userId, enabled: true });
    const body = JSON.stringify(payload);
    await Promise.allSettled(rows.map(async row => {
      try {
        await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, body, { TTL: 300, urgency: 'high' });
      } catch (error) {
        if ([404, 410].includes(error.statusCode)) await db('push_subscriptions').where({ id: row.id }).del();
        else console.error('Push delivery failed:', error.message);
      }
    }));
    return rows.length;
  }
}

module.exports = new PushNotificationService();
