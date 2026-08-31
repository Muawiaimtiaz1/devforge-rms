const db = require('../../../db/knex');
function staff(shopId, id, trx = db) { return trx('staff_profiles').where({ shop_id: shopId, id }).first(); }
function staffForUser(shopId, userId, trx = db) { return trx('staff_profiles').where({ shop_id: shopId, user_id: userId }).first(); }
function types(shopId, activeOnly = true, trx = db) { const query = trx('leave_types').where({ shop_id: shopId }); if (activeOnly) query.where({ is_active: true }); return query.orderBy('name'); }
function type(shopId, id, trx = db) { return trx('leave_types').where({ shop_id: shopId, id }).first(); }
async function balances(shopId, staffId) {
  return db('leave_balance_periods as bp').join('leave_types as lt', 'lt.id', 'bp.leave_type_id').leftJoin('leave_balance_ledger as bl', 'bl.balance_period_id', 'bp.id')
    .where({ 'bp.shop_id': shopId, 'bp.staff_profile_id': staffId }).groupBy('bp.id', 'lt.id')
    .select('bp.id', 'bp.period_start', 'bp.period_end', 'bp.opening_days', 'lt.id as leave_type_id', 'lt.name', 'lt.category', 'lt.is_paid', 'lt.requires_balance')
    .sum({ ledger_days: 'bl.days' }).orderBy('bp.period_start', 'desc');
}
function requests(shopId, filters, staffId = null) {
  const query = db('leave_requests as lr').join('staff_profiles as sp', 'sp.id', 'lr.staff_profile_id').join('leave_types as lt', 'lt.id', 'lr.leave_type_id')
    .leftJoin('users as decider', 'decider.id', 'lr.decided_by').where({ 'lr.shop_id': shopId });
  if (staffId) query.where({ 'lr.staff_profile_id': staffId }); if (filters.staff_profile_id) query.where({ 'lr.staff_profile_id': filters.staff_profile_id });
  if (filters.status !== 'all') query.where({ 'lr.status': filters.status }); if (filters.from) query.where('lr.end_date', '>=', filters.from); if (filters.to) query.where('lr.start_date', '<=', filters.to);
  return query.select('lr.*', 'sp.full_name', 'sp.employee_id', 'lt.name as leave_type_name', 'lt.category', 'lt.is_paid', 'decider.name as decided_by_name').orderBy('lr.requested_at', 'desc').limit(500);
}
function history(shopId, requestIds) { if (!requestIds.length) return []; return db('leave_approval_history as h').leftJoin('users as u', 'u.id', 'h.actor_user_id').where({ 'h.shop_id': shopId }).whereIn('h.leave_request_id', requestIds).select('h.*', 'u.name as actor_name').orderBy('h.created_at').orderBy('h.id'); }
module.exports = { staff, staffForUser, types, type, balances, requests, history };
