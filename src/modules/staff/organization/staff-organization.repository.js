const db = require('../../../../db/knex');

const TABLES = {
  departments: 'staff_departments', designations: 'staff_designations',
  locations: 'staff_locations', classifications: 'staff_classifications',
};

async function options(shopId, trx = db) {
  const [departments, designations, locations, classifications, managers] = await Promise.all([
    trx('staff_departments').where({ shop_id: shopId, is_active: true }).select('id', 'name', 'code').orderBy('name'),
    trx('staff_designations').where({ shop_id: shopId, is_active: true }).select('id', 'title', 'department_id').orderBy('title'),
    trx('staff_locations').where({ shop_id: shopId, is_active: true }).select('id', 'name', 'code', 'address', 'is_primary').orderBy('name'),
    trx('staff_classifications').where({ shop_id: shopId, is_active: true }).select('id', 'name', 'code').orderBy('name'),
    trx('staff_profiles').where({ shop_id: shopId, employment_status: 'active' }).select('id', 'full_name', 'employee_id').orderBy('full_name'),
  ]);
  return { departments, designations, locations, classifications, managers };
}

function assignedProfile(shopId, profileId, trx = db) {
  return trx('staff_profiles as sp')
    .leftJoin('staff_departments as d', 'd.id', 'sp.department_id')
    .leftJoin('staff_designations as j', 'j.id', 'sp.designation_id')
    .leftJoin('staff_locations as l', 'l.id', 'sp.primary_location_id')
    .leftJoin('staff_classifications as c', 'c.id', 'sp.classification_id')
    .leftJoin('staff_profiles as m', 'm.id', 'sp.manager_staff_id')
    .where({ 'sp.shop_id': shopId, 'sp.id': profileId })
    .select('sp.*', 'd.name as department_name', 'j.title as designation_name',
      'l.name as location_name', 'c.name as classification_name', 'm.full_name as manager_name').first();
}

async function hierarchy(shopId) {
  return db('staff_profiles as sp').leftJoin('staff_departments as d', 'd.id', 'sp.department_id')
    .leftJoin('staff_designations as j', 'j.id', 'sp.designation_id')
    .where({ 'sp.shop_id': shopId }).whereNot('sp.employment_status', 'terminated')
    .select('sp.id', 'sp.full_name', 'sp.employee_id', 'sp.manager_staff_id', 'sp.employment_status',
      'd.name as department_name', 'j.title as designation_name').orderBy('sp.full_name');
}

async function history(profileId, permittedShopId) {
  return db('staff_assignment_history as h')
    .join('staff_profiles as sp', 'sp.id', 'h.staff_profile_id')
    .leftJoin('shops as fs', 'fs.id', 'h.from_shop_id').leftJoin('shops as ts', 'ts.id', 'h.to_shop_id')
    .leftJoin('staff_departments as fd', 'fd.id', 'h.from_department_id').leftJoin('staff_departments as td', 'td.id', 'h.to_department_id')
    .leftJoin('staff_designations as fj', 'fj.id', 'h.from_designation_id').leftJoin('staff_designations as tj', 'tj.id', 'h.to_designation_id')
    .leftJoin('staff_profiles as fm', 'fm.id', 'h.from_manager_staff_id').leftJoin('staff_profiles as tm', 'tm.id', 'h.to_manager_staff_id')
    .leftJoin('staff_locations as fl', 'fl.id', 'h.from_location_id').leftJoin('staff_locations as tl', 'tl.id', 'h.to_location_id')
    .where('h.staff_profile_id', profileId)
    .where((query) => query.where('h.from_shop_id', permittedShopId).orWhere('h.to_shop_id', permittedShopId).orWhere('sp.shop_id', permittedShopId))
    .select('h.id', 'h.event_type', 'h.effective_date', 'h.reason', 'h.created_at',
      'fs.name as from_shop_name', 'ts.name as to_shop_name', 'fd.name as from_department_name', 'td.name as to_department_name',
      'fj.title as from_designation_name', 'tj.title as to_designation_name', 'fm.full_name as from_manager_name', 'tm.full_name as to_manager_name',
      'fl.name as from_location_name', 'tl.name as to_location_name').orderBy('h.effective_date', 'desc').orderBy('h.id', 'desc');
}

async function catalogItem(kind, shopId, id, trx = db) {
  return trx(TABLES[kind]).where({ id, shop_id: shopId }).first();
}

module.exports = { TABLES, options, assignedProfile, hierarchy, history, catalogItem };
