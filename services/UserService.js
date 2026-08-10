const db = require('../db/knex');
const bcrypt = require('bcryptjs');
const { z } = require('zod');

const userSchema = z.object({
  name: z.string().min(1),
  username: z.string().min(3),
  password: z.string().min(4).optional(),
  role: z.string().default('pos_user'),
  shop_id: z.coerce.number().int().nullable().optional(),
  allowed_panels: z.array(z.string()).nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  printer_station: z.string().nullable().optional(),
  status: z.enum(['active', 'blocked']).default('active'),
  can_manage_register: z.boolean().default(false).optional(),
  role_ids: z.array(z.coerce.number().int()).optional(),
  permission_keys: z.array(z.string()).optional(),
  use_custom_permissions: z.boolean().optional(),
});

class UserService {
  async listUsers(currentUser) {
    const isSuper = currentUser.role === 'superadmin';
    
    let query = db('users as u')
      .select('u.id', 'u.name', 'u.email', 'u.phone', 'u.username', 'u.role', 'u.printer_station', 'u.status', 'u.shop_id', 'u.allowed_panels', 'u.can_manage_register', 'u.use_custom_permissions', 'u.created_at')
      .orderBy('u.created_at', 'desc');

    if (isSuper) {
      query = query.select('s.name as shop_name').leftJoin('shops as s', 'u.shop_id', 's.id');
    } else {
      query = query.where({ shop_id: currentUser.shop_id }).whereNot('role', 'superadmin').whereNotNull('shop_id');
    }

    const users = await query;
    return Promise.all(users.map(async (u) => ({
      ...u,
      allowed_panels: u.allowed_panels ? JSON.parse(u.allowed_panels) : [],
      roles: await db('user_roles as ur').join('roles as r', 'r.id', 'ur.role_id').where('ur.user_id', u.id).select('r.id', 'r.name'),
      permission_keys: await db('user_permissions as up').join('permissions as p', 'p.id', 'up.permission_id').where('up.user_id', u.id).pluck('p.key')
    })));
  }

  async createUser(payload, currentUser) {
    const data = userSchema.parse(payload);
    
    if (data.role === 'superadmin') throw new Error('Cannot create Super Admins');

    const existing = await db('users').where({ username: data.username }).first();
    if (existing) throw new Error('Username already taken');

    const hash = bcrypt.hashSync(payload.password, 10);
    const targetShopId = currentUser.role === 'superadmin' ? (data.shop_id || null) : currentUser.shop_id;

    const [idObj] = await db.transaction(async (trx) => {
      const [newId] = await trx('users').insert({
        name: data.name,
        email: data.email,
        phone: data.phone,
        username: data.username,
        password_hash: hash,
        role: data.role,
        status: data.status,
        allowed_panels: JSON.stringify(data.allowed_panels || []),
        shop_id: targetShopId,
        can_manage_register: data.can_manage_register || false,
        use_custom_permissions: !!data.use_custom_permissions
      }).returning('id');

      const uid = typeof newId === 'object' ? newId.id : newId;

      if (targetShopId) {
        await trx('shops').where({ id: targetShopId }).increment('user_count', 1);
      }

      if (data.role_ids?.length) {
        const validRoles = await trx('roles').where({ shop_id: targetShopId }).whereIn('id', data.role_ids).select('id');
        await trx('user_roles').insert(validRoles.map((role) => ({ user_id: uid, role_id: role.id })));
      }
      if (data.use_custom_permissions && data.permission_keys?.length) {
        const permissions = await trx('permissions').whereIn('key', data.permission_keys).select('id');
        await trx('user_permissions').insert(permissions.map(permission => ({ user_id: uid, permission_id: permission.id })));
      }

      return [uid];
    });

    return idObj;
  }

  async updateUser(userId, payload, currentUser) {
    const userToEdit = await db('users').where({ id: userId }).first();
    if (!userToEdit) throw new Error('User not found');

    if (currentUser.role !== 'superadmin') {
      if (userToEdit.shop_id !== currentUser.shop_id) throw new Error('Access denied');
      
      // Shop administrators may maintain same-shop staff but never elevate platform access.
      const updatable = {};
      if (payload.name) updatable.name = payload.name;
      if (payload.username) updatable.username = payload.username;
      if (payload.email !== undefined) updatable.email = payload.email;
      if (payload.phone !== undefined) updatable.phone = payload.phone;
      if (payload.status) updatable.status = payload.status;
      if (payload.password) updatable.password_hash = bcrypt.hashSync(payload.password, 10);
      if (payload.hasOwnProperty('can_manage_register')) updatable.can_manage_register = !!payload.can_manage_register;
      if (payload.hasOwnProperty('use_custom_permissions')) updatable.use_custom_permissions = !!payload.use_custom_permissions;
      
      if (Object.keys(updatable).length > 0) {
        updatable.updated_at = db.fn.now();
        await db('users').where({ id: userId }).update(updatable);
      } else if (!Array.isArray(payload.role_ids)) {
        throw new Error('No valid fields provided for update.');
      }
      if (Array.isArray(payload.role_ids)) {
        const validRoles = await db('roles').where({ shop_id: currentUser.shop_id }).whereIn('id', payload.role_ids).select('id');
        await db.transaction(async (trx) => {
          await trx('user_roles').where({ user_id: userId }).del();
          if (validRoles.length) await trx('user_roles').insert(validRoles.map((role) => ({ user_id: Number(userId), role_id: role.id })));
        });
      }
      if (Array.isArray(payload.permission_keys)) await this.replaceUserPermissions(userId, payload.permission_keys);
      return;
    }

    // Superadmin logic
    const data = userSchema.partial().parse(payload);
    
    // Check if username is being changed and if it already exists
    if (data.username && data.username !== userToEdit.username) {
      const existing = await db('users').where({ username: data.username }).first();
      if (existing) throw new Error('Username already taken');
    }

    const isSuper = userToEdit.role === 'superadmin';
    const updateData = {
      name: data.name || userToEdit.name,
      username: data.username || userToEdit.username,
      email: data.email !== undefined ? data.email : userToEdit.email,
      phone: data.phone !== undefined ? data.phone : userToEdit.phone,
      role: !isSuper ? (data.role || userToEdit.role) : userToEdit.role,
      printer_station: data.hasOwnProperty('printer_station') ? data.printer_station : userToEdit.printer_station,
      shop_id: data.hasOwnProperty('shop_id') ? data.shop_id : userToEdit.shop_id,
      status: isSuper ? 'active' : (data.status || userToEdit.status),
      allowed_panels: JSON.stringify(data.allowed_panels || JSON.parse(userToEdit.allowed_panels || '[]')),
      can_manage_register: data.hasOwnProperty('can_manage_register') ? data.can_manage_register : userToEdit.can_manage_register,
      use_custom_permissions: data.hasOwnProperty('use_custom_permissions') ? data.use_custom_permissions : userToEdit.use_custom_permissions,
      updated_at: db.fn.now()
    };

    if (payload.password) {
      updateData.password_hash = bcrypt.hashSync(payload.password, 10);
    }

    await db.transaction(async (trx) => {
      const oldShopId = userToEdit.shop_id;
      const newShopId = updateData.shop_id;

      await trx('users').where({ id: userId }).update(updateData);

      if (Array.isArray(data.role_ids)) {
        const validRoles = await trx('roles').where({ shop_id: newShopId }).whereIn('id', data.role_ids).select('id');
        await trx('user_roles').where({ user_id: userId }).del();
        if (validRoles.length) await trx('user_roles').insert(validRoles.map((role) => ({ user_id: Number(userId), role_id: role.id })));
      }
      if (Array.isArray(data.permission_keys)) {
        const permissions = await trx('permissions').whereIn('key', data.permission_keys).select('id');
        await trx('user_permissions').where({ user_id: userId }).del();
        if (permissions.length) await trx('user_permissions').insert(permissions.map(permission => ({ user_id: Number(userId), permission_id: permission.id })));
      }

      if (oldShopId !== newShopId) {
        if (oldShopId) await trx('shops').where({ id: oldShopId }).decrement('user_count', 1);
        if (newShopId) await trx('shops').where({ id: newShopId }).increment('user_count', 1);
      }
    });
  }

  async replaceUserPermissions(userId, keys) {
    const permissions = await db('permissions').whereIn('key', [...new Set(keys)]).select('id');
    await db.transaction(async trx => {
      await trx('user_permissions').where({ user_id: userId }).del();
      if (permissions.length) await trx('user_permissions').insert(permissions.map(permission => ({ user_id: Number(userId), permission_id: permission.id })));
    });
  }

  async deleteUser(userId, currentUser) {
    if (Number(userId) === Number(currentUser.id)) throw new Error('Cannot delete yourself');

    const userToDelete = await db('users').where({ id: userId }).first();
    if (!userToDelete) throw new Error('User not found');
    if (userToDelete.role === 'superadmin') throw new Error('The Master Owner account cannot be deleted');
    if (currentUser.role !== 'superadmin' && Number(userToDelete.shop_id) !== Number(currentUser.shop_id)) throw new Error('Access denied');

    await db.transaction(async (trx) => {
      await trx('users').where({ id: userId }).delete();
      if (userToDelete.shop_id) {
        await trx('shops').where({ id: userToDelete.shop_id }).decrement('user_count', 1);
      }
    });
  }
}

module.exports = new UserService();
