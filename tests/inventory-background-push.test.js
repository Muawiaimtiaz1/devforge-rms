const test = require('node:test');
const assert = require('node:assert/strict');
const knex = require('knex');

const db = knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
require.cache[require.resolve('../db/knex')] = { exports: db };
const alerts = require('../services/ExpiryNotificationService');

test('background inventory scan reaches subscribed active users without an open app', async () => {
  try {
    await db.schema.createTable('users', table => {
      table.increments('id');
      table.integer('shop_id');
      table.string('role');
      table.string('status');
    });
    await db.schema.createTable('push_subscriptions', table => {
      table.increments('id');
      table.integer('user_id');
      table.integer('shop_id').nullable();
      table.boolean('enabled');
    });
    await db('users').insert([
      { id: 1, shop_id: 10, role: 'admin', status: 'active' },
      { id: 2, shop_id: 10, role: 'manager', status: 'inactive' },
      { id: 3, shop_id: 20, role: 'admin', status: 'active' },
      { id: 4, shop_id: 10, role: 'admin', status: 'active' },
    ]);
    await db('push_subscriptions').insert([
      { user_id: 1, shop_id: 10, enabled: true },
      { user_id: 1, shop_id: 10, enabled: true },
      { user_id: 2, shop_id: 10, enabled: true },
      { user_id: 3, shop_id: 10, enabled: true },
      { user_id: 4, shop_id: null, enabled: true },
    ]);
    const seen = [];
    alerts.syncForUser = async (user, permissions) => {
      seen.push({ id: user.id, shopId: user.shop_id, permissions });
      return 1;
    };
    const created = await alerts.syncSubscribedUsers(async () => ['raw_stock.view']);
    assert.equal(created, 2);
    assert.deepEqual(seen.map(row => row.id).sort(), [1, 4]);
    assert.ok(seen.every(row => row.permissions.includes('raw_stock.view')));
  } finally {
    await db.destroy();
  }
});
