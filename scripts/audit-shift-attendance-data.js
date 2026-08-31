require('dotenv').config({ quiet: true });

const db = require('../db/knex');

async function main() {
  if (process.env.DB_CLIENT !== 'postgres') throw new Error('Shift attendance audit requires DB_CLIENT=postgres.');
  const shop = await db('shops').orderBy('id').first('id');
  if (!shop) throw new Error('No restaurant exists for the audit.');
  const bindings = Array(6).fill(shop.id);
  const result = await db.raw(`
    SELECT
      (SELECT COUNT(*)::int FROM attendance_shift_templates WHERE shop_id=? AND start_time=end_time) AS invalid_equal_times,
      (SELECT COUNT(*)::int FROM attendance_shift_templates WHERE shop_id=? AND ((end_time<start_time)<>is_overnight)) AS invalid_overnight_flags,
      (SELECT COUNT(*)::int FROM attendance_shift_registers r WHERE r.shop_id=? AND
        (SELECT COUNT(*) FROM attendance_daily_marks m WHERE m.shift_register_id=r.id) <>
        (SELECT COUNT(*) FROM attendance_weekly_schedules ws WHERE ws.shop_id=r.shop_id AND ws.shift_template_id=r.shift_template_id
          AND ws.weekday=EXTRACT(DOW FROM r.business_date) AND ws.is_day_off=false AND ws.effective_from<=r.business_date
          AND (ws.effective_to IS NULL OR ws.effective_to>=r.business_date))) AS incomplete_rosters,
      (SELECT COUNT(*)::int FROM attendance_daily_marks m WHERE m.shop_id=? AND m.shift_register_id IS NOT NULL
        AND m.attendance_status='present' AND NOT EXISTS(SELECT 1 FROM attendance_clock_events e
          WHERE e.attendance_shift_register_id=m.shift_register_id AND e.staff_profile_id=m.staff_profile_id AND e.event_type='clock_in')) AS present_without_clock_in,
      (SELECT COUNT(*)::int FROM attendance_daily_marks m WHERE m.shop_id=? AND m.shift_register_id IS NOT NULL
        AND m.attendance_status<>'present' AND EXISTS(SELECT 1 FROM attendance_clock_events e
          WHERE e.attendance_shift_register_id=m.shift_register_id AND e.staff_profile_id=m.staff_profile_id)) AS nonpresent_with_clock_event,
      (SELECT COUNT(*)::int FROM attendance_clock_events o WHERE o.shop_id=? AND o.attendance_shift_register_id IS NOT NULL
        AND o.event_type='clock_out' AND NOT EXISTS(SELECT 1 FROM attendance_clock_events i
          WHERE i.attendance_shift_register_id=o.attendance_shift_register_id AND i.staff_profile_id=o.staff_profile_id
            AND i.event_type='clock_in' AND i.occurred_at<=o.occurred_at)) AS invalid_clock_outs
  `, bindings);
  const rows = await db('attendance_shift_registers as r')
    .join('attendance_shift_templates as st', 'st.id', 'r.shift_template_id')
    .join('attendance_daily_marks as m', 'm.shift_register_id', 'r.id')
    .join('staff_profiles as sp', 'sp.id', 'm.staff_profile_id')
    .leftJoin('attendance_clock_events as ci', function joinIn() { this.on('ci.attendance_shift_register_id', '=', 'r.id').andOn('ci.staff_profile_id', '=', 'sp.id').andOnVal('ci.event_type', '=', 'clock_in'); })
    .leftJoin('attendance_clock_events as co', function joinOut() { this.on('co.attendance_shift_register_id', '=', 'r.id').andOn('co.staff_profile_id', '=', 'sp.id').andOnVal('co.event_type', '=', 'clock_out'); })
    .where('r.shop_id', shop.id)
    .select('r.id', 'r.business_date', 'st.name', 'st.start_time', 'st.end_time', 'st.is_overnight', 'sp.full_name', 'sp.employee_id', 'm.attendance_status', 'ci.occurred_at as clock_in', 'co.occurred_at as clock_out')
    .orderBy('r.id').orderBy('sp.full_name').limit(100);
  const integrity = result.rows[0];
  const complete = Object.values(integrity).every((value) => Number(value) === 0);
  console.log(JSON.stringify({ checked: true, shop: shop.id, integrity, rows, complete }));
  if (!complete) throw new Error('Shift attendance data integrity audit found inconsistencies.');
}

main().catch((error) => {
  console.error(`Shift attendance audit failed: ${error.message}`);
  process.exitCode = 1;
}).finally(() => db.destroy());
