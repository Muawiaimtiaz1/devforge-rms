const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { classifyAffectedKitchenQueues, normalizeQueueKind } = require('../utils/kitchen-queue');
const { mergeKitchenChanges } = require('../utils/kitchen-pending-changes');

test('a newly routed kitchen receives an edited order as new', () => {
  assert.deepEqual(classifyAffectedKitchenQueues([101], [202]), [
    { kitchenId: 202, queueKind: 'new' },
  ]);
});

test('an existing affected kitchen receives an edited order as updated', () => {
  assert.deepEqual(classifyAffectedKitchenQueues([101, 202], [202]), [
    { kitchenId: 202, queueKind: 'updated' },
  ]);
});

test('mixed edits classify each affected kitchen independently without adding unaffected kitchens', () => {
  assert.deepEqual(classifyAffectedKitchenQueues([101, 303], [101, 202, 202]), [
    { kitchenId: 101, queueKind: 'updated' },
    { kitchenId: 202, queueKind: 'new' },
  ]);
});

test('legacy or invalid queue kinds safely fall back to new', () => {
  assert.equal(normalizeQueueKind('updated'), 'updated');
  assert.equal(normalizeQueueKind('new'), 'new');
  assert.equal(normalizeQueueKind(null), 'new');
});

test('a later hot-kitchen edit cannot overwrite a dessert-kitchen pending edit', () => {
  const dessertPending = [{ product_id: 79, name: 'Vanilla Ice Cream', product_category: 'Mini Pancake', quantity: 1, change_action: 'add' }];
  const hotEdit = [{ product_id: 45, name: 'Water', product_category: 'Extras', quantity: 1, change_action: 'remove' }];
  assert.deepEqual(mergeKitchenChanges(dessertPending, []), dessertPending);
  assert.deepEqual(mergeKitchenChanges([], hotEdit), hotEdit);
});

test('repeated per-kitchen edits accumulate and opposite quantities cancel', () => {
  const base = { product_id: 79, name: 'Vanilla Ice Cream', product_category: 'Mini Pancake' };
  assert.deepEqual(mergeKitchenChanges(
    [{ ...base, quantity: 3, change_action: 'add' }],
    [{ ...base, quantity: 1, change_action: 'remove' }],
  ), [{ ...base, quantity: 2, change_action: 'add' }]);
  assert.deepEqual(mergeKitchenChanges(
    [{ ...base, quantity: 1, change_action: 'add' }],
    [{ ...base, quantity: 1, change_action: 'remove' }],
  ), []);
});
test('per-kitchen queue classification is wired into persistence, filtering, and schema initialization', () => {
  const root = path.join(__dirname, '..');
  const sales = fs.readFileSync(path.join(root, 'services', 'SalesService.js'), 'utf8');
  const infrastructure = fs.readFileSync(path.join(root, 'services', 'InfrastructureService.js'), 'utf8');
  const dbInit = fs.readFileSync(path.join(root, 'db', 'db-init.js'), 'utf8');
  const postgresSchema = fs.readFileSync(path.join(root, 'db', 'postgres-schema.sql'), 'utf8');

  assert.match(sales, /classifyAffectedKitchenQueues\(oldKitchenIds, affectedKitchenIds\)/);
  assert.match(sales, /queue_kind: queueKind/);
  assert.match(infrastructure, /selected_kos\.shop_id[^\n]+s\.shop_id/);
  assert.match(infrastructure, /selected_kos\.queue_kind as kitchen_queue_kind/);
  assert.match(infrastructure, /COALESCE\(selected_kos\.queue_kind, 'new'\) = 'new'/);
  assert.match(infrastructure, /query\.where\('selected_kos\.queue_kind', 'updated'\)/);
  assert.match(dbInit, /queue_kind TEXT NOT NULL DEFAULT 'new'/);
  assert.match(postgresSchema, /queue_kind TEXT NOT NULL DEFAULT 'new'/);
  assert.match(sales, /getKitchenChangeGroups/);
  assert.match(sales, /kitchen_order_pending_updates/);
  assert.match(infrastructure, /kpu\.kitchen_id = \?/);
  assert.match(infrastructure, /full routed items instead/);
  assert.match(infrastructure, /kitchen_order_pending_updates/);
  assert.match(dbInit, /PRIMARY KEY \(sale_id, kitchen_id\)/);
  assert.match(postgresSchema, /CREATE TABLE IF NOT EXISTS kitchen_order_pending_updates/);
});
