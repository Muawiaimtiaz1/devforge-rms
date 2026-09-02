const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { planFifoAllocations } = require('../src/modules/inventory/inventory-costing.service');

test('FIFO cost follows the batches being consumed', () => {
  const result = planFifoAllocations([
    { id: 1, quantity: 1, buying_price: 500 },
    { id: 2, quantity: 1, buying_price: 700 }
  ], 1.5);
  assert.equal(result.remaining, 0);
  assert.deepEqual(result.allocations, [
    { batchId: 1, quantity: 1, unitCost: 500, totalCost: 500 },
    { batchId: 2, quantity: 0.5, unitCost: 700, totalCost: 350 }
  ]);
  assert.equal(result.allocations.reduce((sum, row) => sum + row.totalCost, 0), 850);
});

test('FIFO supports fractional ingredient weights', () => {
  const result = planFifoAllocations([
    { id: 10, quantity: 0.25, buying_price: 400 },
    { id: 11, quantity: 1, buying_price: 600 }
  ], 0.4);
  assert.ok(Math.abs(result.remaining) < 0.000001);
  assert.equal(result.allocations[0].quantity, 0.25);
  assert.ok(Math.abs(result.allocations[1].quantity - 0.15) < 0.000001);
  assert.equal(result.allocations.reduce((sum, row) => sum + row.totalCost, 0), 190);
});

test('FIFO exposes an unmet balance when batches are insufficient', () => {
  const result = planFifoAllocations([{ id: 1, quantity: 0.2, buying_price: 500 }], 0.5);
  assert.ok(Math.abs(result.remaining - 0.3) < 0.000001);
});

test('FIFO persistence is tenant scoped, deterministic, and auditable', () => {
  const service = fs.readFileSync(path.join(__dirname, '../src/modules/inventory/inventory-costing.service.js'), 'utf8');
  const migration = fs.readFileSync(path.join(__dirname, '../src/modules/inventory/inventory-costing.migration.js'), 'utf8');
  assert.match(service, /shop_id: shopId/);
  assert.match(service, /column: 'created_at', order: 'asc'/);
  assert.match(service, /column: 'id', order: 'asc'/);
  assert.match(service, /\.forUpdate\(\)/);
  assert.match(migration, /sale_inventory_consumptions/);
  assert.match(migration, /sale_item_id INTEGER NOT NULL REFERENCES sale_items\(id\) ON DELETE CASCADE/);
  assert.match(migration, /quantity NUMERIC\(18, 6\)/);
  assert.match(migration, /total_cost NUMERIC\(18, 2\)/);
});
