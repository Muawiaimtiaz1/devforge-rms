const db = require('../../../db/knex');
const repository = require('./leave.repository');
const attendanceService = require('../attendance/attendance.service');
const notificationService = require('../../../services/NotificationService');
const { leaveTypeSchema, allocationSchema, requestSchema, decisionSchema, listSchema } = require('./leave.schema');

function httpError(status, message) { const error = new Error(message); error.status = status; return error; }
function tenant(user) { const id = Number(user?.shop_id); if (!Number.isInteger(id) || id <= 0) throw httpError(403, 'Select a restaurant to use leave management.'); return id; }
function mayManage(user) { return ['admin','manager','superadmin'].includes(String(user?.role).toLowerCase()) || user?.permissions?.some((p) => ['leave.manage','leave.approve'].includes(p)); }
async function ownOrManagedStaff(user, requestedId, trx = db) {
  const shopId = tenant(user);
  if (requestedId && mayManage(user)) { const profile = await repository.staff(shopId, requestedId, trx); if (!profile) throw httpError(404, 'Staff profile not found.'); return profile; }
  const own = await repository.staffForUser(shopId, user.id, trx); if (!own) throw httpError(403, 'Your login is not linked to a staff profile.');
  if (requestedId && Number(requestedId) !== Number(own.id)) throw httpError(403, 'You can only manage your own leave request.'); return own;
}
async function notify(targetUserId, actor, title, message) {
  if (!targetUserId) return;
  await notificationService.create({ shop_id: actor.shop_id, target_user_id: targetUserId, type: 'assignment', priority: 'normal', title, message, action_label: 'Open leave', action_url: '/app/staff', status: 'active' }, actor).catch(() => {});
}
async function listTypes(user) { return repository.types(tenant(user)); }
async function listStaffOptions(user) { const shopId = tenant(user); const query = db('staff_profiles').where({ shop_id: shopId }).whereNot('employment_status', 'terminated').select('id','full_name','employee_id').orderBy('full_name').limit(500); if (!mayManage(user)) query.where({ user_id: user.id }); return query; }
async function createType(user, payload) { const data = leaveTypeSchema.parse(payload); const [row] = await db('leave_types').insert({ ...data, shop_id: tenant(user), created_by: user.id }).returning('*'); return row; }
async function allocateBalance(user, payload) {
  const shopId = tenant(user); const data = allocationSchema.parse(payload); if (data.period_end < data.period_start) throw httpError(400, 'Balance period end must be on or after its start.');
  return db.transaction(async (trx) => {
    if (!await repository.staff(shopId, data.staff_profile_id, trx)) throw httpError(404, 'Staff profile not found.');
    const type = await repository.type(shopId, data.leave_type_id, trx); if (!type) throw httpError(404, 'Leave type not found.'); if (!type.requires_balance) throw httpError(400, 'This leave type does not use a balance.');
    const overlap = await trx('leave_balance_periods').where({ shop_id: shopId, staff_profile_id: data.staff_profile_id, leave_type_id: data.leave_type_id }).where('period_start', '<=', data.period_end).where('period_end', '>=', data.period_start).first();
    let period = overlap;
    if (overlap && (String(overlap.period_start).slice(0,10) !== data.period_start || String(overlap.period_end).slice(0,10) !== data.period_end)) throw httpError(409, 'This balance period overlaps an existing period.');
    if (!period) [period] = await trx('leave_balance_periods').insert({ shop_id: shopId, staff_profile_id: data.staff_profile_id, leave_type_id: data.leave_type_id, period_start: data.period_start, period_end: data.period_end, opening_days: 0, created_by: user.id }).returning('*');
    const [entry] = await trx('leave_balance_ledger').insert({ shop_id: shopId, balance_period_id: period.id, entry_type: 'allocation', days: data.days, reason: data.reason, actor_user_id: user.id }).returning('*'); return entry;
  });
}
async function listBalances(user, rawStaffId) { const profile = await ownOrManagedStaff(user, rawStaffId ? Number(rawStaffId) : null); const rows = await repository.balances(tenant(user), profile.id); return { staff: { id: profile.id, full_name: profile.full_name }, balances: rows.map((row) => ({ ...row, available_days: Number(row.opening_days || 0) + Number(row.ledger_days || 0) })) }; }
async function createRequest(user, payload) {
  const shopId = tenant(user); const data = requestSchema.parse(payload); if (data.end_date < data.start_date) throw httpError(400, 'Leave end date must be on or after its start date.');
  const profile = await ownOrManagedStaff(user, data.staff_profile_id);
  const type = await repository.type(shopId, data.leave_type_id); if (!type || !type.is_active) throw httpError(404, 'Leave type not found.');
  if (data.day_part !== 'full_day' && (!type.allow_half_day || data.start_date !== data.end_date)) throw httpError(400, 'Half-day leave must be allowed and use one date.');
  const days = data.day_part === 'full_day' ? await attendanceService.countScheduledWorkDays(shopId, profile.id, data.start_date, data.end_date) : 0.5;
  if (days <= 0) throw httpError(400, 'The selected dates contain no scheduled work time.');
  const row = await db.transaction(async (trx) => {
    const overlap = await trx('leave_requests').where({ shop_id: shopId, staff_profile_id: profile.id }).whereIn('status', ['pending','approved']).where('start_date', '<=', data.end_date).where('end_date', '>=', data.start_date).first();
    if (overlap) throw httpError(409, 'This request overlaps pending or approved leave.');
    const [created] = await trx('leave_requests').insert({ shop_id: shopId, staff_profile_id: profile.id, leave_type_id: data.leave_type_id, start_date: data.start_date, end_date: data.end_date, day_part: data.day_part, requested_days: days, reason: data.reason, requested_by: user.id }).returning('*');
    await trx('leave_approval_history').insert({ shop_id: shopId, leave_request_id: created.id, from_status: null, to_status: 'pending', actor_user_id: user.id, note: 'Leave request submitted.' }); return created;
  });
  const manager = profile.manager_staff_id ? await db('staff_profiles').where({ id: profile.manager_staff_id, shop_id: shopId }).first('user_id') : null;
  await notify(manager?.user_id, user, 'Leave request awaiting review', `${profile.full_name} requested ${days} day(s) of ${type.name}.`); return row;
}
async function listRequests(user, rawQuery) {
  const shopId = tenant(user); const filters = listSchema.parse(rawQuery); let staffId = null;
  if (!mayManage(user)) staffId = (await ownOrManagedStaff(user)).id;
  const rows = await repository.requests(shopId, filters, staffId); const history = await repository.history(shopId, rows.map((row) => row.id));
  const byRequest = history.reduce((map, event) => map.set(Number(event.leave_request_id), [...(map.get(Number(event.leave_request_id)) || []), event]), new Map());
  return rows.map((row) => ({ ...row, history: byRequest.get(Number(row.id)) || [] }));
}
async function decide(user, rawId, payload) {
  const shopId = tenant(user); const data = decisionSchema.parse(payload); const id = Number(rawId);
  const result = await db.transaction(async (trx) => {
    const request = await trx('leave_requests as lr').join('leave_types as lt', 'lt.id', 'lr.leave_type_id').join('staff_profiles as sp', 'sp.id', 'lr.staff_profile_id').where({ 'lr.id': id, 'lr.shop_id': shopId }).select('lr.*', 'lt.name as leave_type_name', 'lt.requires_balance', 'sp.full_name', 'sp.user_id').forUpdate().first();
    if (!request) throw httpError(404, 'Leave request not found.'); if (request.status !== 'pending') throw httpError(409, 'Leave request has already been decided.'); if (Number(request.requested_by) === Number(user.id)) throw httpError(409, 'A leave request must be decided by a different user.');
    if (data.decision === 'approved' && request.requires_balance) {
      const period = await trx('leave_balance_periods').where({ shop_id: shopId, staff_profile_id: request.staff_profile_id, leave_type_id: request.leave_type_id }).where('period_start', '<=', request.start_date).where('period_end', '>=', request.end_date).forUpdate().first();
      if (!period) throw httpError(409, 'No balance period covers this leave request.');
      const total = await trx('leave_balance_ledger').where({ balance_period_id: period.id }).sum({ value: 'days' }).first(); const available = Number(period.opening_days || 0) + Number(total.value || 0);
      if (available < Number(request.requested_days)) throw httpError(409, `Insufficient leave balance. ${available.toFixed(2)} day(s) available.`);
      await trx('leave_balance_ledger').insert({ shop_id: shopId, balance_period_id: period.id, leave_request_id: id, entry_type: 'leave_debit', days: -Number(request.requested_days), reason: `Approved ${request.leave_type_name}`, actor_user_id: user.id });
    }
    await trx('leave_requests').where({ id }).update({ status: data.decision, decided_by: user.id, decided_at: trx.fn.now(), decision_note: data.note });
    await trx('leave_approval_history').insert({ shop_id: shopId, leave_request_id: id, from_status: 'pending', to_status: data.decision, actor_user_id: user.id, note: data.note }); return request;
  });
  await notify(result.user_id, user, `Leave request ${data.decision}`, `${result.leave_type_name} request for ${result.requested_days} day(s) was ${data.decision}.`); return { id, status: data.decision };
}
async function cancel(user, rawId) {
  const shopId = tenant(user); const own = await ownOrManagedStaff(user); const id = Number(rawId);
  return db.transaction(async (trx) => { const request = await trx('leave_requests').where({ id, shop_id: shopId, staff_profile_id: own.id }).forUpdate().first(); if (!request) throw httpError(404, 'Leave request not found.'); if (request.status !== 'pending') throw httpError(409, 'Only pending leave can be cancelled.'); await trx('leave_requests').where({ id }).update({ status: 'cancelled' }); await trx('leave_approval_history').insert({ shop_id: shopId, leave_request_id: id, from_status: 'pending', to_status: 'cancelled', actor_user_id: user.id, note: 'Cancelled by applicant.' }); return { id, status: 'cancelled' }; });
}
async function approvedCalendar(shopId, from, to, staffIds) { if (!staffIds.length) return []; return db('leave_requests as lr').join('leave_types as lt', 'lt.id', 'lr.leave_type_id').where({ 'lr.shop_id': shopId, 'lr.status': 'approved' }).whereIn('lr.staff_profile_id', staffIds).where('lr.start_date', '<=', to).where('lr.end_date', '>=', from).select('lr.staff_profile_id', 'lr.start_date', 'lr.end_date', 'lr.day_part', 'lt.name', 'lt.category', 'lt.is_paid'); }
module.exports = { listTypes, listStaffOptions, createType, allocateBalance, listBalances, createRequest, listRequests, decide, cancel, approvedCalendar };
