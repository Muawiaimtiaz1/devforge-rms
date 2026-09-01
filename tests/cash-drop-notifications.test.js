const test = require('node:test');
const assert = require('node:assert/strict');
const dbPath = require.resolve('../db/knex');
const notificationPath = require.resolve('../services/NotificationService');
const preferencePath = require.resolve('../src/modules/notification-preferences/notification-preferences.service');
const pushPath = require.resolve('../services/PushNotificationService');
const servicePath = require.resolve('../services/CashDropNotificationService');

function load(recipients = [], selected = null) {
  const notifications = [];
  const recipientQuery = {
    join() { return this; }, where() { return this; }, whereNot() { return this; }, distinct() { return this; },
    then(resolve, reject) { return Promise.resolve(recipients).then(resolve, reject); },
  };
  const requesterQuery = { where() { return this; }, first() { return Promise.resolve({ name: 'Ayesha' }); } };
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: (table) => table === 'users as u' ? recipientQuery : requesterQuery };
  require.cache[notificationPath] = { id: notificationPath, filename: notificationPath, loaded: true, exports: { create: async (payload) => notifications.push(payload) } };
  require.cache[preferencePath] = { id: preferencePath, filename: preferencePath, loaded: true, exports: { selection: async () => selected } };
  require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: { sendToUser: async () => ({ attempted: 0, delivered: 0, failed: 0 }) } };
  delete require.cache[servicePath];
  return { service: require(servicePath), notifications };
}

test.afterEach(() => [dbPath, notificationPath, preferencePath, pushPath, servicePath].forEach((path) => delete require.cache[path]));

test('cash drop request privately notifies every authorized verifier', async () => {
  const { service, notifications } = load([{ id: 7 }, { id: 9 }]);
  const count = await service.notifyRequested({ shopId: 3, requesterId: 5, amount: 3500, note: 'Move to safe' });
  assert.equal(count, 2);
  assert.deepEqual(notifications.map((item) => item.target_user_id), [7, 9]);
  assert.match(notifications[0].message, /Ayesha requested a cash drop of Rs\. 3500\.00/);
  assert.equal(notifications[0].action_url, '/dashboard#register');
  assert.equal(notifications[0].priority, 'high');
});

test('cash drop request with no verifier creates no notification', async () => {
  const { service, notifications } = load();
  assert.equal(await service.notifyRequested({ shopId: 3, requesterId: 5, amount: 100, note: '' }), 0);
  assert.equal(notifications.length, 0);
});

test('configured cash drop recipients are intersected with authorized verifiers', async () => {
  const { service, notifications } = load([{ id: 7 }, { id: 9 }], [9, 12]);
  assert.equal(await service.notifyRequested({ shopId: 3, requesterId: 5, amount: 500, note: '' }), 1);
  assert.deepEqual(notifications.map((item) => item.target_user_id), [9]);
});
