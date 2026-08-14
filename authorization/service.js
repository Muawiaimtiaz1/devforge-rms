const db = require('../db/knex');
const { ALL_PERMISSION_KEYS, PERMISSIONS, STANDARD_ROLES, permissionsForPanels } = require('./catalog');

let initialization;

async function ensureAuthorizationSchema() {
  if (initialization) return initialization;
  initialization = (async () => {
    if (!(await db.schema.hasTable('roles'))) {
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
    if (!(await db.schema.hasTable('permissions'))) {
      await db.schema.createTable('permissions', (table) => {
        table.increments('id').primary();
        table.string('key').notNullable().unique();
        table.string('module').notNullable();
        table.string('action').notNullable();
        table.string('label').notNullable();
      });
    }
    if (!(await db.schema.hasTable('role_permissions'))) {
      await db.schema.createTable('role_permissions', (table) => {
        table.integer('role_id').notNullable().references('id').inTable('roles').onDelete('CASCADE');
        table.integer('permission_id').notNullable().references('id').inTable('permissions').onDelete('CASCADE');
        table.primary(['role_id', 'permission_id']);
      });
    }
    if (!(await db.schema.hasTable('user_roles'))) {
      await db.schema.createTable('user_roles', (table) => {
        table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.integer('role_id').notNullable().references('id').inTable('roles').onDelete('CASCADE');
        table.primary(['user_id', 'role_id']);
      });
    }
    if (!(await db.schema.hasTable('user_permissions'))) {
      await db.schema.createTable('user_permissions', (table) => {
        table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.integer('permission_id').notNullable().references('id').inTable('permissions').onDelete('CASCADE');
        table.primary(['user_id', 'permission_id']);
      });
    }
    if (!(await db.schema.hasColumn('users', 'use_custom_permissions'))) {
      await db.schema.alterTable('users', (table) => table.boolean('use_custom_permissions').notNullable().defaultTo(false));
    }

    for (const permission of PERMISSIONS) {
      await db('permissions').insert(permission).onConflict('key').merge(permission);
    }
    await migrateLegacyUsers();
    await seedStandardRoles();
  })().catch((error) => { initialization = null; throw error; });
  return initialization;
}

async function seedStandardRoles() {
  const shops = await db('shops').select('id');
  const permissionRows = await db('permissions').select('id', 'key');
  const permissionId = new Map(permissionRows.map(row => [row.key, row.id]));
  for (const shop of shops) {
    for (const [name, keys] of Object.entries(STANDARD_ROLES)) {
      let role = await db('roles').where({ shop_id: shop.id, name }).first();
      // These are per-shop starting templates. Once created, a restaurant owner's
      // permission choices are authoritative and must never be reset on startup/listing.
      if (!role) {
        const inserted = await db('roles').insert({ shop_id: shop.id, name, description: 'Standard restaurant role', is_system: true }).returning('id');
        role = { id: typeof inserted[0] === 'object' ? inserted[0].id : inserted[0] };
        const rows = keys.map(key => ({ role_id: role.id, permission_id: permissionId.get(key) })).filter(row => row.permission_id);
        if (rows.length) await db('role_permissions').insert(rows).onConflict(['role_id', 'permission_id']).ignore();
      }
    }
  }
}

async function migrateLegacyUsers() {
  const users = await db('users').whereNot('role', 'superadmin');
  const permissionRows = await db('permissions').select('id', 'key');
  const permissionId = new Map(permissionRows.map((row) => [row.key, row.id]));

  for (const user of users) {
    const existing = await db('user_roles').where({ user_id: user.id }).first();
    if (existing) continue;
    const roleName = String(user.role || 'staff').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    let role = await db('roles').where({ shop_id: user.shop_id, name: roleName }).first();
    if (!role) {
      const inserted = await db('roles').insert({ shop_id: user.shop_id, name: roleName, description: 'Migrated from legacy access', is_system: user.role === 'admin' }).returning('id');
      role = { id: typeof inserted[0] === 'object' ? inserted[0].id : inserted[0] };
    }
    let keys;
    if (['admin', 'manager'].includes(user.role)) keys = ALL_PERMISSION_KEYS.filter((key) => !key.startsWith('platform_'));
    else {
      let panels = [];
      try { panels = JSON.parse(user.allowed_panels || '[]'); } catch {}
      keys = permissionsForPanels(panels);
    }
    if (keys.length) {
      await db('role_permissions')
        .insert(keys.map((key) => ({ role_id: role.id, permission_id: permissionId.get(key) })).filter((row) => row.permission_id))
        .onConflict(['role_id', 'permission_id']).ignore();
    }
    await db('user_roles').insert({ user_id: user.id, role_id: role.id }).onConflict(['user_id', 'role_id']).ignore();
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
  await seedStandardRoles();
  const roles = await db('roles').where({ shop_id: shopId }).orderBy('name');
  for (const role of roles) {
    role.permissions = (await db('role_permissions as rp').join('permissions as p', 'p.id', 'rp.permission_id').where('rp.role_id', role.id).select('p.key')).map((row) => row.key);
    role.user_count = Number((await db('user_roles').where({ role_id: role.id }).count('* as count').first()).count);
  }
  return roles;
}

module.exports = { ensureAuthorizationSchema, getUserPermissions, listRoles };
