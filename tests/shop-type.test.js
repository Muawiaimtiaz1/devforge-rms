const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dbPath = require.resolve('../db/knex');
const servicePath = require.resolve('../services/ShopService');
const orderTypeServicePath = require.resolve('../services/OrderTypePermissionService');

function loadService() {
  const inserts = [];
  const fakeDb = table => ({
    insert(payload) {
      inserts.push({ table, payload });
      return { returning: async () => [{ id: inserts.length }] };
    },
    where() {
      return { update: async () => 1 };
    }
  });
  fakeDb.transaction = callback => callback(fakeDb);
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };
  delete require.cache[servicePath];
  return { service: require(servicePath), inserts };
}

test.afterEach(() => {
  delete require.cache[dbPath];
  delete require.cache[servicePath];
  delete require.cache[orderTypeServicePath];
});

test('shop creation accepts only the three supported shop types and persists the selection', async () => {
  const { service, inserts } = loadService();
  const base = { name: 'Test Shop', allowed_panels: [], adminUsername: 'admin-user', adminPassword: 'secret1' };

  for (const shop_type of ['restaurant', 'retail', 'retail_restaurant']) {
    await service.createShop({ ...base, name: shop_type, adminUsername: `admin-${shop_type}`, shop_type });
  }
  await service.createShop({ ...base, name: 'Default Shop' });

  assert.deepEqual(
    inserts.filter(entry => entry.table === 'shops').map(entry => entry.payload.shop_type),
    ['restaurant', 'retail', 'retail_restaurant', 'restaurant']
  );
  await assert.rejects(
    service.createShop({ ...base, shop_type: 'warehouse' }),
    /Invalid option/
  );
});

test('super admin hierarchy cards display each persisted shop type', () => {
  const hierarchySource = fs.readFileSync(path.join(__dirname, '../public/js/hierarchy.js'), 'utf8');

  assert.match(hierarchySource, /restaurant:\s*\{[\s\S]*?label: "Restaurant"/);
  assert.match(hierarchySource, /retail:\s*\{[\s\S]*?label: "Retail"/);
  assert.match(hierarchySource, /retail_restaurant:\s*\{[\s\S]*?label: "Retail \+ Restaurant"/);
  assert.match(hierarchySource, /\$\{shopTypeMeta\.icon\} \$\{shopTypeMeta\.label\}/);
  assert.match(hierarchySource, /Manage \$\{shopTypeMeta\.label\}/);
});

test('shop ordering types are permission-only, validated, and default existing behavior to all types', async () => {
  const { service, inserts } = loadService();
  const base = { name: 'Order Type Shop', allowed_panels: [], adminUsername: 'types-admin', adminPassword: 'secret1' };

  await service.createShop({ ...base, allowed_order_types: ['dine_in', 'takeaway'] });
  await service.createShop({ ...base, name: 'Default Types', adminUsername: 'default-types' });

  const shops = inserts.filter(entry => entry.table === 'shops');
  assert.equal(shops[0].payload.allowed_order_types, JSON.stringify(['dine_in', 'takeaway']));
  assert.equal(shops[1].payload.allowed_order_types, JSON.stringify(['dine_in', 'takeaway', 'delivery']));
  await assert.rejects(service.createShop({ ...base, allowed_order_types: [] }), /Too small/);
  await assert.rejects(service.createShop({ ...base, allowed_order_types: ['curbside'] }), /Invalid option/);
});

test('walk-in is added for retail-capable shops without changing restaurant defaults', () => {
  const { ORDER_TYPES, RESTAURANT_ORDER_TYPES, normalizeOrderTypes } = require('../services/OrderTypePermissionService');

  assert.deepEqual(RESTAURANT_ORDER_TYPES, ['dine_in', 'takeaway', 'delivery']);
  assert.deepEqual(ORDER_TYPES, ['dine_in', 'takeaway', 'delivery', 'walk_in']);
  assert.deepEqual(normalizeOrderTypes(['dine_in', 'takeaway'], 'restaurant'), ['dine_in', 'takeaway']);
  assert.deepEqual(normalizeOrderTypes(['dine_in', 'takeaway'], 'retail'), ['dine_in', 'takeaway', 'walk_in']);
  assert.deepEqual(normalizeOrderTypes(null, 'retail_restaurant'), ['dine_in', 'takeaway', 'delivery', 'walk_in']);
});

test('walk-in is selectable, saved, correctly labeled, and excluded from kitchen', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
  const hierarchySource = fs.readFileSync(path.join(__dirname, '../public/js/hierarchy.js'), 'utf8');
  const salesSource = fs.readFileSync(path.join(__dirname, '../services/SalesService.js'), 'utf8');
  const kitchenSource = fs.readFileSync(path.join(__dirname, '../services/InfrastructureService.js'), 'utf8');
  const receiptSource = fs.readFileSync(path.join(__dirname, '../services/ReceiptPrintService.js'), 'utf8');

  assert.match(appSource, /startPOSOrder\('walk_in'\)/);
  assert.match(appSource, /activePOSOrderType === 'walk_in'/);
  assert.match(appSource, /orderType === 'walk_in'/);
  assert.match(hierarchySource, /data-service="walk_in"/);
  assert.match(salesSource, /data\.order_type === 'walk_in'/);
  assert.match(kitchenSource, /whereNot\('s\.order_type', 'walk_in'\)/);
  assert.match(receiptSource, /type === "walk_in"[\s\S]*return "Walk-in"/);
});

test('retail POS saves orders for later editing and keeps restaurant completion unchanged', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');

  assert.match(appSource, /const isRetail = baseShopType === 'retail'/);
  assert.match(appSource, /checkout\('payment_pending'\)/);
  assert.match(appSource, /savedRetailOrder[\s\S]*await openPOSOrdersView\(\)/);
  assert.match(appSource, /window\._posIsRetail[\s\S]*\/api\/sales\/\$\{id\}\/complete[\s\S]*\/api\/kds\/\$\{id\}\/status/);
});

test('retail completion is atomic, tenant scoped, and isolated from kitchen workflow', () => {
  const salesSource = fs.readFileSync(path.join(__dirname, '../services/SalesService.js'), 'utf8');
  const kitchenSource = fs.readFileSync(path.join(__dirname, '../services/InfrastructureService.js'), 'utf8');
  const policySource = fs.readFileSync(path.join(__dirname, '../authorization/api-policy.js'), 'utf8');

  assert.match(salesSource, /async completeRetailOrder[\s\S]*shop\.shop_type !== 'retail'/);
  assert.match(salesSource, /where\(\{ id: saleId, shop_id: shopId, order_status: 'payment_pending' \}\)[\s\S]*order_status: 'completed'/);
  assert.match(salesSource, /activeShift[\s\S]*queueForPaidCompletedSale/);
  assert.match(salesSource, /const isRetailOrder[\s\S]*isRetailOrder \? new Map\(\)/);
  assert.match(kitchenSource, /whereNot\('shop\.shop_type', 'retail'\)/);
  assert.match(policySource, /resource === 'sales'[\s\S]*\/\\\/complete\$\/[\s\S]*return 'complete'/);
});
