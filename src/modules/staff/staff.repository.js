const db = require('../../../db/knex');

const SORT_COLUMNS = {
  name: 'sp.full_name',
  employee_id: 'sp.employee_id',
  joining_date: 'sp.joining_date',
  created_at: 'sp.created_at',
};

function scopedQuery(shopId) {
  return db('staff_profiles as sp')
    .leftJoin('users as u', function joinUser() {
      this.on('u.id', '=', 'sp.user_id').andOn('u.shop_id', '=', 'sp.shop_id');
    })
    .leftJoin('staff_departments as sd', 'sd.id', 'sp.department_id')
    .leftJoin('staff_designations as sj', 'sj.id', 'sp.designation_id')
    .leftJoin('staff_locations as sl', 'sl.id', 'sp.primary_location_id')
    .leftJoin('staff_classifications as sc', 'sc.id', 'sp.classification_id')
    .leftJoin('staff_profiles as sm', 'sm.id', 'sp.manager_staff_id')
    .where('sp.shop_id', shopId);
}

function applyFilters(query, filters) {
  if (filters.status !== 'all') query.where('sp.employment_status', filters.status);
  if (filters.employment_type !== 'all') query.where('sp.employment_type', filters.employment_type);
  if (filters.department) query.whereRaw('LOWER(COALESCE(sd.name, sp.department)) = LOWER(?)', [filters.department]);
  if (filters.designation) query.whereRaw('LOWER(COALESCE(sj.title, sp.designation)) = LOWER(?)', [filters.designation]);
  if (filters.search) {
    const needle = `%${filters.search.toLowerCase()}%`;
    query.where(function searchStaff() {
      this.whereRaw('LOWER(sp.full_name) LIKE ?', [needle])
        .orWhereRaw('LOWER(sp.employee_id) LIKE ?', [needle])
        .orWhereRaw('LOWER(COALESCE(sp.email, ?)) LIKE ?', ['', needle])
        .orWhereRaw('LOWER(COALESCE(sp.phone, ?)) LIKE ?', ['', needle])
        .orWhereRaw('LOWER(COALESCE(sp.designation, ?)) LIKE ?', ['', needle])
        .orWhereRaw('LOWER(COALESCE(u.username, ?)) LIKE ?', ['', needle]);
    });
  }
  return query;
}

async function list(shopId, filters) {
  const base = applyFilters(scopedQuery(shopId), filters);
  const countRow = await base.clone().clearSelect().clearOrder().countDistinct({ count: 'sp.id' }).first();
  const items = await base.clone()
    .select(
      'sp.*', 'u.username', 'u.status as account_status', 'u.can_manage_register',
      db.raw('COALESCE(sd.name, sp.department) AS department_name'),
      db.raw('COALESCE(sj.title, sp.designation) AS designation_name'),
      'sl.name as location_name', 'sc.name as classification_name', 'sm.full_name as manager_name',
    )
    .orderBy(SORT_COLUMNS[filters.sort], filters.direction)
    .orderBy('sp.id', 'asc')
    .limit(filters.page_size)
    .offset((filters.page - 1) * filters.page_size);

  const staffIds = items.map((item) => item.id);
  const userIds = items.map((item) => item.user_id).filter(Boolean);
  let rolesByUser = new Map();
  if (staffIds.length && userIds.length) {
    const roleRows = await db('user_roles as ur')
      .join('roles as r', 'r.id', 'ur.role_id')
      .whereIn('ur.user_id', userIds)
      .where('r.shop_id', shopId)
      .select('ur.user_id', 'r.id', 'r.name');
    rolesByUser = roleRows.reduce((map, role) => {
      const key = Number(role.user_id);
      map.set(key, [...(map.get(key) || []), { id: role.id, name: role.name }]);
      return map;
    }, new Map());
  }

  return {
    items: items.map((item) => ({ ...item, roles: rolesByUser.get(Number(item.user_id)) || [] })),
    total: Number(countRow?.count || 0),
  };
}

async function summary(shopId) {
  const rows = await db('staff_profiles').where({ shop_id: shopId })
    .select('employment_status').count({ count: '*' }).groupBy('employment_status');
  const result = { total: 0, active: 0, inactive: 0, suspended: 0, terminated: 0 };
  rows.forEach((row) => {
    const count = Number(row.count || 0);
    result[row.employment_status] = count;
    result.total += count;
  });
  return result;
}

async function departments(shopId) {
  const rows = await db('staff_departments').where({ shop_id: shopId, is_active: true }).select('name').orderBy('name');
  return rows.map((row) => row.name);
}

async function designations(shopId) {
  const rows = await db('staff_designations').where({ shop_id: shopId, is_active: true }).select('title').orderBy('title');
  return rows.map((row) => row.title);
}

async function availableAccounts(shopId, currentProfileId = null) {
  return db('users as u')
    .leftJoin('staff_profiles as sp', 'sp.user_id', 'u.id')
    .where('u.shop_id', shopId)
    .whereNot('u.role', 'superadmin')
    .where(function accountAvailability() {
      this.whereNull('sp.id');
      if (currentProfileId) this.orWhere('sp.id', currentProfileId);
    })
    .select('u.id', 'u.name', 'u.username', 'u.status', 'sp.id as staff_profile_id')
    .orderBy('u.name', 'asc');
}

async function findById(shopId, id, trx = db) {
  return trx('staff_profiles as sp')
    .leftJoin('users as u', function joinUser() {
      this.on('u.id', '=', 'sp.user_id').andOn('u.shop_id', '=', 'sp.shop_id');
    })
    .leftJoin('staff_departments as sd', 'sd.id', 'sp.department_id')
    .leftJoin('staff_designations as sj', 'sj.id', 'sp.designation_id')
    .leftJoin('staff_locations as sl', 'sl.id', 'sp.primary_location_id')
    .leftJoin('staff_classifications as sc', 'sc.id', 'sp.classification_id')
    .leftJoin('staff_profiles as sm', 'sm.id', 'sp.manager_staff_id')
    .where({ 'sp.shop_id': shopId, 'sp.id': id })
    .select('sp.*', 'u.username', 'u.status as account_status', 'u.can_manage_register',
      trx.raw('COALESCE(sd.name, sp.department) AS department_name'),
      trx.raw('COALESCE(sj.title, sp.designation) AS designation_name'),
      'sl.name as location_name', 'sc.name as classification_name', 'sm.full_name as manager_name')
    .first();
}

module.exports = { list, summary, departments, designations, availableAccounts, findById };
