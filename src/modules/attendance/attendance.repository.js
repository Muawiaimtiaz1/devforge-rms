const db = require('../../../db/knex');

function staff(shopId, id, trx = db) { return trx('staff_profiles').where({ shop_id: shopId, id }).first(); }
function staffForUser(shopId, userId, trx = db) { return trx('staff_profiles').where({ shop_id: shopId, user_id: userId }).first(); }
async function settings(shopId, trx = db) {
  await trx('attendance_settings').insert({ shop_id: shopId }).onConflict('shop_id').ignore();
  return trx('attendance_settings').where({ shop_id: shopId }).first();
}
function templates(shopId) { return db('attendance_shift_templates').where({ shop_id: shopId, is_active: true }).orderBy('name').orderBy('version', 'desc'); }
function latestEvent(shopId, staffId, trx = db) { return trx('attendance_clock_events').where({ shop_id: shopId, staff_profile_id: staffId }).orderBy('occurred_at', 'desc').orderBy('id', 'desc').first(); }
function pendingCorrections(shopId) {
  return db('attendance_corrections as c').join('staff_profiles as sp', 'sp.id', 'c.staff_profile_id')
    .where({ 'c.shop_id': shopId }).select('c.*', 'sp.full_name', 'sp.employee_id').orderBy('c.requested_at', 'desc').limit(200);
}
async function calendarData(shopId, from, to, staffId) {
  const staffQuery = db('staff_profiles').where({ shop_id: shopId }).whereNot('employment_status', 'terminated');
  if (staffId) staffQuery.where({ id: staffId });
  const people = await staffQuery.select('id', 'full_name', 'employee_id', 'department', 'designation').orderBy('full_name');
  const ids = people.map((person) => person.id);
  if (!ids.length) return { people, schedules: [], events: [], adjustments: [], holidays: [], dailyMarks: [] };
  const [schedules, events, adjustments, holidays, dailyMarks] = await Promise.all([
    db('attendance_weekly_schedules as ws').leftJoin('attendance_shift_templates as st', 'st.id', 'ws.shift_template_id')
      .where({ 'ws.shop_id': shopId }).whereIn('ws.staff_profile_id', ids).where('ws.effective_from', '<=', to)
      .where((q) => q.whereNull('ws.effective_to').orWhere('ws.effective_to', '>=', from))
      .select('ws.*', 'st.name as shift_name', 'st.start_time', 'st.end_time', 'st.is_overnight', 'st.unpaid_break_minutes', 'st.grace_minutes'),
    db('attendance_clock_events').where({ shop_id: shopId }).whereIn('staff_profile_id', ids).whereBetween('business_date', [from, to]).orderBy('occurred_at'),
    db('attendance_adjustments').where({ shop_id: shopId }).whereIn('staff_profile_id', ids).whereBetween('business_date', [from, to]).orderBy('effective_occurred_at'),
    db('attendance_holidays').where({ shop_id: shopId }).whereBetween('holiday_date', [from, to]).orderBy('holiday_date'),
    db('attendance_daily_marks').where({ shop_id: shopId }).whereIn('staff_profile_id', ids).whereBetween('business_date', [from, to]).orderBy('id','desc'),
  ]);
  return { people, schedules, events, adjustments, holidays, dailyMarks };
}
module.exports = { staff, staffForUser, settings, templates, latestEvent, pendingCorrections, calendarData };
