const db = require('../../../db/knex');
const repository = require('./staff.repository');
const { staffProfileSchema, listQuerySchema } = require('./staff.schema');
const sessionSecurity = require('../session-security/session-security.service');

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function shopIdFromSession(currentUser, action) {
  const shopId = Number(currentUser?.shop_id);
  if (!Number.isInteger(shopId) || shopId <= 0) {
    throw httpError(403, `A restaurant must be selected to ${action} staff.`);
  }
  return shopId;
}

function normalizeNullable(value) {
  return value === '' || value === undefined ? null : value;
}

function writableProfile(data) {
  return {
    employee_id: normalizeNullable(data.employee_id),
    full_name: data.full_name,
    photo_url: normalizeNullable(data.photo_url),
    phone: normalizeNullable(data.phone),
    email: normalizeNullable(data.email),
    address: normalizeNullable(data.address),
    emergency_contact_name: normalizeNullable(data.emergency_contact_name),
    emergency_contact_phone: normalizeNullable(data.emergency_contact_phone),
    designation: normalizeNullable(data.designation),
    department: normalizeNullable(data.department),
    employment_type: data.employment_type,
    joining_date: normalizeNullable(data.joining_date),
    employment_status: data.employment_status,
    notes: normalizeNullable(data.notes),
  };
}

async function listStaff(currentUser, rawQuery) {
  const shopId = shopIdFromSession(currentUser, 'view');
  const filters = listQuerySchema.parse(rawQuery);
  const [{ items, total }, statusSummary, departmentOptions, designationOptions] = await Promise.all([
    repository.list(shopId, filters), repository.summary(shopId), repository.departments(shopId), repository.designations(shopId),
  ]);
  return {
    items,
    summary: statusSummary,
    filters: { departments: departmentOptions, designations: designationOptions },
    pagination: {
      page: filters.page,
      page_size: filters.page_size,
      total,
      pages: Math.max(1, Math.ceil(total / filters.page_size)),
    },
  };
}

async function getStaff(currentUser, id) {
  const shopId = shopIdFromSession(currentUser, 'view');
  const profile = await repository.findById(shopId, Number(id));
  if (!profile) throw httpError(404, 'Staff profile not found.');
  return profile;
}

async function listAvailableAccounts(currentUser, currentProfileId) {
  const shopId = shopIdFromSession(currentUser, 'view');
  const profileId = currentProfileId ? Number(currentProfileId) : null;
  return repository.availableAccounts(shopId, Number.isInteger(profileId) ? profileId : null);
}

async function createStaff(currentUser, payload) {
  const shopId = shopIdFromSession(currentUser, 'create');
  const data = staffProfileSchema.parse(payload);
  return db.transaction(async (trx) => {
    const values = writableProfile(data);
    const requestedEmployeeId = values.employee_id;
    values.employee_id = requestedEmployeeId || `PENDING-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [created] = await trx('staff_profiles').insert({ ...values, shop_id: shopId }).returning('id');
    const id = Number(typeof created === 'object' ? created.id : created);
    const employeeId = requestedEmployeeId || `STF-${String(id).padStart(5, '0')}`;
    await trx('staff_profiles').where({ id, shop_id: shopId }).update({ employee_id: employeeId });
    return repository.findById(shopId, id, trx);
  });
}

async function updateStaff(currentUser, id, payload) {
  const shopId = shopIdFromSession(currentUser, 'update');
  const profileId = Number(id);
  const existing = await repository.findById(shopId, profileId);
  if (!existing) throw httpError(404, 'Staff profile not found.');
  const data = staffProfileSchema.parse(payload);
  return db.transaction(async (trx) => {
    await trx('staff_profiles').where({ id: profileId, shop_id: shopId })
      .update({ ...writableProfile(data), updated_at: trx.fn.now() });
    if (data.employment_status === 'terminated' && existing.user_id) {
      await sessionSecurity.revokeUserSessions(trx, existing.user_id, currentUser.id, 'EMPLOYMENT_TERMINATED');
    }
    return repository.findById(shopId, profileId, trx);
  });
}

module.exports = { listStaff, listAvailableAccounts, getStaff, createStaff, updateStaff };
