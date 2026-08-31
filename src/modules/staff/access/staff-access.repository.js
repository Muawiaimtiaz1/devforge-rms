const db = require('../../../../db/knex');

async function findProfile(shopId, profileId, trx = db, lock = false) {
  let query = trx('staff_profiles').where({ id: profileId, shop_id: shopId });
  if (lock) query = query.forUpdate();
  return query.first();
}

async function findUser(shopId, userId, trx = db, lock = false) {
  let query = trx('users').where({ id: userId, shop_id: shopId }).whereNot('role', 'superadmin');
  if (lock) query = query.forUpdate();
  return query.first();
}

async function findRole(shopId, roleId, trx = db) {
  return trx('roles').where({ id: roleId, shop_id: shopId }).first();
}

async function profileForUser(userId, trx = db) {
  return trx('staff_profiles').where({ user_id: userId }).first();
}

async function roleForUser(shopId, userId, trx = db) {
  return trx('user_roles as ur').join('roles as r', 'r.id', 'ur.role_id')
    .where({ 'ur.user_id': userId, 'r.shop_id': shopId })
    .select('r.id', 'r.name', 'r.description').first();
}

async function permissionKeysForUser(shopId, userId, trx = db) {
  const rows = await trx('user_roles as ur')
    .join('roles as r', 'r.id', 'ur.role_id')
    .join('role_permissions as rp', 'rp.role_id', 'r.id')
    .join('permissions as p', 'p.id', 'rp.permission_id')
    .where({ 'ur.user_id': userId, 'r.shop_id': shopId })
    .distinct('p.key', 'p.module', 'p.action', 'p.label')
    .orderBy('p.module').orderBy('p.action');
  return rows;
}

async function linkProfile(trx, shopId, profileId, userId) {
  await trx('staff_profiles').where({ id: profileId, shop_id: shopId })
    .update({ user_id: userId, updated_at: trx.fn.now() });
}

async function insertAudit(trx, event) {
  await trx('staff_access_audit').insert(event);
}

async function listAudit(shopId, profileId, limit = 50) {
  return db('staff_access_audit as saa')
    .leftJoin('users as actor', 'actor.id', 'saa.actor_user_id')
    .where({ 'saa.shop_id': shopId, 'saa.staff_profile_id': profileId })
    .select('saa.id', 'saa.action', 'saa.before_json', 'saa.after_json', 'saa.created_at', 'actor.name as actor_name', 'actor.username as actor_username')
    .orderBy('saa.created_at', 'desc').limit(limit);
}

module.exports = {
  findProfile, findUser, findRole, profileForUser, roleForUser, permissionKeysForUser,
  linkProfile, insertAudit, listAudit,
};
