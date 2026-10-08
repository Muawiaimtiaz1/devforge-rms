const test = require('node:test');
const assert = require('node:assert/strict');
const salesService = require('../services/SalesService');

function fakeTransaction(rows) {
  const calls = [];
  const trx = table => {
    const call = { table };
    calls.push(call);
    const query = {
      select(...value) { call.select = value; return query; },
      where(value) { call.where = value; return query; },
      whereIn(column, values) { call.whereIn = { column, values }; return query; },
      orderBy(column, direction) { call.orderBy = { column, direction }; return query; },
      forUpdate() { call.forUpdate = true; return query; },
      then(resolve, reject) { return Promise.resolve(rows).then(resolve, reject); }
    };
    return query;
  };
  return { trx, calls };
}

test('ingredient validation uses one ordered tenant-scoped lock query', async () => {
  const fake = fakeTransaction([
    { id: 2, name: 'Flour', current_stock: 10, conversion_factor: 1 },
    { id: 7, name: 'Oil', current_stock: 5, conversion_factor: 2 }
  ]);
  await salesService.validateIngredientRequirements(fake.trx, [
    { raw_stock_id: 7, quantity: 2 },
    { raw_stock_id: '2', quantity: 3 },
    { raw_stock_id: 2, quantity: 4 }
  ], 1, 'this order', 41);
  assert.equal(fake.calls.length, 1);
  assert.deepEqual(fake.calls[0].where, { shop_id: 41 });
  assert.deepEqual(fake.calls[0].whereIn, { column: 'id', values: [2, 7] });
  assert.deepEqual(fake.calls[0].orderBy, { column: 'id', direction: 'asc' });
  assert.equal(fake.calls[0].forUpdate, true);
});

test('ingredient validation aggregates duplicate numeric and string IDs', async () => {
  const fake = fakeTransaction([
    { id: 3, name: 'Cheese', current_stock: 5, conversion_factor: 1 }
  ]);
  await assert.rejects(
    salesService.validateIngredientRequirements(fake.trx, [
      { raw_stock_id: 3, quantity: 3 },
      { raw_stock_id: '3', quantity: 3 }
    ], 1, 'this order', 8),
    /Insufficient stock of ingredient .*Cheese.*this order/
  );
  assert.equal(fake.calls.length, 1);
});

test('ingredient validation handles missing and empty requirement sets', async () => {
  const missing = fakeTransaction([]);
  await assert.rejects(
    salesService.validateIngredientRequirements(missing.trx, [
      { raw_stock_id: 99, quantity: 1 }
    ], 1, 'Combo', 12),
    /An ingredient configured for .*Combo.* no longer exists/
  );
  assert.deepEqual(missing.calls[0].where, { shop_id: 12 });

  const empty = fakeTransaction([]);
  await salesService.validateIngredientRequirements(empty.trx, [], 1, 'this order', 5);
  assert.equal(empty.calls.length, 0);
});
