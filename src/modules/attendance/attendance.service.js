const db = require('../../../db/knex');
const repository = require('./attendance.repository');
const { templateSchema, scheduleSchema, holidaySchema, clockSchema, correctionSchema, reviewSchema, rangeSchema, snapshotSchema, shiftRegisterQuerySchema, shiftRegisterSchema, shiftClockOutSchema, personShiftMarkSchema } = require('./attendance.schema');

function httpError(status, message) { const error = new Error(message); error.status = status; return error; }
function shopId(user) { const id = Number(user?.shop_id); if (!Number.isInteger(id) || id <= 0) throw httpError(403, 'Select a restaurant to use attendance.'); return id; }
function isManager(user) { return ['admin', 'manager', 'superadmin'].includes(String(user?.role).toLowerCase()) || user?.permissions?.some((p) => ['attendance.manage_schedules', 'attendance.approve'].includes(p)); }
function localParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  return Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
}
function businessDate(date, timezone) { const p = localParts(date, timezone); return `${p.year}-${p.month}-${p.day}`; }
function storedDate(value, timezone) {
  if (typeof value === 'string') {
    const match = value.match(/^\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return businessDate(value, timezone);
  throw httpError(500, 'Attendance contains an invalid business date.');
}
function dateRangeDays(from, to) {
  const start = new Date(`${from}T00:00:00Z`); const end = new Date(`${to}T00:00:00Z`);
  const count = Math.floor((end - start) / 86400000) + 1;
  if (count < 1 || count > 62) throw httpError(400, 'Attendance ranges must contain 1 to 62 days.');
  return Array.from({ length: count }, (_, index) => new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10));
}
function minutes(time) { const [hour, minute] = String(time).slice(0, 5).split(':').map(Number); return hour * 60 + minute; }
function scheduledMinutes(schedule) { if (!schedule || schedule.is_day_off) return 0; const start = minutes(schedule.start_time); let end = minutes(schedule.end_time); if (schedule.is_overnight) end += 1440; return Math.max(0, end - start - Number(schedule.unpaid_break_minutes || 0)); }
function nextDate(value) { const date=new Date(`${value}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+1);return date.toISOString().slice(0,10); }
function shiftEnded(date,schedule,now,timezone){const local=localParts(now,timezone),localDate=`${local.year}-${local.month}-${local.day}`,localMinute=Number(local.hour)*60+Number(local.minute),endMinute=minutes(schedule.end_time);if(!schedule.is_overnight)return localDate>date||(localDate===date&&localMinute>=endMinute);const endDate=nextDate(date);return localDate>endDate||(localDate===endDate&&localMinute>=endMinute);}
function workedStatus(workMinutes,requiredMinutes){const ratio=requiredMinutes>0?workMinutes/requiredMinutes:1;return{ratio,status:ratio>=.75?'present':ratio>=.5?'half_day':'less_than_half_day'};}
function validateTemplateTimes(data) {
  if (data.start_time === data.end_time) throw httpError(400, 'Shift start and end time must differ.');
  const inferredOvernight = minutes(data.end_time) < minutes(data.start_time);
  if (inferredOvernight !== data.is_overnight) throw httpError(400, inferredOvernight ? 'This shift crosses midnight and must be marked overnight.' : 'Overnight is only valid when end time is earlier than start time.');
}
function applyDailyMark(row, mark) { if (!mark) return row; const common = { ...row, manual_mark: { id: mark.id, attendance_status: mark.attendance_status, reason: mark.reason, marked_by: mark.marked_by, created_at: mark.created_at } }; if (mark.attendance_status === 'present') return mark.shift_register_id ? common : { ...common, status: 'present' }; if (mark.attendance_status === 'absent') return { ...common, status: 'unauthorized_absence', work_minutes: 0 }; if (mark.attendance_status === 'paid_leave') return { ...common, status: 'approved_leave', leave_name: 'Shift register: paid leave', leave_is_paid: true, work_minutes: 0 }; if (mark.attendance_status === 'unpaid_leave') return { ...common, status: 'approved_leave', leave_name: 'Shift register: unpaid leave', leave_is_paid: false, work_minutes: 0 }; if (mark.attendance_status === 'holiday') return { ...common, status: 'holiday', scheduled: false, work_minutes: 0 }; return { ...common, status: 'weekly_off', scheduled: false, work_minutes: 0 }; }

async function listTemplates(user) { return repository.templates(shopId(user)); }
async function listStaffOptions(user) {
  const tenant = shopId(user);
  const query = db('staff_profiles').where({ shop_id: tenant }).whereNot('employment_status', 'terminated')
    .select('id', 'full_name', 'employee_id', 'department', 'designation').orderBy('full_name').limit(500);
  if (!isManager(user)) query.where({ user_id: user.id });
  return query;
}
async function createTemplate(user, payload) {
  const tenant = shopId(user); const data = templateSchema.parse(payload);
  validateTemplateTimes(data);
  const [created] = await db('attendance_shift_templates').insert({ ...data, shop_id: tenant, grace_minutes: data.grace_minutes ?? null, created_by: user.id }).returning('*');
  return created;
}
async function versionTemplate(user, rawId, payload) {
  const tenant = shopId(user); const data = templateSchema.parse(payload); const id = Number(rawId);
  validateTemplateTimes(data);
  return db.transaction(async (trx) => {
    const existing = await trx('attendance_shift_templates').where({ id, shop_id: tenant, is_active: true }).forUpdate().first();
    if (!existing) throw httpError(404, 'Shift template not found.');
    await trx('attendance_shift_templates').where({ id }).update({ is_active: false });
    const [created] = await trx('attendance_shift_templates').insert({ ...data, shop_id: tenant, version: existing.version + 1, supersedes_id: id, grace_minutes: data.grace_minutes ?? null, created_by: user.id }).returning('*');
    return created;
  });
}
async function saveSchedule(user, payload) {
  const tenant = shopId(user); const data = scheduleSchema.parse(payload);
  return db.transaction(async (trx) => {
    if (!await repository.staff(tenant, data.staff_profile_id, trx)) throw httpError(404, 'Staff profile not found.');
    const templateIds = [...new Set(data.days.map((d) => d.shift_template_id).filter(Boolean))];
    if (templateIds.length) {
      const count = await trx('attendance_shift_templates').where({ shop_id: tenant, is_active: true }).whereIn('id', templateIds).count({ count: '*' }).first();
      if (Number(count.count) !== templateIds.length) throw httpError(400, 'One or more shift templates are unavailable.');
    }
    const previousDay = new Date(`${data.effective_from}T00:00:00Z`); previousDay.setUTCDate(previousDay.getUTCDate() - 1);
    await trx('attendance_weekly_schedules').where({ shop_id: tenant, staff_profile_id: data.staff_profile_id }).whereNull('effective_to').where('effective_from', '<', data.effective_from).update({ effective_to: previousDay.toISOString().slice(0, 10) });
    await trx('attendance_weekly_schedules').where({ shop_id: tenant, staff_profile_id: data.staff_profile_id, effective_from: data.effective_from }).del();
    await trx('attendance_weekly_schedules').insert(data.days.map((day) => ({ shop_id: tenant, staff_profile_id: data.staff_profile_id, weekday: day.weekday, shift_template_id: day.is_day_off ? null : day.shift_template_id, is_day_off: day.is_day_off, effective_from: data.effective_from, created_by: user.id })));
    return { saved: true };
  });
}
async function addHoliday(user, payload) { const data = holidaySchema.parse(payload); const [row] = await db('attendance_holidays').insert({ ...data, shop_id: shopId(user), created_by: user.id }).onConflict(['shop_id', 'holiday_date']).merge({ name: data.name, is_paid: data.is_paid }).returning('*'); return row; }

async function resolveClockStaff(user, tenant, requestedId) {
  if (requestedId && isManager(user)) {
    const profile = await repository.staff(tenant, requestedId); if (!profile) throw httpError(404, 'Staff profile not found.'); return profile;
  }
  const own = await repository.staffForUser(tenant, user.id); if (!own) throw httpError(403, 'Your login is not linked to a staff profile.');
  if (requestedId && requestedId !== own.id) throw httpError(403, 'You can only record your own attendance.');
  return own;
}
async function clock(user, payload) {
  const tenant = shopId(user); const data = clockSchema.parse(payload); const profile = await resolveClockStaff(user, tenant, data.staff_profile_id);
  const allowedAfter = { clock_in: [null, 'clock_out'], break_start: ['clock_in', 'break_end'], break_end: ['break_start'], clock_out: ['clock_in', 'break_end'] };
  return db.transaction(async (trx) => {
    const duplicate = await trx('attendance_clock_events').where({ shop_id: tenant, idempotency_key: data.idempotency_key }).first();
    if (duplicate) return { event: duplicate, duplicate: true };
    const latest = await repository.latestEvent(tenant, profile.id, trx); const config = await repository.settings(tenant, trx); const now = new Date();
    const staleOpenShift = latest && latest.event_type !== 'clock_out' && now - new Date(latest.occurred_at) > config.max_shift_hours * 60 * 60 * 1000;
    if (!allowedAfter[data.event_type].includes(latest?.event_type || null) && !(data.event_type === 'clock_in' && staleOpenShift)) throw httpError(409, `Cannot ${data.event_type.replace('_', ' ')} after ${latest?.event_type?.replace('_', ' ') || 'no previous event'}.`);
    if (data.source_type === 'device' && !data.device_id) throw httpError(400, 'Device attribution is required for device clock events.');
    if (data.source_type === 'register') {
      if (!data.register_shift_id) throw httpError(400, 'Register-shift attribution is required for register clock events.');
      if (!await trx('shifts').where({ id: data.register_shift_id, shop_id: tenant }).first()) throw httpError(400, 'Register shift does not belong to this restaurant.');
    }
    const date = data.event_type === 'clock_in' || !latest || latest.event_type === 'clock_out' ? businessDate(now, config.timezone) : storedDate(latest.business_date, config.timezone);
    const [event] = await trx('attendance_clock_events').insert({ shop_id: tenant, staff_profile_id: profile.id, event_type: data.event_type, occurred_at: now.toISOString(), business_date: date, source_type: data.source_type, device_id: data.device_id || null, register_shift_id: data.register_shift_id || null, actor_user_id: user.id, idempotency_key: data.idempotency_key }).returning('*');
    return { event, duplicate: false };
  });
}
async function clockState(user) {
  const tenant = shopId(user); const profile = await resolveClockStaff(user, tenant);
  return { staff: { id: profile.id, full_name: profile.full_name }, latest_event: await repository.latestEvent(tenant, profile.id) || null };
}

function effectiveEvents(events, adjustments) {
  const replaced = new Set(adjustments.filter((a) => a.adjustment_type === 'replace_event').map((a) => Number(a.raw_event_id)));
  return [...events.filter((event) => !replaced.has(Number(event.id))), ...adjustments.filter((a) => a.adjustment_type !== 'classify_absence').map((a) => ({ id: `a-${a.id}`, event_type: a.effective_event_type, occurred_at: a.effective_occurred_at, adjusted: true }))].sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
}
function summarizeDay(date, schedule, events, adjustments, holiday, approvedLeave, config, nowDate) {
  const absence = adjustments.find((a) => a.adjustment_type === 'classify_absence')?.absence_type;
  if (holiday) return { date, status: 'holiday', holiday: holiday.name, scheduled: false, events: effectiveEvents(events, adjustments), work_minutes: 0 };
  if (!schedule || schedule.is_day_off) return { date, status: 'weekly_off', scheduled: false, events: effectiveEvents(events, adjustments), work_minutes: 0 };
  const effective = effectiveEvents(events, adjustments); const clockIn = effective.find((e) => e.event_type === 'clock_in'); const clockOut = [...effective].reverse().find((e) => e.event_type === 'clock_out');
  const leaveFields = approvedLeave ? { leave_name: approvedLeave.name, leave_category: approvedLeave.category, leave_is_paid: approvedLeave.is_paid, day_part: approvedLeave.day_part } : {};
  if (approvedLeave?.day_part === 'full_day' || (approvedLeave && !clockIn)) return { date, status: 'approved_leave', ...leaveFields, scheduled: true, scheduled_minutes: scheduledMinutes(schedule), shift_name: schedule.shift_name, events: effective, work_minutes: 0 };
  if (absence) return { date, status: `${absence}_absence`, scheduled: true, shift_name: schedule.shift_name, events: effective, work_minutes: 0 };
  if (!clockIn) return { date, status: shiftEnded(date,schedule,new Date(),config.timezone) ? 'absent' : 'scheduled', scheduled: true, scheduled_minutes: scheduledMinutes(schedule), shift_name: schedule.shift_name, events: effective, work_minutes: 0 };
  let breakMinutes = 0; let breakStart = null;
  effective.forEach((event) => { if (event.event_type === 'break_start') breakStart = new Date(event.occurred_at); if (event.event_type === 'break_end' && breakStart) { breakMinutes += Math.max(0, (new Date(event.occurred_at) - breakStart) / 60000); breakStart = null; } });
  const end = clockOut ? new Date(clockOut.occurred_at) : new Date(); const workMinutes = Math.max(0, Math.round((end - new Date(clockIn.occurred_at)) / 60000 - breakMinutes));
  const inLocal = localParts(new Date(clockIn.occurred_at), config.timezone); const inMinutes = Number(inLocal.hour) * 60 + Number(inLocal.minute);
  const grace = schedule.grace_minutes ?? config.default_grace_minutes; const lateMinutes = Math.max(0, inMinutes - minutes(schedule.start_time) - grace);
  let earlyMinutes = 0;
  if (clockOut) { const outLocal = localParts(new Date(clockOut.occurred_at), config.timezone); let outMinutes = Number(outLocal.hour) * 60 + Number(outLocal.minute); if (schedule.is_overnight && `${outLocal.year}-${outLocal.month}-${outLocal.day}` > date) outMinutes += 1440; const expected = minutes(schedule.end_time) + (schedule.is_overnight ? 1440 : 0); earlyMinutes = Math.max(0, expected - outMinutes - config.early_departure_grace_minutes); }
  const required=scheduledMinutes(schedule),classification=workedStatus(workMinutes,required),workedRatio=classification.ratio,completedStatus=classification.status;
  return { date, status: clockOut ? completedStatus : (date === nowDate ? 'clocked_in' : 'missing_clock_out'), ...leaveFields, scheduled: true, scheduled_minutes: required, worked_ratio: workedRatio, shift_name: schedule.shift_name, events: effective, work_minutes: workMinutes, late_minutes: lateMinutes, early_departure_minutes: earlyMinutes };
}
async function calendar(user, rawQuery) {
  const tenant = shopId(user); const query = rangeSchema.parse(rawQuery); const dates = dateRangeDays(query.from, query.to);
  let requestedStaff = query.staff_profile_id;
  if (!isManager(user)) { const own = await repository.staffForUser(tenant, user.id); if (!own) throw httpError(403, 'Your login is not linked to a staff profile.'); requestedStaff = own.id; }
  const [data, config] = await Promise.all([repository.calendarData(tenant, query.from, query.to, requestedStaff, query.shift_template_id, query.search), repository.settings(tenant)]);
  const approvedLeaves = await require('../leave/leave.service').approvedCalendar(tenant, query.from, query.to, data.people.map((person) => person.id));
  const holidayMap = new Map(data.holidays.map((row) => [storedDate(row.holiday_date, config.timezone), row])); const nowDate = businessDate(new Date(), config.timezone);
  const rows = data.people.flatMap((person) => dates.map((date) => {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const schedules = data.schedules.filter((schedule) => Number(schedule.staff_profile_id) === Number(person.id) && Number(schedule.weekday) === weekday && storedDate(schedule.effective_from, config.timezone) <= date && (!schedule.effective_to || storedDate(schedule.effective_to, config.timezone) >= date)).sort((a, b) => storedDate(b.effective_from, config.timezone).localeCompare(storedDate(a.effective_from, config.timezone)));
    const mark = data.dailyMarks.find((item) => Number(item.staff_profile_id) === Number(person.id) && storedDate(item.business_date, config.timezone) === date);
    const events = data.events.filter((event) => Number(event.staff_profile_id) === person.id
      && storedDate(event.business_date, config.timezone) === date
      && (!mark?.shift_register_id || Number(event.attendance_shift_register_id) === Number(mark.shift_register_id)));
    const adjustments = data.adjustments.filter((adjustment) => Number(adjustment.staff_profile_id) === Number(person.id) && storedDate(adjustment.business_date, config.timezone) === date);
    const approvedLeave = approvedLeaves.find((leave) => Number(leave.staff_profile_id) === Number(person.id) && storedDate(leave.start_date, config.timezone) <= date && storedDate(leave.end_date, config.timezone) >= date);
    return { staff: person, ...applyDailyMark(summarizeDay(date, schedules[0], events, adjustments, holidayMap.get(date), approvedLeave, config, nowDate), mark) };
  }));
  const summary = rows.reduce((out, row) => {
    out[row.status] = (out[row.status] || 0) + 1;
    if (row.manual_mark?.attendance_status === 'present') out.marked_present += 1;
    if (Number(row.late_minutes) > 0) out.late_count += 1;
    out.work_minutes += row.work_minutes || 0;
    return out;
  }, { work_minutes: 0, marked_present: 0, late_count: 0 });
  return { timezone: config.timezone, rows, summary };
}

async function countScheduledWorkDays(tenant, staffId, from, to) {
  const dates = dateRangeDays(from, to); const [data, config] = await Promise.all([repository.calendarData(tenant, from, to, staffId), repository.settings(tenant)]);
  const holidays = new Set(data.holidays.map((row) => storedDate(row.holiday_date, config.timezone)));
  return dates.filter((date) => {
    if (holidays.has(date)) return false;
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    return data.schedules.some((schedule) => Number(schedule.staff_profile_id) === Number(staffId) && Number(schedule.weekday) === weekday && !schedule.is_day_off && storedDate(schedule.effective_from, config.timezone) <= date && (!schedule.effective_to || storedDate(schedule.effective_to, config.timezone) >= date));
  }).length;
}

async function requestCorrection(user, payload) {
  const tenant = shopId(user); const data = correctionSchema.parse(payload); const profile = await resolveClockStaff(user, tenant, data.staff_profile_id);
  if (data.correction_type === 'replace_event' && !data.raw_event_id) throw httpError(400, 'A raw event is required for replacement.');
  if (data.correction_type === 'classify_absence' && !data.proposed_absence_type) throw httpError(400, 'Absence classification is required.');
  if (data.correction_type !== 'classify_absence' && (!data.proposed_event_type || !data.proposed_occurred_at)) throw httpError(400, 'Proposed event type and time are required.');
  if (data.raw_event_id && !await db('attendance_clock_events').where({ id: data.raw_event_id, shop_id: tenant, staff_profile_id: profile.id }).first()) throw httpError(400, 'Raw event does not belong to this staff member.');
  const [row] = await db('attendance_corrections').insert({ ...data, shop_id: tenant, staff_profile_id: profile.id, requested_by: user.id }).returning('*'); return row;
}
async function listCorrections(user) { return repository.pendingCorrections(shopId(user)); }
async function reviewCorrection(user, rawId, payload) {
  const tenant = shopId(user); const data = reviewSchema.parse(payload); const id = Number(rawId);
  return db.transaction(async (trx) => {
    const correction = await trx('attendance_corrections').where({ id, shop_id: tenant }).forUpdate().first();
    if (!correction) throw httpError(404, 'Correction request not found.'); if (correction.status !== 'pending') throw httpError(409, 'Correction request has already been reviewed.');
    if (Number(correction.requested_by) === Number(user.id)) throw httpError(409, 'A correction must be approved by a different user.');
    await trx('attendance_corrections').where({ id }).update({ status: data.decision, review_note: data.note, reviewed_by: user.id, reviewed_at: trx.fn.now() });
    if (data.decision === 'approved') await trx('attendance_adjustments').insert({ shop_id: tenant, staff_profile_id: correction.staff_profile_id, correction_id: id, business_date: correction.business_date, adjustment_type: correction.correction_type, raw_event_id: correction.raw_event_id, effective_event_type: correction.proposed_event_type, effective_occurred_at: correction.proposed_occurred_at, absence_type: correction.proposed_absence_type, approved_by: user.id });
    return { id, status: data.decision };
  });
}

async function listSnapshots(user) {
  return db('attendance_summary_snapshots').where({ shop_id: shopId(user) }).orderBy('period_start', 'desc').orderBy('id', 'desc').limit(100);
}
async function createSnapshot(user, payload) {
  const tenant = shopId(user); const data = snapshotSchema.parse(payload);
  if (data.period_end < data.period_start) throw httpError(400, 'Snapshot end must be on or after its start.');
  const existing = await db('attendance_summary_snapshots').where({ shop_id: tenant, period_start: data.period_start, period_end: data.period_end, input_version: data.idempotency_key }).first();
  if (existing) return existing;
  const result = await calendar(user, { from: data.period_start, to: data.period_end });
  return db.transaction(async (trx) => {
    const concurrent = await trx('attendance_summary_snapshots').where({ shop_id: tenant, period_start: data.period_start, period_end: data.period_end, input_version: data.idempotency_key }).first();
    if (concurrent) return concurrent;
    const [snapshot] = await trx('attendance_summary_snapshots').insert({ shop_id: tenant, period_start: data.period_start, period_end: data.period_end, timezone: result.timezone, input_version: data.idempotency_key, created_by: user.id }).returning('*');
    const grouped = new Map();
    for (const row of result.rows) { const key = Number(row.staff.id); if (!grouped.has(key)) grouped.set(key, { staff_profile_id: key, rows: [] }); grouped.get(key).rows.push(row); }
    const rows = [...grouped.values()].map(({ staff_profile_id, rows: detail }) => ({
      snapshot_id: snapshot.id, shop_id: tenant, staff_profile_id,
      scheduled_days: detail.filter((r) => r.scheduled).length,
      present_days: detail.reduce((sum,r)=>sum+(r.status==='present'?1:r.status==='half_day'?.5:r.status==='less_than_half_day'?Math.max(0,Math.min(.49,Number(r.worked_ratio||0))):0),0),
      paid_leave_days: detail.filter((r) => r.leave_is_paid === true && r.day_part).reduce((sum, r) => sum + (r.day_part === 'full_day' ? 1 : 0.5), 0),
      paid_full_leave_days: detail.filter((r) => r.leave_is_paid === true && r.day_part === 'full_day').length,
      paid_half_leave_count: detail.filter((r) => r.leave_is_paid === true && r.day_part && r.day_part !== 'full_day').length,
      unpaid_leave_days: detail.filter((r) => r.leave_is_paid === false && r.day_part).reduce((sum, r) => sum + (r.day_part === 'full_day' ? 1 : 0.5), 0),
      absent_days: detail.filter((r) => r.status==='absent'||/absence/.test(r.status)).length,
      work_minutes: detail.reduce((sum, r) => sum + Number(r.work_minutes || 0), 0),
      overtime_minutes: detail.reduce((sum, r) => sum + Math.max(0, Number(r.work_minutes || 0) - Number(r.scheduled_minutes || 0)), 0),
      late_minutes: detail.reduce((sum, r) => sum + Number(r.late_minutes || 0), 0), early_departure_minutes: detail.reduce((sum, r) => sum + Number(r.early_departure_minutes || 0), 0),
      missing_clock_days: detail.filter((r) => /^missing_clock/.test(r.status)).length, detail_json: JSON.stringify(detail),
    }));
    if (rows.length) await trx('attendance_summary_snapshot_rows').insert(rows);
    return snapshot;
  });
}
async function approveSnapshot(user, rawId) {
  const tenant = shopId(user); const id = Number(rawId);
  return db.transaction(async (trx) => { const snapshot = await trx('attendance_summary_snapshots').where({ id, shop_id: tenant }).forUpdate().first(); if (!snapshot) throw httpError(404, 'Attendance snapshot not found.'); if (snapshot.status === 'approved') return snapshot; if (Number(snapshot.created_by) === Number(user.id)) throw httpError(409, 'A different user must approve the attendance snapshot.'); const [approved] = await trx('attendance_summary_snapshots').where({ id, status: 'draft' }).update({ status: 'approved', approved_by: user.id, approved_at: trx.fn.now() }).returning('*'); return approved; });
}
async function payrollCalendar(shop,from,to){return calendar({shop_id:shop,role:'manager',permissions:['attendance.approve']},{from,to});}
async function approvedSnapshot(shop, id, trx = db) {
  const snapshot = await trx('attendance_summary_snapshots').where({ id, shop_id: shop, status: 'approved' }).first(); if (!snapshot) return null;
  const rows = await trx('attendance_summary_snapshot_rows').where({ snapshot_id: id, shop_id: shop }); return { ...snapshot, rows };
}
async function scheduledShiftRoster(trx, tenant, shiftId, date) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return trx('attendance_weekly_schedules as ws')
    .join('staff_profiles as sp', function joinStaff() {
      this.on('sp.id', '=', 'ws.staff_profile_id').andOn('sp.shop_id', '=', 'ws.shop_id');
    })
    .where({ 'ws.shop_id': tenant, 'ws.shift_template_id': shiftId, 'ws.weekday': weekday, 'ws.is_day_off': false })
    .where('ws.effective_from', '<=', date)
    .where((query) => query.whereNull('ws.effective_to').orWhere('ws.effective_to', '>=', date))
    .whereNot('sp.employment_status', 'terminated')
    .select('sp.id', 'sp.employee_id', 'sp.full_name', 'sp.department', 'sp.designation')
    .orderBy('sp.full_name');
}

async function shiftRegister(user, rawQuery) {
  const tenant = shopId(user); const query = shiftRegisterQuerySchema.parse(rawQuery);
  const config = await repository.settings(tenant); const date = businessDate(new Date(), config.timezone);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const shifts = await db('attendance_shift_templates as st')
    .join('attendance_weekly_schedules as ws', function joinSchedule() {
      this.on('ws.shift_template_id', '=', 'st.id').andOn('ws.shop_id', '=', 'st.shop_id');
    })
    .leftJoin('attendance_shift_registers as sr', function joinRegister() {
      this.on('sr.shift_template_id', '=', 'st.id').andOn('sr.shop_id', '=', 'st.shop_id').andOnVal('sr.business_date', '=', date);
    })
    .where({ 'st.shop_id': tenant, 'st.is_active': true, 'ws.weekday': weekday, 'ws.is_day_off': false })
    .where('ws.effective_from', '<=', date)
    .where((builder) => builder.whereNull('ws.effective_to').orWhere('ws.effective_to', '>=', date))
    .select('st.id', 'st.name', 'st.start_time', 'st.end_time', 'st.is_overnight', 'sr.id as register_id', 'sr.submitted_at')
    .countDistinct({ staff_count: 'ws.staff_profile_id' })
    .groupBy('st.id', 'sr.id', 'sr.submitted_at')
    .orderBy('st.start_time').orderBy('st.name');
  if (!query.shift_template_id) return { business_date: date, timezone: config.timezone, shifts, staff: [], submitted: false };
  const shift = shifts.find((item) => Number(item.id) === Number(query.shift_template_id));
  if (!shift) throw httpError(404, 'This shift has no scheduled staff for today.');
  const staff = await scheduledShiftRoster(db, tenant, Number(shift.id), date);
  let marks = [];
  let clockEvents = [];
  if (shift.register_id) {
    [marks, clockEvents] = await Promise.all([
      db('attendance_daily_marks').where({ shop_id: tenant, shift_register_id: shift.register_id }).select('id', 'staff_profile_id', 'attendance_status', 'reason', 'created_at', 'supersedes_id').orderBy('id', 'desc'),
      db('attendance_clock_events').where({ shop_id: tenant, attendance_shift_register_id: shift.register_id }).select('staff_profile_id', 'event_type', 'occurred_at').orderBy('occurred_at'),
    ]);
  }
  const byStaff = new Map(); marks.forEach((mark) => { const id=Number(mark.staff_profile_id); if(!byStaff.has(id))byStaff.set(id,mark); });
  return { business_date: date, timezone: config.timezone, shifts, shift, submitted: Boolean(shift.register_id), staff: staff.map((person) => {
    const events = clockEvents.filter((event) => Number(event.staff_profile_id) === Number(person.id));
    return { ...person, mark: byStaff.get(Number(person.id)) || null, clock_in_at: events.find((event) => event.event_type === 'clock_in')?.occurred_at || null, clock_out_at: events.find((event) => event.event_type === 'clock_out')?.occurred_at || null };
  }) };
}

async function autoClosePreviousShift(trx,tenant,staffId,currentDate,timezone,actorUserId){
  const open=await trx('attendance_clock_events as ci')
    .join('attendance_shift_registers as sr','sr.id','ci.attendance_shift_register_id')
    .join('attendance_shift_templates as st','st.id','sr.shift_template_id')
    .where({'ci.shop_id':tenant,'ci.staff_profile_id':staffId,'ci.event_type':'clock_in'})
    .where('ci.business_date','<',currentDate)
    .whereNotExists(function(){this.select(trx.raw('1')).from('attendance_clock_events as co').whereRaw('co.attendance_shift_register_id = ci.attendance_shift_register_id').whereRaw('co.staff_profile_id = ci.staff_profile_id').where('co.event_type','clock_out');})
    .select('ci.business_date','ci.attendance_shift_register_id','st.end_time','st.is_overnight').orderBy('ci.business_date','desc').orderBy('ci.id','desc').first();
  if(!open)return null;
  const priorDate=storedDate(open.business_date,timezone);
  const [event]=await trx('attendance_clock_events').insert({shop_id:tenant,staff_profile_id:staffId,event_type:'clock_out',occurred_at:trx.raw("((?::date + ?::time + CASE WHEN ? THEN interval '1 day' ELSE interval '0 day' END) AT TIME ZONE ?)",[priorDate,String(open.end_time).slice(0,8),Boolean(open.is_overnight),timezone]),business_date:priorDate,source_type:'register',device_id:`auto-close-next-arrival:${open.attendance_shift_register_id}`,attendance_shift_register_id:open.attendance_shift_register_id,actor_user_id:actorUserId,idempotency_key:`auto-close-next-arrival:${open.attendance_shift_register_id}:${staffId}`}).returning('*');
  return event;
}

async function markShiftStaff(user, rawStaffId, payload) {
  const tenant=shopId(user),staffId=Number(rawStaffId),data=personShiftMarkSchema.parse(payload);
  if(!Number.isInteger(staffId)||staffId<=0)throw httpError(400,'Use a valid staff ID.');
  const config=await repository.settings(tenant),date=businessDate(new Date(),config.timezone);
  try{return await db.transaction(async trx=>{
    await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))',[`attendance:${tenant}:${date}:${staffId}`]);
    const shift=await trx('attendance_shift_templates').where({id:data.shift_template_id,shop_id:tenant,is_active:true}).first();
    if(!shift)throw httpError(404,'Shift not found.');
    const roster=await scheduledShiftRoster(trx,tenant,shift.id,date);
    if(!roster.some(person=>Number(person.id)===staffId))throw httpError(409,'This employee is not scheduled on this shift today.');
    await trx('attendance_shift_registers').insert({shop_id:tenant,business_date:date,shift_template_id:shift.id,reason:'Individual attendance submissions',submitted_by:user.id}).onConflict(['shop_id','business_date','shift_template_id']).ignore();
    const register=await trx('attendance_shift_registers').where({shop_id:tenant,business_date:date,shift_template_id:shift.id}).first();
    const latest=await trx('attendance_daily_marks').where({shop_id:tenant,business_date:date,staff_profile_id:staffId}).whereNotNull('shift_register_id').orderBy('id','desc').first();
    if(latest&&latest.attendance_status===data.attendance_status)throw httpError(409,`This employee is already marked ${data.attendance_status.replace('_',' ')} today.`);
    const [mark]=await trx('attendance_daily_marks').insert({shop_id:tenant,staff_profile_id:staffId,business_date:date,attendance_status:data.attendance_status,reason:data.reason,supersedes_id:latest?.id||null,shift_register_id:register.id,marked_by:user.id,idempotency_key:data.idempotency_key}).returning('*');
    if(data.attendance_status==='present'){
      await autoClosePreviousShift(trx,tenant,staffId,date,config.timezone,user.id);
      const existingClockIn=await trx('attendance_clock_events').where({shop_id:tenant,business_date:date,staff_profile_id:staffId,event_type:'clock_in'}).first();
      if(!existingClockIn)await trx('attendance_clock_events').insert({shop_id:tenant,staff_profile_id:staffId,event_type:'clock_in',occurred_at:new Date().toISOString(),business_date:date,source_type:'register',device_id:`shift-attendance:${register.id}`,attendance_shift_register_id:register.id,actor_user_id:user.id,idempotency_key:`person-clock-in:${mark.id}`});
    }
    return{register_id:register.id,mark};
  });}catch(error){if(error?.code==='23505')throw httpError(409,'This attendance submission was already recorded.');throw error;}
}

async function submitShiftRegister(user, payload) {
  const tenant = shopId(user); const data = shiftRegisterSchema.parse(payload);
  const config = await repository.settings(tenant); const date = businessDate(new Date(), config.timezone);
  const ids = data.marks.map((mark) => Number(mark.staff_profile_id));
  if (new Set(ids).size !== ids.length) throw httpError(400, 'Each scheduled employee must appear exactly once.');
  try {
    return await db.transaction(async (trx) => {
      const shift = await trx('attendance_shift_templates').where({ id: data.shift_template_id, shop_id: tenant, is_active: true }).first();
      if (!shift) throw httpError(404, 'Shift not found.');
      if (await trx('attendance_shift_registers').where({ shop_id: tenant, business_date: date, shift_template_id: shift.id }).first()) throw httpError(409, 'Attendance for this shift has already been submitted today.');
      const roster = await scheduledShiftRoster(trx, tenant, shift.id, date); const rosterIds = roster.map((person) => Number(person.id));
      if (!rosterIds.length) throw httpError(409, 'This shift has no scheduled staff for today.');
      if (rosterIds.length !== ids.length || rosterIds.some((id) => !ids.includes(id))) throw httpError(400, 'Submit attendance for every employee scheduled on this shift, with no extra employees.');
      const [register] = await trx('attendance_shift_registers').insert({ shop_id: tenant, business_date: date, shift_template_id: shift.id, reason: data.reason, submitted_by: user.id }).returning('*');
      await trx('attendance_daily_marks').insert(data.marks.map((mark) => ({ ...mark, shop_id: tenant, business_date: date, shift_register_id: register.id, reason: data.reason, marked_by: user.id, idempotency_key: `shift:${register.id}:${mark.staff_profile_id}:${data.idempotency_key}` })));
      const present = data.marks.filter((mark) => mark.attendance_status === 'present');
      if (present.length) {
        const occurredAt = new Date().toISOString();
        await trx('attendance_clock_events').insert(present.map((mark) => ({
          shop_id: tenant,
          staff_profile_id: mark.staff_profile_id,
          event_type: 'clock_in',
          occurred_at: occurredAt,
          business_date: date,
          source_type: 'register',
          device_id: `shift-attendance:${register.id}`,
          attendance_shift_register_id: register.id,
          actor_user_id: user.id,
          idempotency_key: `shift-clock-in:${register.id}:${mark.staff_profile_id}`,
        })));
      }
      return { id: register.id, business_date: date, shift_template_id: shift.id, saved: data.marks.length, submitted_at: register.submitted_at };
    });
  } catch (error) {
    if (error?.code === '23505') throw httpError(409, 'Attendance for this shift has already been submitted today.');
    throw error;
  }
}

async function clockOutShiftRegister(user, rawRegisterId, rawStaffId, payload) {
  const tenant = shopId(user); const registerId = Number(rawRegisterId); const staffId = Number(rawStaffId); const data = shiftClockOutSchema.parse(payload);
  if (!Number.isInteger(registerId) || registerId <= 0 || !Number.isInteger(staffId) || staffId <= 0) throw httpError(400, 'Use valid shift register and staff IDs.');
  try {
    return await db.transaction(async (trx) => {
      const register = await trx('attendance_shift_registers as sr').join('attendance_shift_templates as st', 'st.id', 'sr.shift_template_id')
        .where({ 'sr.id': registerId, 'sr.shop_id': tenant }).select('sr.*', 'st.name as shift_name').forUpdate('sr').first();
      if (!register) throw httpError(404, 'Shift attendance register not found.');
      const config = await repository.settings(tenant, trx); const now = new Date();
      if (now - new Date(register.submitted_at) > Number(config.max_shift_hours) * 60 * 60 * 1000) throw httpError(409, 'This shift register is too old to clock out. Use an attendance correction.');
      const mark = await trx('attendance_daily_marks').where({ shop_id: tenant, shift_register_id: registerId, staff_profile_id: staffId }).orderBy('id','desc').first();
      if (!mark || mark.attendance_status !== 'present') throw httpError(409, 'Only an employee currently marked present in this shift can be clocked out.');
      const clockIn = await trx('attendance_clock_events').where({ shop_id: tenant, attendance_shift_register_id: registerId, staff_profile_id: staffId, event_type: 'clock_in' }).first();
      if (!clockIn) throw httpError(409, 'No shift clock-in exists for this employee.');
      const existing = await trx('attendance_clock_events').where({ shop_id: tenant, attendance_shift_register_id: registerId, staff_profile_id: staffId, event_type: 'clock_out' }).first();
      if (existing) throw httpError(409, 'This employee has already been clocked out for the shift.');
      const [event] = await trx('attendance_clock_events').insert({ shop_id: tenant, staff_profile_id: staffId, event_type: 'clock_out', occurred_at: now.toISOString(), business_date: storedDate(register.business_date, config.timezone), source_type: 'register', device_id: `shift-attendance:${register.id}`, attendance_shift_register_id: register.id, actor_user_id: user.id, idempotency_key: data.idempotency_key }).returning('*');
      return { event, shift_name: register.shift_name };
    });
  } catch (error) {
    if (error?.code === '23505') throw httpError(409, 'This employee has already been clocked out for the shift.');
    throw error;
  }
}

module.exports = { listTemplates, listStaffOptions, createTemplate, versionTemplate, saveSchedule, addHoliday, clock, clockState, calendar, countScheduledWorkDays, requestCorrection, listCorrections, reviewCorrection, listSnapshots, createSnapshot, approveSnapshot, approvedSnapshot, payrollCalendar, shiftRegister, submitShiftRegister, markShiftStaff, clockOutShiftRegister, businessDate, storedDate, dateRangeDays, workedStatus };
