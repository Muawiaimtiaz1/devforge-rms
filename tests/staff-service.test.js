const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../db/knex');
const repositoryPath = require.resolve('../src/modules/staff/staff.repository');
const servicePath = require.resolve('../src/modules/staff/staff.service');

function loadService(repository) {
  delete require.cache[servicePath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {} };
  require.cache[repositoryPath] = { id: repositoryPath, filename: repositoryPath, loaded: true, exports: repository };
  return require(servicePath);
}

test.afterEach(() => {
  delete require.cache[servicePath];
  delete require.cache[repositoryPath];
  delete require.cache[dbPath];
});

test('staff listing derives tenant scope from the authenticated session', async () => {
  const observedShopIds = [];
  const service = loadService({
    list: async (shopId) => { observedShopIds.push(shopId); return { items: [{ id: 1 }], total: 1 }; },
    summary: async (shopId) => { observedShopIds.push(shopId); return { total: 1, active: 1 }; },
    departments: async (shopId) => { observedShopIds.push(shopId); return ['Kitchen']; },
    designations: async (shopId) => { observedShopIds.push(shopId); return ['Chef']; },
  });

  const result = await service.listStaff(
    { id: 8, shop_id: 42 },
    { page: '1', page_size: '20', status: 'all', employment_type: 'all', sort: 'name', direction: 'asc' },
  );

  assert.deepEqual(observedShopIds, [42, 42, 42, 42]);
  assert.equal(result.pagination.total, 1);
  assert.deepEqual(result.filters.departments, ['Kitchen']);
  assert.deepEqual(result.filters.designations, ['Chef']);
});

test('staff listing rejects sessions without a restaurant scope', async () => {
  const service = loadService({});
  await assert.rejects(
    () => service.listStaff({ id: 1, shop_id: null }, {}),
    (error) => error.status === 403 && /restaurant must be selected/i.test(error.message),
  );
});

test('staff profile validation accepts lifecycle values and rejects unknown fields', () => {
  const { staffProfileSchema } = require('../src/modules/staff/staff.schema');
  const profile = staffProfileSchema.parse({
    full_name: 'Ayesha Khan', employment_type: 'part_time', employment_status: 'inactive', joining_date: '2026-08-31',
  });
  assert.equal(profile.employment_status, 'inactive');
  assert.throws(() => staffProfileSchema.parse({ full_name: 'Ayesha Khan', shop_id: 999 }));
});
