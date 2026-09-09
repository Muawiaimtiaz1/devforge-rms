
const test = require('node:test');
const assert = require('node:assert/strict');
const { getTipOrderDateRange } = require('../src/modules/tips/tips-date-range');

test('tip selector uses Pakistan calendar dates across midnight', () => {
  const now = new Date('2026-09-08T20:00:00Z'); // September 9, 1am Karachi
  assert.deepEqual(getTipOrderDateRange({}, now), { start: '2026-09-08T19:00:00.000Z', end: '2026-09-09T19:00:00.000Z' });
  assert.deepEqual(getTipOrderDateRange({ period: 'yesterday' }, now), { start: '2026-09-07T19:00:00.000Z', end: '2026-09-08T19:00:00.000Z' });
  assert.deepEqual(getTipOrderDateRange({ period: '2days' }, now), { start: '2026-09-07T19:00:00.000Z', end: '2026-09-09T19:00:00.000Z' });
  assert.equal(getTipOrderDateRange({ period: 'all' }, now), null);
  assert.deepEqual(getTipOrderDateRange({ period: 'yesterday' }, new Date('2026-01-01T00:00:00Z')), { start: '2025-12-30T19:00:00.000Z', end: '2025-12-31T19:00:00.000Z' });
});

test('custom tip dates include the whole end date and reject invalid inputs', () => {
  assert.deepEqual(getTipOrderDateRange({ period: 'custom', from: '2024-02-29', to: '2024-03-01' }), { start: '2024-02-28T19:00:00.000Z', end: '2024-03-01T19:00:00.000Z' });
  for (const filter of [
    { period: 'unknown' }, { period: 'custom' },
    { period: 'custom', from: '2026-02-29', to: '2026-03-01' },
    { period: 'custom', from: '2026-09-09', to: '2026-09-08' },
    { period: 'custom', from: 'bad', to: '2026-09-09' }
  ]) assert.throws(() => getTipOrderDateRange(filter), error => error.status === 400);
});

test('tip date/search filters preserve eligibility and tenant/staff visibility', async t => {
  const knex = require('knex');
  const db = knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
  require.cache[require.resolve('../db/knex')] = { exports: db };
  const tips = require('../src/modules/tips/tips.service');
  t.after(() => db.destroy());
  await db.schema.createTable('tables', table => { table.integer('id'); table.integer('shop_id'); table.string('table_number'); });
  await db.schema.createTable('sale_tips', table => { table.integer('id'); table.integer('sale_id'); table.integer('shop_id'); });
  await db.schema.createTable('sales', table => {
    for (const name of ['id', 'order_number', 'shop_id', 'user_id', 'waiter_id', 'table_id']) table.integer(name);
    for (const name of ['order_type', 'customer_name', 'order_status', 'payment_method', 'created_at', 'updated_at', 'payment_received_at']) table.string(name);
    table.decimal('total'); table.decimal('amount_received');
  });
  await db('tables').insert([{ id: 1, shop_id: 1, table_number: 'A1' }, { id: 2, shop_id: 2, table_number: 'Other' }]);
  const order = (id, paidAt, extra = {}) => ({ id, order_number: 100 + id, shop_id: 1, user_id: 1, table_id: 1, customer_name: 'Guest', order_status: 'completed', payment_method: 'cash', order_type: 'dine_in', total: 100, amount_received: 100, created_at: paidAt, updated_at: paidAt, payment_received_at: paidAt, ...extra });
  await db('sales').insert([
    order(1, '2026-09-08 19:00:00'), // today at exactly midnight
    order(2, '2026-09-08 18:00:00'), // yesterday at 11pm
    order(3, '2026-09-01 12:00:00', { customer_name: 'Older Guest' }),
    order(4, '2026-09-08 18:00:00', { shop_id: 2, user_id: 2, table_id: 2 }),
    order(5, '2026-09-08 18:00:00', { user_id: 2 }),
    order(6, '2026-09-08 18:00:00', { amount_received: 50 }),
    order(7, '2026-09-08 18:00:00', { order_status: 'ready' }),
    order(8, '2026-09-08 18:00:00'), // already tipped
    order(9, '2026-09-09 19:00:00'), // next midnight excluded
    order(10, '2026-09-08T18:30:00.000Z'), // ISO and SQLite timestamps agree
  ]);
  await db('sale_tips').insert({ id: 1, shop_id: 1, sale_id: 8 });
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-08T20:00:00Z') });
  const user = { id: 1, role: 'cashier' };
  const ids = async filters => (await tips.listEligibleOrders(1, user, filters)).orders.map(row => row.id).sort((a,b) => a-b);
  assert.deepEqual(await ids({}), [1]);
  assert.deepEqual(await ids({ period: 'yesterday' }), [2, 10]);
  assert.deepEqual(await ids({ period: '2days' }), [1, 2, 10]);
  assert.deepEqual(await ids({ search: 'Older' }), []);
  assert.deepEqual(await ids({ period: 'all', search: 'Older' }), [3]);
  assert.deepEqual(await ids({ period: 'custom', from: '2026-09-08', to: '2026-09-08', search: 'A1' }), [2, 10]);
  assert.deepEqual(await ids({ period: 'all', tableId: 2 }), []);
  const admin = await tips.listEligibleOrders(1, { id: 1, role: 'admin' }, { period: 'yesterday' });
  assert.deepEqual(admin.orders.map(row => row.id).sort((a,b)=>a-b), [2,5,10]);
  assert.equal((await db('sale_tips')).length, 1);
  assert.equal((await db('sales').where({id:3}).first()).amount_received, 100);
});

