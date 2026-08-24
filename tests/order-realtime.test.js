const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { io: createClient } = require('socket.io-client');
const { OrderRealtimeService } = require('../services/OrderRealtimeService');
const { effectiveKitchenStatuses } = require('../utils/kitchen-status');

function waitFor(socket, eventName, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${eventName}`)), timeout);
    socket.once(eventName, value => { clearTimeout(timer); resolve(value); });
  });
}

function expectNoEvent(socket, eventName, timeout = 250) {
  return new Promise((resolve, reject) => {
    const listener = value => { clearTimeout(timer); reject(new Error(`Unexpected ${eventName}: ${JSON.stringify(value)}`)); };
    const timer = setTimeout(() => { socket.off(eventName, listener); resolve(); }, timeout);
    socket.once(eventName, listener);
  });
}

test('authenticated rooms isolate shops and kitchen terminals', async t => {
  const httpServer = http.createServer((_req, res) => res.end('ok'));
  const realtime = new OrderRealtimeService();
  const fakeSessionMiddleware = (req, _res, next) => {
    const rawUser = req.headers['x-test-user'];
    req.session = rawUser ? { user: JSON.parse(rawUser) } : {};
    next();
  };
  realtime.initialize(httpServer, fakeSessionMiddleware, { serveClient: false });
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${httpServer.address().port}`;
  const clients = [];
  const connect = user => {
    const socket = createClient(url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: user ? { 'x-test-user': JSON.stringify(user) } : {},
    });
    clients.push(socket);
    return socket;
  };
  t.after(async () => {
    clients.forEach(socket => socket.disconnect());
    await realtime.close();
  });

  const unauthorized = connect(null);
  const unauthorizedError = await waitFor(unauthorized, 'connect_error');
  assert.equal(unauthorizedError.message, 'Unauthorized');
  assert.equal(unauthorizedError.data.code, 'UNAUTHORIZED');

  const shopOneManager = connect({ id: 10, shop_id: 1, role: 'manager' });
  const shopTwoManager = connect({ id: 20, shop_id: 2, role: 'manager' });
  const kitchenOne = connect({ id: 101, shop_id: 1, role: 'kitchen' });
  const kitchenTwo = connect({ id: 102, shop_id: 1, role: 'kitchen' });
  await Promise.all([
    waitFor(shopOneManager, 'realtime:ready'),
    waitFor(shopTwoManager, 'realtime:ready'),
    waitFor(kitchenOne, 'realtime:ready'),
    waitFor(kitchenTwo, 'realtime:ready'),
  ]);

  const managerEvent = waitFor(shopOneManager, 'order:changed');
  const kitchenEvent = waitFor(kitchenOne, 'order:changed');
  const otherShopGetsNothing = expectNoEvent(shopTwoManager, 'order:changed');
  const otherKitchenGetsNothing = expectNoEvent(kitchenTwo, 'order:changed');
  assert.equal(realtime.publishOrderChange({
    type: 'order.updated', shopId: 1, orderId: 77, kitchenIds: [101, 101, -1],
  }), true);

  const [forManager, forKitchen] = await Promise.all([managerEvent, kitchenEvent]);
  await Promise.all([otherShopGetsNothing, otherKitchenGetsNothing]);
  assert.equal(forManager.type, 'order.updated');
  assert.equal(forManager.orderId, 77);
  assert.equal(forKitchen.eventId, forManager.eventId);
  assert.match(forManager.occurredAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(Object.keys(forManager).sort(), ['eventId', 'occurredAt', 'orderId', 'type', 'version']);
});

test('invalid order publication is rejected without throwing', () => {
  const realtime = new OrderRealtimeService();
  assert.equal(realtime.publishOrderChange({ type: 'order.created', shopId: 0, orderId: 1 }), false);
  assert.equal(realtime.publishOrderChange({ type: 'order.created', shopId: 1, orderId: 'bad' }), false);
});

test('finished orders cannot display stale pending kitchen statuses', () => {
  const pending = [{ kitchen_id: 5, status: 'pending' }, { kitchen_id: 6, status: 'preparing' }];
  assert.deepEqual(effectiveKitchenStatuses('completed', pending).map(row => row.status), ['completed', 'completed']);
  assert.deepEqual(effectiveKitchenStatuses('served', pending).map(row => row.status), ['completed', 'completed']);
  assert.deepEqual(effectiveKitchenStatuses('ready', pending).map(row => row.status), ['completed', 'completed']);
  assert.deepEqual(effectiveKitchenStatuses('preparing', pending).map(row => row.status), ['pending', 'preparing']);
  assert.equal(pending[0].status, 'pending', 'normalization must not mutate query results');
});
