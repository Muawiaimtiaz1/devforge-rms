require('dotenv').config({ quiet: true });

const db = require('../db/knex');
const attendance = require('../src/modules/attendance/attendance.service');

async function main() {
  if (process.env.DB_CLIENT !== 'postgres') throw new Error('Shift attendance verification requires DB_CLIENT=postgres.');
  const shop = await db('shops').orderBy('id').first('id');
  if (!shop) throw new Error('No restaurant exists for shift attendance verification.');
  const base = await attendance.shiftRegister({ shop_id: shop.id }, {});
  let selected = null;
  let filteredReportRows = null;
  if (base.shifts.length) selected = await attendance.shiftRegister({ shop_id: shop.id }, { shift_template_id: base.shifts[0].id });
  if (selected?.staff.length) {
    const person = selected.staff[0];
    const report = await attendance.calendar({ shop_id: shop.id, role: 'manager' }, { from: base.business_date, to: base.business_date, shift_template_id: base.shifts[0].id, search: person.employee_id });
    filteredReportRows = report.rows.length;
  }
  const constraints = await db.raw(`
    SELECT
      EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'attendance_shift_registers'::regclass
          AND contype = 'u'
          AND pg_get_constraintdef(oid) LIKE '%shop_id, business_date, shift_template_id%'
      ) AS one_submission_per_shift,
      EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE trigger_name = 'trg_attendance_shift_registers_immutable'
      ) AS immutable_registers,
      EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'uq_attendance_shift_mark_staff_date'
          AND indexdef LIKE '%shop_id, business_date, staff_profile_id%'
      ) AS one_mark_per_employee_date,
      EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'uq_attendance_shift_clock_event'
          AND indexdef LIKE '%attendance_shift_register_id, staff_profile_id, event_type%'
      ) AS one_clock_event_per_type
  `);
  const checks = constraints.rows[0];
  const output = {
    checked: true,
    shop: shop.id,
    business_date: base.business_date,
    timezone: base.timezone,
    shifts_today: base.shifts.length,
    selected_roster_size: selected?.staff.length || 0,
    selected_submitted: selected?.submitted || false,
    filtered_report_rows: filteredReportRows,
    ...checks,
  };
  console.log(JSON.stringify(output));
  if (!checks.one_submission_per_shift || !checks.immutable_registers || !checks.one_mark_per_employee_date || !checks.one_clock_event_per_type) throw new Error('Shift attendance database protections are incomplete.');
}

main().catch((error) => {
  console.error(`Shift attendance verification failed: ${error.message}`);
  process.exitCode = 1;
}).finally(() => db.destroy());
