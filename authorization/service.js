const db = require('../db/knex');
const { ALL_PERMISSION_KEYS, PERMISSIONS, STANDARD_ROLES, permissionsForPanels } = require('./catalog');

let initialization;

async function ensureAuthorizationSchema() {
  if (initialization) return initialization;
  initialization = (async () => {
    const [hasRoles, hasPermissions, hasRolePermissions, hasUserRoles, hasUserPermissions] = await Promise.all([
      db.schema.hasTable('roles'),
      db.schema.hasTable('permissions'),
      db.schema.hasTable('role_permissions'),
      db.schema.hasTable('user_roles'),
      db.schema.hasTable('user_permissions'),
    ]);
    if (!hasRoles) {
      await db.schema.createTable('roles', (table) => {
        table.increments('id').primary();
        table.integer('shop_id').nullable().references('id').inTable('shops').onDelete('CASCADE');
        table.string('name').notNullable();
        table.string('description').defaultTo('');
        table.boolean('is_system').notNullable().defaultTo(false);
        table.timestamps(true, true);
        table.unique(['shop_id', 'name']);
      });
    }
    if (!hasPermissions) {
      await db.schema.createTable('permissions', (table) => {
        table.increments('id').primary();
        table.string('key').notNullable().unique();
        table.string('module').notNullable();
        table.string('action').notNullable();
        table.string('label').notNullable();
      });
    }
    if (!hasRolePermissions) {
      await db.schema.createTable('role_permissions', (table) => {
        table.integer('role_id').notNullable().references('id').inTable('roles').onDelete('CASCADE');
        table.integer('permission_id').notNullable().references('id').inTable('permissions').onDelete('CASCADE');
        table.primary(['role_id', 'permission_id']);
      });
    }
    if (!hasUserRoles) {
      await db.schema.createTable('user_roles', (table) => {
        table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.integer('role_id').notNullable().references('id').inTable('roles').onDelete('CASCADE');
        table.primary(['user_id', 'role_id']);
      });
    }
    if (!hasUserPermissions) {
      await db.schema.createTable('user_permissions', (table) => {
        table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.integer('permission_id').notNullable().references('id').inTable('permissions').onDelete('CASCADE');
        table.primary(['user_id', 'permission_id']);
      });
    }
    if (!(await db.schema.hasColumn('users', 'use_custom_permissions'))) {
      await db.schema.alterTable('users', (table) => table.boolean('use_custom_permissions').notNullable().defaultTo(false));
    }

    await db('permissions')
      .insert(PERMISSIONS)
      .onConflict('key')
      .merge(['module', 'action', 'label']);
    await migrateLegacyUsers();
    await seedStandardRoles();
  })().catch((error) => { initialization = null; throw error; });
  return initialization;
}

async function seedStandardRoles() {
  const [shops, permissionRows, existingRoles] = await Promise.all([
    db('shops').select('id'),
    db('permissions').select('id', 'key'),
    db('roles').whereIn('name', Object.keys(STANDARD_ROLES)).select('id', 'shop_id', 'name'),
  ]);
  const permissionId = new Map(permissionRows.map(row => [row.key, row.id]));
  const roleKey = (shopId, name) => `${shopId}:${name}`;
  const existingKeys = new Set(existingRoles.map(role => roleKey(role.shop_id, role.name)));
  const missingRoles = shops.flatMap(shop => Object.keys(STANDARD_ROLES)
    .filter(name => !existingKeys.has(roleKey(shop.id, name)))
    .map(name => ({ shop_id: shop.id, name, description: 'Standard restaurant role', is_system: true })));

  if (!missingRoles.length) return;

  // These are per-shop starting templates. Existing restaurant role choices are
  // authoritative and are never overwritten during startup.
  const insertedRoles = await db('roles').insert(missingRoles).returning(['id', 'shop_id', 'name']);
  const rolePermissions = insertedRoles.flatMap(role => (STANDARD_ROLES[role.name] || [])
    .map(key => ({ role_id: role.id, permission_id: permissionId.get(key) }))
    .filter(row => row.permission_id));
  await insertIgnoreInChunks('role_permissions', rolePermissions, ['role_id', 'permission_id']);
}

async function migrateLegacyUsers() {
  const [users, permissionRows, existingAssignments, existingRoles] = await Promise.all([
    db('users').whereNot('role', 'superadmin'),
    db('permissions').select('id', 'key'),
    db('user_roles').select('user_id'),
    db('roles').select('id', 'shop_id', 'name'),
  ]);
  const permissionId = new Map(permissionRows.map((row) => [row.key, row.id]));
  const assignedUserIds = new Set(existingAssignments.map(row => Number(row.user_id)));
  const unassignedUsers = users.filter(user => !assignedUserIds.has(Number(user.id)));
  if (!unassignedUsers.length) return;

  const roleNameFor = user => String(user.role || 'staff').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const roleKey = (shopId, name) => `${shopId ?? 'null'}:${name}`;
  const rolesByKey = new Map(existingRoles.map(role => [roleKey(role.shop_id, role.name), role]));
  const missingRoleMap = new Map();
  for (const user of unassignedUsers) {
    const name = roleNameFor(user);
    const key = roleKey(user.shop_id, name);
    if (!rolesByKey.has(key)) missingRoleMap.set(key, { shop_id: user.shop_id, name, description: 'Migrated from legacy access', is_system: user.role === 'admin' });
  }
  if (missingRoleMap.size) {
    const insertedRoles = await db('roles').insert([...missingRoleMap.values()]).returning(['id', 'shop_id', 'name']);
    insertedRoles.forEach(role => rolesByKey.set(roleKey(role.shop_id, role.name), role));
  }

  const userRoles = [];
  const rolePermissions = [];
  for (const user of unassignedUsers) {
    const role = rolesByKey.get(roleKey(user.shop_id, roleNameFor(user)));
    if (!role) continue;
    let keys;
    if (['admin', 'manager'].includes(user.role)) keys = ALL_PERMISSION_KEYS.filter((key) => !key.startsWith('platform_'));
    else {
      let panels = [];
      try { panels = JSON.parse(user.allowed_panels || '[]'); } catch {}
      keys = permissionsForPanels(panels);
    }
    rolePermissions.push(...keys.map(key => ({ role_id: role.id, permission_id: permissionId.get(key) })).filter(row => row.permission_id));
    userRoles.push({ user_id: user.id, role_id: role.id });
  }
  await insertIgnoreInChunks('role_permissions', rolePermissions, ['role_id', 'permission_id']);
  await insertIgnoreInChunks('user_roles', userRoles, ['user_id', 'role_id']);
}

async function insertIgnoreInChunks(table, rows, conflictColumns, size = 500) {
  for (let index = 0; index < rows.length; index += size) {
    await db(table).insert(rows.slice(index, index + size)).onConflict(conflictColumns).ignore();
  }
}

async function getUserPermissions(user) {
  if (!user) return [];
  if (user.role === 'superadmin') return ALL_PERMISSION_KEYS;
  await ensureAuthorizationSchema();
  let assignedRole = await db('user_roles').where({ user_id: user.id }).first();
  if (!assignedRole && user.shop_id) {
    const standardName = {
      admin: 'Restaurant Admin', manager: 'Manager', pos_user: 'Cashier', waiter: 'Waiter',
      order_taker: 'Waiter', kitchen: 'Kitchen', rider: 'Rider', receptionist: 'Receptionist'
    }[String(user.role || '').toLowerCase()];
    const roleName = standardName || String(user.role || 'staff').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const role = await db('roles').where({ shop_id: user.shop_id, name: roleName }).first();
    if (role) {
      await db('user_roles').insert({ user_id: user.id, role_id: role.id }).onConflict(['user_id', 'role_id']).ignore();
      assignedRole = { user_id: user.id, role_id: role.id };
    }
  }
  const rows = await db('user_roles as ur')
    .join('roles as r', 'r.id', 'ur.role_id')
    .join('role_permissions as rp', 'rp.role_id', 'ur.role_id')
    .join('permissions as p', 'p.id', 'rp.permission_id')
    .where('ur.user_id', user.id)
    .where('r.shop_id', user.shop_id)
    .distinct('p.key');
  return rows.map((row) => row.key);
}

async function listRoles(shopId) {
  await ensureAuthorizationSchema();
  const roles = await db('roles').where({ shop_id: shopId }).orderBy('name');
  if (!roles.length) return roles;
  const roleIds = roles.map(role => role.id);
  const [permissionRows, userCounts] = await Promise.all([
    db('role_permissions as rp').join('permissions as p', 'p.id', 'rp.permission_id').whereIn('rp.role_id', roleIds).select('rp.role_id', 'p.key'),
    db('user_roles').whereIn('role_id', roleIds).groupBy('role_id').select('role_id').count('* as count'),
  ]);
  const permissionsByRole = new Map();
  permissionRows.forEach(row => permissionsByRole.set(row.role_id, [...(permissionsByRole.get(row.role_id) || []), row.key]));
  const countByRole = new Map(userCounts.map(row => [row.role_id, Number(row.count)]));
  roles.forEach(role => {
    role.permissions = permissionsByRole.get(role.id) || [];
    role.user_count = countByRole.get(role.id) || 0;
  });
  return roles;
}

module.exports = { ensureAuthorizationSchema, getUserPermissions, listRoles };
