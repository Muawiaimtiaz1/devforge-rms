const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../db/knex');
const repositoryPath = require.resolve('../src/modules/staff/organization/staff-organization.repository');
const sessionPath = require.resolve('../src/modules/session-security/session-security.service');
const servicePath = require.resolve('../src/modules/staff/organization/staff-organization.service');

function loadService() {
  delete require.cache[servicePath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {} };
  require.cache[repositoryPath] = { id: repositoryPath, filename: repositoryPath, loaded: true, exports: {} };
  require.cache[sessionPath] = { id: sessionPath, filename: sessionPath, loaded: true, exports: {} };
  return require(servicePath);
}

test.afterEach(() => [servicePath, repositoryPath, sessionPath, dbPath].forEach((path) => delete require.cache[path]));

test('organization access derives shop scope from the session', async () => {
  const service = loadService();
  await assert.rejects(() => service.getOptions({ id: 1, shop_id: null }), (error) => error.status === 403);
});

test('cross-shop transfer is restricted to platform administrators before persistence', async () => {
  const service = loadService();
  await assert.rejects(
    () => service.transferStaff({ id: 1, shop_id: 7, role: 'admin' }, 2, { target_shop_id: 8, effective_date: '2026-09-01', reason: 'Operational transfer' }),
    (error) => error.status === 403 && /platform administrator/i.test(error.message),
  );
});

test('organization schemas require effective dates and audit reasons', () => {
  const { assignmentSchema, transferSchema } = require('../src/modules/staff/organization/staff-organization.schema');
  assert.throws(() => assignmentSchema.parse({ department_id: 2, effective_date: '2026-09-01', reason: '' }));
  assert.throws(() => transferSchema.parse({ target_shop_id: 2, effective_date: 'tomorrow', reason: 'Move' }));
  assert.equal(assignmentSchema.parse({ department_id: '2', effective_date: '2026-09-01', reason: 'Promotion' }).department_id, 2);
});
