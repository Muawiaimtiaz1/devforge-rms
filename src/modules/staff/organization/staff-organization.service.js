const db = require('../../../../db/knex');
const repository = require('./staff-organization.repository');
const { catalogSchema, catalogUpdateSchema, assignmentSchema, transferSchema } = require('./staff-organization.schema');
const sessionSecurity = require('../../session-security/session-security.service');

function httpError(status, message) { const error = new Error(message); error.status = status; return error; }
function shopIdFromSession(user) {
  const shopId = Number(user?.shop_id);
  if (!Number.isInteger(shopId) || shopId <= 0) throw httpError(403, 'Select a restaurant to manage its organization.');
  return shopId;
}
function nullValue(value) { return value === '' || value === undefined ? null : value; }

async function getOptions(user) { return repository.options(shopIdFromSession(user)); }
async function getHierarchy(user) { return repository.hierarchy(shopIdFromSession(user)); }
async function getAssignment(user, rawId) {
  const shopId = shopIdFromSession(user); const id = Number(rawId);
  const assignment = await repository.assignedProfile(shopId, id);
  if (!assignment) throw httpError(404, 'Staff profile not found.');
  return { assignment, history: await repository.history(id, shopId) };
}

async function createCatalogItem(user, payload) {
  const shopId = shopIdFromSession(user); const data = catalogSchema.parse(payload);
  return db.transaction(async (trx) => {
    const table = repository.TABLES[data.kind];
    const values = { shop_id: shopId, is_active: true };
    if (data.kind === 'designations') {
      values.title = data.name; values.department_id = nullValue(data.department_id);
      if (values.department_id && !await repository.catalogItem('departments', shopId, values.department_id, trx)) throw httpError(400, 'Department is not available in this restaurant.');
    } else {
      values.name = data.name; values.code = nullValue(data.code);
      if (data.kind === 'locations') { values.address = nullValue(data.address); values.is_primary = data.is_primary; }
      if (data.kind === 'classifications' && !values.code) throw httpError(400, 'Classification code is required.');
    }
    if (data.kind === 'locations' && values.is_primary) await trx(table).where({ shop_id: shopId }).update({ is_primary: false, updated_at: trx.fn.now() });
    const [created] = await trx(table).insert(values).returning('*');
    return created;
  });
}

async function updateCatalogItem(user, kind, rawId, payload) {
  const shopId = shopIdFromSession(user);
  if (!repository.TABLES[kind]) throw httpError(404, 'Organization catalog not found.');
  const id = Number(rawId); const data = catalogUpdateSchema.parse(payload);
  return db.transaction(async (trx) => {
    const existing = await repository.catalogItem(kind, shopId, id, trx);
    if (!existing) throw httpError(404, 'Organization item not found.');
    const values = { ...data, updated_at: trx.fn.now() };
    if (kind === 'designations' && data.name) { values.title = data.name; delete values.name; }
    if (data.department_id && !await repository.catalogItem('departments', shopId, data.department_id, trx)) throw httpError(400, 'Department is not available in this restaurant.');
    if (kind === 'locations' && data.is_primary) await trx(repository.TABLES.locations).where({ shop_id: shopId }).whereNot({ id }).update({ is_primary: false, updated_at: trx.fn.now() });
    const [updated] = await trx(repository.TABLES[kind]).where({ id, shop_id: shopId }).update(values).returning('*');
    return updated;
  });
}

async function validateAssignment(trx, shopId, profileId, data) {
  const references = [
    ['departments', data.department_id, 'Department'], ['designations', data.designation_id, 'Designation'],
    ['locations', data.primary_location_id, 'Location'], ['classifications', data.classification_id, 'Classification'],
  ];
  for (const [kind, id, label] of references) {
    if (id && !await repository.catalogItem(kind, shopId, id, trx)) throw httpError(400, `${label} is not available in this restaurant.`);
  }
  if (data.designation_id) {
    const designation = await repository.catalogItem('designations', shopId, data.designation_id, trx);
    if (designation.department_id && designation.department_id !== data.department_id) throw httpError(400, 'Designation does not belong to the selected department.');
  }
  if (data.manager_staff_id) {
    if (data.manager_staff_id === profileId) throw httpError(400, 'A staff member cannot report to themselves.');
    const manager = await trx('staff_profiles').where({ id: data.manager_staff_id, shop_id: shopId }).whereNot('employment_status', 'terminated').first();
    if (!manager) throw httpError(400, 'Reporting manager is not active in this restaurant.');
    const cycle = await trx.raw(`WITH RECURSIVE chain AS (
      SELECT id, manager_staff_id FROM staff_profiles WHERE id = ? AND shop_id = ?
      UNION ALL SELECT sp.id, sp.manager_staff_id FROM staff_profiles sp JOIN chain c ON sp.id = c.manager_staff_id WHERE sp.shop_id = ?
    ) SELECT 1 FROM chain WHERE id = ? LIMIT 1`, [data.manager_staff_id, shopId, shopId, profileId]);
    if (cycle.rows?.length) throw httpError(409, 'This reporting line would create a hierarchy cycle.');
  }
}

async function updateAssignment(user, rawId, payload) {
  const shopId = shopIdFromSession(user); const profileId = Number(rawId); const data = assignmentSchema.parse(payload);
  return db.transaction(async (trx) => {
    const existing = await repository.assignedProfile(shopId, profileId, trx);
    if (!existing) throw httpError(404, 'Staff profile not found.');
    await validateAssignment(trx, shopId, profileId, data);
    const next = {
      department_id: nullValue(data.department_id), designation_id: nullValue(data.designation_id),
      manager_staff_id: nullValue(data.manager_staff_id), primary_location_id: nullValue(data.primary_location_id),
      classification_id: nullValue(data.classification_id),
    };
    const department = next.department_id ? await repository.catalogItem('departments', shopId, next.department_id, trx) : null;
    const designation = next.designation_id ? await repository.catalogItem('designations', shopId, next.designation_id, trx) : null;
    const classification = next.classification_id ? await repository.catalogItem('classifications', shopId, next.classification_id, trx) : null;
    await trx('staff_profiles').where({ id: profileId, shop_id: shopId }).update({
      ...next, department: department?.name || null, designation: designation?.title || null,
      employment_type: classification?.code || existing.employment_type, updated_at: trx.fn.now(),
    });
    await trx('staff_assignment_history').insert({
      staff_profile_id: profileId, from_shop_id: shopId, to_shop_id: shopId,
      from_department_id: existing.department_id, to_department_id: next.department_id,
      from_designation_id: existing.designation_id, to_designation_id: next.designation_id,
      from_manager_staff_id: existing.manager_staff_id, to_manager_staff_id: next.manager_staff_id,
      from_location_id: existing.primary_location_id, to_location_id: next.primary_location_id,
      from_classification_id: existing.classification_id, to_classification_id: next.classification_id,
      event_type: existing.department_id || existing.designation_id || existing.manager_staff_id || existing.primary_location_id ? 'reassignment' : 'initial_assignment',
      effective_date: data.effective_date, reason: data.reason, actor_user_id: user.id,
    });
    return repository.assignedProfile(shopId, profileId, trx);
  });
}

async function transferStaff(user, rawId, payload) {
  if (String(user?.role).toLowerCase() !== 'superadmin') throw httpError(403, 'Only a platform administrator can transfer staff between restaurants.');
  const sourceShopId = shopIdFromSession(user); const profileId = Number(rawId); const data = transferSchema.parse(payload);
  if (data.target_shop_id === sourceShopId) throw httpError(400, 'Target restaurant must be different.');
  return db.transaction(async (trx) => {
    const existing = await repository.assignedProfile(sourceShopId, profileId, trx);
    if (!existing) throw httpError(404, 'Staff profile not found in the selected restaurant.');
    if (!await trx('shops').where({ id: data.target_shop_id, status: 'active' }).first()) throw httpError(400, 'Target restaurant is not active.');
    let employeeId = existing.employee_id;
    if (await trx('staff_profiles').where({ shop_id: data.target_shop_id, employee_id: employeeId }).first()) employeeId = `${employeeId}-${profileId}`;
    await trx('staff_assignment_history').insert({
      staff_profile_id: profileId, from_shop_id: sourceShopId, to_shop_id: data.target_shop_id,
      from_department_id: existing.department_id, from_designation_id: existing.designation_id,
      from_manager_staff_id: existing.manager_staff_id, from_location_id: existing.primary_location_id,
      from_classification_id: existing.classification_id, event_type: 'cross_shop_transfer',
      effective_date: data.effective_date, reason: data.reason, actor_user_id: user.id,
    });
    await trx('staff_profiles').where({ id: profileId, shop_id: sourceShopId }).update({
      shop_id: data.target_shop_id, employee_id: employeeId, department_id: null, designation_id: null,
      manager_staff_id: null, primary_location_id: null, classification_id: null,
      department: null, designation: null, updated_at: trx.fn.now(),
    });
    if (existing.user_id) {
      await trx('user_roles').where({ user_id: existing.user_id }).del();
      await trx('users').where({ id: existing.user_id, shop_id: sourceShopId }).update({ shop_id: data.target_shop_id, can_manage_register: false, updated_at: trx.fn.now() });
      await sessionSecurity.revokeUserSessions(trx, existing.user_id, user.id, 'CROSS_SHOP_TRANSFER');
    }
    return repository.assignedProfile(data.target_shop_id, profileId, trx);
  });
}

module.exports = { getOptions, getHierarchy, getAssignment, createCatalogItem, updateCatalogItem, updateAssignment, transferStaff };
