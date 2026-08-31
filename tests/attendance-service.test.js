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
  const { businessDate, storedDate } = loadService();
  assert.equal(businessDate(new Date('2026-08-31T20:30:00.000Z'), 'Asia/Karachi'), '2026-09-01');
  assert.equal(businessDate(new Date('2026-08-31T20:30:00.000Z'), 'UTC'), '2026-08-31');
  assert.equal(storedDate(new Date('2026-08-30T19:00:00.000Z'), 'Asia/Karachi'), '2026-08-31');
  assert.equal(storedDate('2026-08-31', 'Asia/Karachi'), '2026-08-31');
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
  assert.match(ATTENDANCE_MIGRATION_SQL, /UNIQUE \(shop_id, business_date, shift_template_id\)/);
  assert.match(ATTENDANCE_MIGRATION_SQL, /idx_attendance_shift_mark_history/);
  assert.match(ATTENDANCE_MIGRATION_SQL, /DROP INDEX IF EXISTS uq_attendance_shift_mark_staff_date/);
  assert.match(ATTENDANCE_MIGRATION_SQL, /uq_attendance_shift_clock_event/);
  assert.match(ATTENDANCE_MIGRATION_SQL, /attendance_shift_register_id/);
  assert.match(ATTENDANCE_MIGRATION_SQL, /BEFORE UPDATE OR DELETE ON attendance_shift_registers/);
});

test('shift attendance accepts a bounded roster and never accepts a client-selected date', () => {
  const { shiftRegisterSchema, personShiftMarkSchema } = require('../src/modules/attendance/attendance.schema');
  const payload = { shift_template_id: 2, reason: 'Morning shift roster', idempotency_key: 'shift-roster-123', marks: [{ staff_profile_id: 1, attendance_status: 'present' }] };
  const parsed = shiftRegisterSchema.parse(payload);
  assert.equal(parsed.marks[0].attendance_status, 'present');
  assert.throws(() => shiftRegisterSchema.parse({ ...payload, business_date: '2026-08-30' }));
  assert.throws(() => shiftRegisterSchema.parse({ ...payload, marks: [] }));
  assert.equal(personShiftMarkSchema.parse({ shift_template_id: 2, attendance_status: 'present', reason: 'Employee arrived', idempotency_key: 'person-mark-123' }).attendance_status, 'present');
  assert.throws(() => personShiftMarkSchema.parse({ shift_template_id: 2, attendance_status: 'absent', reason: 'No arrival', idempotency_key: 'person-mark-124' }));
  assert.throws(() => personShiftMarkSchema.parse({ shift_template_id: 2, staff_profile_id: 1, attendance_status: 'present', reason: 'Employee arrived', idempotency_key: 'person-mark-123' }));
});

test('worked-time thresholds never classify an attending employee as absent', () => {
  const { workedStatus } = loadService();
  assert.equal(workedStatus(450, 600).status, 'present');
  assert.equal(workedStatus(300, 600).status, 'half_day');
  assert.equal(workedStatus(299, 600).status, 'less_than_half_day');
  assert.notEqual(workedStatus(1, 600).status, 'absent');
});

test('half-day leave metadata remains available when the other half is worked', () => {
  const service = require('node:fs').readFileSync(require.resolve('../src/modules/attendance/attendance.service'), 'utf8');
  assert.match(service, /approvedLeave\?\.day_part === 'full_day'/);
  assert.match(service, /\.\.\.leaveFields, scheduled: true/);
});

test('next arrival auto-closes an earlier open shift at its scheduled end', () => {
  const service = require('node:fs').readFileSync(require.resolve('../src/modules/attendance/attendance.service'), 'utf8');
  assert.match(service, /autoClosePreviousShift/);
  assert.match(service, /auto-close-next-arrival/);
  assert.match(service, /st\.is_overnight/);
  assert.match(service, /AT TIME ZONE/);
});

test('only shift-wise attendance routes are exposed for roster submission', () => {
  const routes = require('node:fs').readFileSync(require.resolve('../src/modules/attendance/attendance.routes'), 'utf8');
  assert.match(routes, /post\('\/shift-register'/);
  assert.match(routes, /shift-register\/staff\/:staffId/);
  assert.match(routes, /clock-out/);
  assert.doesNotMatch(routes, /post\('\/daily-register'/);
  assert.doesNotMatch(routes, /post\('\/clock'/);
});

test('attendance report filters accept shift and employee search', () => {
  const { rangeSchema } = require('../src/modules/attendance/attendance.schema');
  const parsed = rangeSchema.parse({ from: '2026-08-01', to: '2026-08-31', shift_template_id: '2', search: 'STF-00003' });
  assert.equal(parsed.shift_template_id, 2);
  assert.equal(parsed.search, 'STF-00003');
});
