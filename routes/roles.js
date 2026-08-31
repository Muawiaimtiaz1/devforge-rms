const express = require('express');
const db = require('../db/knex');
const { PERMISSIONS, ALL_PERMISSION_KEYS } = require('../authorization/catalog');
const { listRoles } = require('../authorization/service');
const { requirePermission } = require('../authorization/middleware');
const sessionSecurity = require('../src/modules/session-security/session-security.service');
const router = express.Router();

function targetShop(req) {
  return req.session.user.role === 'superadmin' && req.query.shop_id ? Number(req.query.shop_id) : req.session.user.shop_id;
}

router.get('/catalog', requirePermission('roles.view'), (req, res) => res.json(PERMISSIONS));
router.get('/', requirePermission('roles.view'), async (req, res) => res.json(await listRoles(targetShop(req))));

router.post('/', requirePermission('roles.create'), async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Role name is required.' });
  const requestedPermissions = Object.prototype.hasOwnProperty.call(req.body, 'permissions');
  if (requestedPermissions && !req.permissions.includes('roles.assign_permissions')) {
    return res.status(403).json({ error: 'You do not have permission to assign role permissions.' });
  }
  const keys = [...new Set(req.body.permissions || [])].filter((key) => ALL_PERMISSION_KEYS.includes(key));
  const [created] = await db('roles').insert({ shop_id: targetShop(req), name, description: String(req.body.description || '') }).returning('id');
  const roleId = typeof created === 'object' ? created.id : created;
  if (keys.length) {
    const permissions = await db('permissions').whereIn('key', keys).select('id');
    await db('role_permissions').insert(permissions.map((permission) => ({ role_id: roleId, permission_id: permission.id })));
  }
  res.status(201).json({ ok: true, id: roleId });
});

router.put('/:id', requirePermission('roles.update', 'roles.assign_permissions'), async (req, res) => {
  const role = await db('roles').where({ id: req.params.id, shop_id: targetShop(req) }).first();
  if (!role) return res.status(404).json({ error: 'Role not found.' });
  const canUpdate = req.permissions.includes('roles.update');
  const canAssignPermissions = req.permissions.includes('roles.assign_permissions');
  const updatesDetails = Object.prototype.hasOwnProperty.call(req.body, 'name') || Object.prototype.hasOwnProperty.call(req.body, 'description');
  const updatesPermissions = Object.prototype.hasOwnProperty.call(req.body, 'permissions');
  if (updatesDetails && !canUpdate) return res.status(403).json({ error: 'You do not have permission to update role details.' });
  if (updatesPermissions && !canAssignPermissions) return res.status(403).json({ error: 'You do not have permission to assign role permissions.' });
  if (!updatesDetails && !updatesPermissions) return res.status(400).json({ error: 'No valid fields provided for update.' });
  const keys = [...new Set(req.body.permissions || [])].filter((key) => ALL_PERMISSION_KEYS.includes(key));
  await db.transaction(async (trx) => {
    const assignedUsers = updatesPermissions
      ? await trx('user_roles').where({ role_id: role.id }).select('user_id')
      : [];
    if (updatesDetails) await trx('roles').where({ id: role.id, shop_id: targetShop(req) }).update({ name: String(req.body.name || role.name).trim(), description: String(req.body.description ?? role.description), updated_at: trx.fn.now() });
    if (updatesPermissions) await trx('role_permissions').where({ role_id: role.id }).del();
    if (updatesPermissions && keys.length) {
      const permissions = await trx('permissions').whereIn('key', keys).select('id');
      await trx('role_permissions').insert(permissions.map((permission) => ({ role_id: role.id, permission_id: permission.id })));
    }
    for (const assignedUser of assignedUsers) {
      await sessionSecurity.revokeUserSessions(trx, assignedUser.user_id, req.session.user.id, 'ROLE_PERMISSIONS_CHANGED');
    }
  });
  res.json({ ok: true });
});

router.delete('/:id', requirePermission('roles.delete'), async (req, res) => {
  const role = await db('roles').where({ id: req.params.id, shop_id: targetShop(req) }).first();
  if (!role) return res.status(404).json({ error: 'Role not found.' });
  if (role.is_system) return res.status(400).json({ error: 'System roles cannot be deleted.' });
  const assigned = await db('user_roles').where({ role_id: role.id }).first();
  if (assigned) return res.status(409).json({ error: 'Reassign users before deleting this role.' });
  await db('roles').where({ id: role.id }).del();
  res.json({ ok: true });
});

module.exports = router;
