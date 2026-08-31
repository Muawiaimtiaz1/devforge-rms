const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../db/knex');
const repositoryPath = require.resolve('../src/modules/attendance/attendance.repository');
const servicePath = require.resolve('../src/modules/attendance/attendance.service');

function loadService() {
  delete require.cache[servicePath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {} };
  require.cache[repositoryPath] = { id: repositoryPath, filename: repositoryPath, loaded: true, exports: {} };
  return require(servicePath);
}
test.afterEach(() => [servicePath, repositoryPath, dbPath].forEach((path) => delete require.cache[path]));

test('attendance business dates use the configured shop timezone', () => {
  const { businessDate } = loadService();
  assert.equal(businessDate(new Date('2026-08-31T20:30:00.000Z'), 'Asia/Karachi'), '2026-09-01');
  assert.equal(businessDate(new Date('2026-08-31T20:30:00.000Z'), 'UTC'), '2026-08-31');
});

test('attendance calendar ranges are inclusive and bounded', () => {
  const { dateRangeDays } = loadService();
  assert.deepEqual(dateRangeDays('2026-09-01', '2026-09-03'), ['2026-09-01', '2026-09-02', '2026-09-03']);
  assert.throws(() => dateRangeDays('2026-09-01', '2026-12-31'), /1 to 62 days/);
  assert.throws(() => dateRangeDays('2026-09-03', '2026-09-01'), /1 to 62 days/);
});

test('attendance payloads enforce weekly completeness and idempotent clock keys', () => {
  const { scheduleSchema, clockSchema } = require('../src/modules/attendance/attendance.schema');
  assert.throws(() => scheduleSchema.parse({ staff_profile_id: 1, effective_from: '2026-09-01', days: [] }));
  assert.throws(() => clockSchema.parse({ event_type: 'clock_in', idempotency_key: 'short' }));
  assert.equal(clockSchema.parse({ event_type: 'clock_in', idempotency_key: 'event-key-123' }).source_type, 'web');
});

test('PostgreSQL migration makes raw clock events immutable', () => {
  const { ATTENDANCE_MIGRATION_SQL } = require('../src/modules/attendance/attendance.migration');
  assert.match(ATTENDANCE_MIGRATION_SQL, /BEFORE UPDATE OR DELETE ON attendance_clock_events/);
  assert.match(ATTENDANCE_MIGRATION_SQL, /attendance_adjustments/);
  assert.match(ATTENDANCE_MIGRATION_SQL, /BEFORE UPDATE OR DELETE ON attendance_daily_marks/);
});

test('daily attendance accepts a bounded roster and rejects duplicate staff later in service', () => {
  const { dailyRegisterSchema } = require('../src/modules/attendance/attendance.schema');
  const parsed = dailyRegisterSchema.parse({ business_date: '2026-08-31', reason: 'Manager daily roster', idempotency_key: 'daily-roster-123', marks: [{ staff_profile_id: 1, attendance_status: 'present' }] });
  assert.equal(parsed.marks[0].attendance_status, 'present');
  assert.throws(() => dailyRegisterSchema.parse({ business_date: 'bad', reason: 'ok', idempotency_key: 'short', marks: [] }));
});
