require('dotenv').config({ quiet: true });

const db = require('../db/knex');

async function main() {
  if (process.env.DB_CLIENT !== 'postgres') throw new Error('Shift clock-in backfill requires DB_CLIENT=postgres.');
  const candidates = await db('attendance_daily_marks as mark')
    .join('attendance_shift_registers as register', function joinRegister() {
      this.on('register.id', '=', 'mark.shift_register_id').andOn('register.shop_id', '=', 'mark.shop_id');
    })
    .leftJoin('attendance_clock_events as event', function joinClockIn() {
      this.on('event.attendance_shift_register_id', '=', 'register.id')
        .andOn('event.staff_profile_id', '=', 'mark.staff_profile_id')
        .andOnVal('event.event_type', '=', 'clock_in');
    })
    .where('mark.attendance_status', 'present')
    .whereNotNull('mark.shift_register_id')
    .whereNull('event.id')
    .select('mark.shop_id', 'mark.staff_profile_id', 'register.id as register_id', 'register.business_date', 'register.submitted_at', 'register.submitted_by')
    .orderBy('register.id').orderBy('mark.staff_profile_id')
    .limit(1000);

  if (candidates.length) {
    await db('attendance_clock_events').insert(candidates.map((row) => ({
      shop_id: row.shop_id,
      staff_profile_id: row.staff_profile_id,
      event_type: 'clock_in',
      occurred_at: row.submitted_at,
      business_date: row.business_date,
      source_type: 'register',
      device_id: `shift-attendance:${row.register_id}`,
      attendance_shift_register_id: row.register_id,
      actor_user_id: row.submitted_by,
      idempotency_key: `shift-clock-in:${row.register_id}:${row.staff_profile_id}`,
    }))).onConflict(['shop_id', 'idempotency_key']).ignore();
  }
  console.log(JSON.stringify({ checked: true, inserted: candidates.length, bounded_limit: 1000 }));
}

main().catch((error) => {
  console.error(`Shift clock-in backfill failed: ${error.message}`);
  process.exitCode = 1;
}).finally(() => db.destroy());
