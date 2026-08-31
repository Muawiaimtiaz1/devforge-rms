const crypto = require('crypto');
const db = require('../../../../db/knex');
const userService = require('../../../../services/UserService');
const sessionSecurity = require('../../session-security/session-security.service');
const repository = require('./staff-access.repository');
const { createAccountSchema, updateAccessSchema } = require('./staff-access.schema');

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function shopIdFromSession(currentUser) {
  const shopId = Number(currentUser?.shop_id);
  if (!Number.isInteger(shopId) || shopId <= 0) throw httpError(403, 'A restaurant must be selected to manage staff access.');
  return shopId;
}

function temporaryPassword() {
  return `Tmp9!${crypto.randomBytes(9).toString('base64url')}`;
}

function accessSnapshot(user, role) {
  if (!user) return null;
  return {
    user_id: Number(user.id), username: user.username, status: user.status,
    can_manage_register: Boolean(user.can_manage_register), must_change_password: Boolean(user.must_change_password),
    role: role ? { id: Number(role.id), name: role.name } : null,
  };
}

async function loadAccess(currentUser, profileId) {
  const shopId = shopIdFromSession(currentUser);
  const profile = await repository.findProfile(shopId, Number(profileId));
  if (!profile) throw httpError(404, 'Staff profile not found.');
  const audit = await repository.listAudit(shopId, profile.id);
  if (!profile.user_id) return { profile_id: profile.id, account: null, permissions: [], audit };
  const [user, role, permissions] = await Promise.all([
    repository.findUser(shopId, profile.user_id),
    repository.roleForUser(shopId, profile.user_id),
    repository.permissionKeysForUser(shopId, profile.user_id),
  ]);
  return { profile_id: profile.id, account: accessSnapshot(user, role), permissions, audit };
}

async function createOrLinkAccount(currentUser, permissions, profileId, payload) {
  const shopId = shopIdFromSession(currentUser);
  const data = createAccountSchema.parse(payload);
  let issuedPassword = null;

  await db.transaction(async (trx) => {
    const profile = await repository.findProfile(shopId, Number(profileId), trx, true);
    if (!profile) throw httpError(404, 'Staff profile not found.');
    if (profile.user_id) throw httpError(409, 'This staff profile already has a login account.');

    let user;
    let action;
    if (data.existing_user_id) {
      user = await repository.findUser(shopId, data.existing_user_id, trx, true);
      if (!user) throw httpError(404, 'Account not found for this restaurant.');
      if (await repository.profileForUser(user.id, trx)) throw httpError(409, 'That account is already linked to another staff profile.');
      action = 'ACCOUNT_LINKED';
    } else {
      if (!permissions.includes('users.create') || !permissions.includes('users.assign_roles')) {
        throw httpError(403, 'Creating a staff account requires account-create and role-assignment permission.');
      }
      const role = await repository.findRole(shopId, data.role_id, trx);
      if (!role) throw httpError(400, 'Selected role is not available for this restaurant.');
      issuedPassword = temporaryPassword();
      user = await userService.createStaffAccountInTransaction(trx, {
        profile, username: data.username, password: issuedPassword, role,
        status: data.status, can_manage_register: data.can_manage_register,
      });
      action = 'ACCOUNT_CREATED';
    }

    await repository.linkProfile(trx, shopId, profile.id, user.id);
    const role = await repository.roleForUser(shopId, user.id, trx);
    await repository.insertAudit(trx, {
      shop_id: shopId, staff_profile_id: profile.id, target_user_id: user.id, actor_user_id: currentUser.id,
      action, before_json: null, after_json: accessSnapshot(user, role), created_at: trx.fn.now(),
    });
  });

  return { ...(await loadAccess(currentUser, profileId)), temporary_password: issuedPassword };
}

async function updateAccess(currentUser, permissions, profileId, payload) {
  const shopId = shopIdFromSession(currentUser);
  const data = updateAccessSchema.parse(payload);
  await db.transaction(async (trx) => {
    const profile = await repository.findProfile(shopId, Number(profileId), trx, true);
    if (!profile?.user_id) throw httpError(404, 'This staff profile has no login account.');
    const user = await repository.findUser(shopId, profile.user_id, trx, true);
    if (!user) throw httpError(404, 'Linked account was not found.');
    const oldRole = await repository.roleForUser(shopId, user.id, trx);
    const before = accessSnapshot(user, oldRole);
    if (Number(user.id) === Number(currentUser.id) && (data.role_id || data.status === 'blocked')) {
      throw httpError(409, 'You cannot change your own role or block your own account.');
    }
    if (data.role_id && !permissions.includes('users.assign_roles')) throw httpError(403, 'You do not have permission to assign roles.');
    const updated = await userService.updateStaffAccessInTransaction(trx, user, data, shopId);
    const newRole = await repository.roleForUser(shopId, user.id, trx);
    if (data.role_id || data.status === 'blocked') {
      await sessionSecurity.revokeUserSessions(trx, user.id, currentUser.id, data.status === 'blocked' ? 'ACCOUNT_BLOCKED' : 'ROLE_CHANGED');
    }
    await repository.insertAudit(trx, {
      shop_id: shopId, staff_profile_id: profile.id, target_user_id: user.id, actor_user_id: currentUser.id,
      action: 'ACCESS_UPDATED', before_json: before, after_json: accessSnapshot(updated, newRole), created_at: trx.fn.now(),
    });
  });
  return loadAccess(currentUser, profileId);
}

async function resetPassword(currentUser, profileId) {
  const shopId = shopIdFromSession(currentUser);
  const password = temporaryPassword();
  await db.transaction(async (trx) => {
    const profile = await repository.findProfile(shopId, Number(profileId), trx, true);
    if (!profile?.user_id) throw httpError(404, 'This staff profile has no login account.');
    const user = await repository.findUser(shopId, profile.user_id, trx, true);
    if (!user) throw httpError(404, 'Linked account was not found.');
    await userService.resetStaffPasswordInTransaction(trx, user, password);
    await sessionSecurity.revokeUserSessions(trx, user.id, currentUser.id, 'PASSWORD_RESET');
    await repository.insertAudit(trx, {
      shop_id: shopId, staff_profile_id: profile.id, target_user_id: user.id, actor_user_id: currentUser.id,
      action: 'PASSWORD_RESET', before_json: null, after_json: { must_change_password: true }, created_at: trx.fn.now(),
    });
  });
  return { ok: true, temporary_password: password };
}

module.exports = { loadAccess, createOrLinkAccount, updateAccess, resetPassword };
