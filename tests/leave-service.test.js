const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../db/knex');
const repositoryPath = require.resolve('../src/modules/leave/leave.repository');
const attendancePath = require.resolve('../src/modules/attendance/attendance.service');
const notificationPath = require.resolve('../services/NotificationService');
const servicePath = require.resolve('../src/modules/leave/leave.service');
function loadService(repository = {}) {
  delete require.cache[servicePath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {} };
  require.cache[repositoryPath] = { id: repositoryPath, filename: repositoryPath, loaded: true, exports: repository };
  require.cache[attendancePath] = { id: attendancePath, filename: attendancePath, loaded: true, exports: {} };
  require.cache[notificationPath] = { id: notificationPath, filename: notificationPath, loaded: true, exports: {} };
  return require(servicePath);
}
test.afterEach(() => [servicePath, repositoryPath, attendancePath, notificationPath, dbPath].forEach((path) => delete require.cache[path]));

test('leave access always derives tenant scope from the session', async () => {
  const service = loadService({});
  await assert.rejects(() => service.listTypes({ id: 1, shop_id: null }), (error) => error.status === 403);
});

test('leave schemas enforce half-day and fixed date inputs', () => {
  const { requestSchema, allocationSchema } = require('../src/modules/leave/leave.schema');
  assert.equal(requestSchema.parse({ leave_type_id: 2, start_date: '2026-09-01', end_date: '2026-09-01', day_part: 'first_half', reason: 'Medical appointment' }).day_part, 'first_half');
  assert.throws(() => requestSchema.parse({ leave_type_id: 2, start_date: 'tomorrow', end_date: '2026-09-01', reason: 'Invalid' }));
  assert.throws(() => allocationSchema.parse({ staff_profile_id: 1, leave_type_id: 2, period_start: '2026-01-01', period_end: '2026-12-31', days: 0, reason: 'None' }));
});

test('leave migration preserves an immutable fixed-precision balance ledger', () => {
  const { LEAVE_MIGRATION_SQL } = require('../src/modules/leave/leave.migration');
  assert.match(LEAVE_MIGRATION_SQL, /NUMERIC\(8,2\)/);
  assert.match(LEAVE_MIGRATION_SQL, /BEFORE UPDATE OR DELETE ON leave_balance_ledger/);
  assert.match(LEAVE_MIGRATION_SQL, /leave_approval_history/);
});
