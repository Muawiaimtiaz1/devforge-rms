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
  permissionError(message) {
    const error = new Error(message);
    error.status = 403;
    return error;
  }

  legacyRoleForAssignedRole(roleName, fallback = 'user') {
    const normalized = String(roleName || '').trim().toLowerCase();
    const mapping = {
      'restaurant admin': 'admin', admin: 'admin', manager: 'manager', cashier: 'pos_user',
      waiter: 'waiter', 'order taker': 'order_taker', kitchen: 'kitchen', rider: 'rider',
      receptionist: 'receptionist', accountant: 'user', 'inventory staff': 'user'
    };
    return mapping[normalized] || fallback || 'user';
  }

  async resolveSingleRole(trx, shopId, roleIds) {
    const roleId = Number(Array.isArray(roleIds) ? roleIds[0] : roleIds);
    if (!Number.isInteger(roleId)) throw new Error('Please assign a role to this user.');
    const role = await trx('roles').where({ id: roleId, shop_id: shopId }).first();
    if (!role) throw new Error('Selected role is not available for this shop.');
    return role;
  }

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
    if (!users.length) return [];

    const userIds = users.map(user => user.id);
    const [roleRows, permissionRows] = await Promise.all([
      db('user_roles as ur')
        .join('roles as r', 'r.id', 'ur.role_id')
        .whereIn('ur.user_id', userIds)
        .select('ur.user_id', 'r.id', 'r.name'),
      db('user_permissions as up')
        .join('permissions as p', 'p.id', 'up.permission_id')
        .whereIn('up.user_id', userIds)
        .select('up.user_id', 'p.key'),
    ]);
    const rolesByUser = new Map();
    const permissionsByUser = new Map();
    roleRows.forEach(row => rolesByUser.set(Number(row.user_id), [
      ...(rolesByUser.get(Number(row.user_id)) || []),
      { id: row.id, name: row.name },
    ]));
    permissionRows.forEach(row => permissionsByUser.set(Number(row.user_id), [
      ...(permissionsByUser.get(Number(row.user_id)) || []),
      row.key,
    ]));

    return users.map(user => ({
      ...user,
      allowed_panels: user.allowed_panels ? JSON.parse(user.allowed_panels) : [],
      roles: rolesByUser.get(Number(user.id)) || [],
      permission_keys: permissionsByUser.get(Number(user.id)) || [],
    }));
  }

  async createUser(payload, currentUser) {
    const data = userSchema.parse(payload);
    if (!data.password) throw new Error('Password is required for new users');
    
    if (data.role === 'superadmin') throw new Error('Cannot create Super Admins');

    const existing = await db('users').where({ username: data.username }).first();
    if (existing) throw new Error('Username already taken');

    const hash = bcrypt.hashSync(data.password, 10);
    const targetShopId = currentUser.role === 'superadmin' ? (data.shop_id || null) : currentUser.shop_id;

    const [idObj] = await db.transaction(async (trx) => {
      const assignedRole = await this.resolveSingleRole(trx, targetShopId, data.role_ids);
      const [newId] = await trx('users').insert({
        name: data.name,
        email: data.email,
        phone: data.phone,
        username: data.username,
        password_hash: hash,
        role: this.legacyRoleForAssignedRole(assignedRole.name, data.role),
        status: data.status,
        allowed_panels: JSON.stringify(data.allowed_panels || []),
        shop_id: targetShopId,
        can_manage_register: data.can_manage_register || false,
        use_custom_permissions: false
      }).returning('id');

      const uid = typeof newId === 'object' ? newId.id : newId;

      if (targetShopId) {
        await trx('shops').where({ id: targetShopId }).increment('user_count', 1);
      }

      await trx('user_roles').insert({ user_id: uid, role_id: assignedRole.id });

      return [uid];
    });

    return idObj;
  }

  async updateUser(userId, payload, currentUser, permissions = []) {
    const isSuper = currentUser.role === 'superadmin';
    const target = { id: userId };
    if (!isSuper) target.shop_id = currentUser.shop_id;
    const userToEdit = await db('users').where(target).first();
    if (!userToEdit) {
      const error = new Error('User not found');
      error.status = 404;
      throw error;
    }

    if (!isSuper) {
      const canUpdate = permissions.includes('users.update');
      const canAssignRoles = permissions.includes('users.assign_roles');
      const profileFields = ['name', 'username', 'email', 'phone', 'status', 'password', 'can_manage_register'];
      const requestsProfileUpdate = profileFields.some((field) => Object.prototype.hasOwnProperty.call(payload, field));
      const requestsRoleUpdate = Object.prototype.hasOwnProperty.call(payload, 'role_ids');
      if (requestsProfileUpdate && !canUpdate) {
        throw this.permissionError('You do not have permission to update user details.');
      }
      if (requestsRoleUpdate && !canAssignRoles) {
        throw this.permissionError('You do not have permission to assign user roles.');
      }
      if (!requestsProfileUpdate && !requestsRoleUpdate) throw new Error('No valid fields provided for update.');

      if (payload.username && payload.username !== userToEdit.username) {
        const existing = await db('users').where({ username: payload.username }).whereNot({ id: userId }).first();
        if (existing) {
          const error = new Error('Username already taken');
          error.status = 409;
          throw error;
        }
      }
      
      // Shop administrators may maintain same-shop staff but never elevate platform access.
      const updatable = {};
      if (payload.name) updatable.name = payload.name;
      if (payload.username) updatable.username = payload.username;
      if (payload.email !== undefined) updatable.email = payload.email;
      if (payload.phone !== undefined) updatable.phone = payload.phone;
      if (payload.status) updatable.status = payload.status;
      if (payload.password) updatable.password_hash = bcrypt.hashSync(payload.password, 10);
      if (payload.hasOwnProperty('can_manage_register')) updatable.can_manage_register = !!payload.can_manage_register;
      updatable.use_custom_permissions = false;
      
      if (Object.keys(updatable).length > 0) {
        updatable.updated_at = db.fn.now();
        await db('users').where({ id: userId, shop_id: currentUser.shop_id }).update(updatable);
      } else if (!Array.isArray(payload.role_ids)) {
        throw new Error('No valid fields provided for update.');
      }
      if (Array.isArray(payload.role_ids)) {
        await db.transaction(async (trx) => {
          const assignedRole = await this.resolveSingleRole(trx, currentUser.shop_id, payload.role_ids);
          await trx('user_roles').where({ user_id: userId }).del();
          await trx('user_roles').insert({ user_id: Number(userId), role_id: assignedRole.id });
          await trx('user_permissions').where({ user_id: userId }).del();
          await trx('users').where({ id: userId, shop_id: currentUser.shop_id }).update({ role: this.legacyRoleForAssignedRole(assignedRole.name, userToEdit.role), use_custom_permissions: false });
        });
      }
      return;
    }

    // Superadmin logic
    const data = userSchema.partial().parse(payload);
    
    // Check if username is being changed and if it already exists
    if (data.username && data.username !== userToEdit.username) {
      const existing = await db('users').where({ username: data.username }).first();
      if (existing) throw new Error('Username already taken');
    }

    const isTargetSuper = userToEdit.role === 'superadmin';
    const updateData = {
      name: data.name || userToEdit.name,
      username: data.username || userToEdit.username,
      email: data.email !== undefined ? data.email : userToEdit.email,
      phone: data.phone !== undefined ? data.phone : userToEdit.phone,
      role: !isSuper ? (data.role || userToEdit.role) : userToEdit.role,
      printer_station: data.hasOwnProperty('printer_station') ? data.printer_station : userToEdit.printer_station,
      shop_id: data.hasOwnProperty('shop_id') ? data.shop_id : userToEdit.shop_id,
      status: isTargetSuper ? 'active' : (data.status || userToEdit.status),
      allowed_panels: JSON.stringify(data.allowed_panels || JSON.parse(userToEdit.allowed_panels || '[]')),
      can_manage_register: data.hasOwnProperty('can_manage_register') ? data.can_manage_register : userToEdit.can_manage_register,
      use_custom_permissions: false,
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
        const assignedRole = await this.resolveSingleRole(trx, newShopId, data.role_ids);
        await trx('user_roles').where({ user_id: userId }).del();
        await trx('user_permissions').where({ user_id: userId }).del();
        await trx('user_roles').insert({ user_id: Number(userId), role_id: assignedRole.id });
        if (!isTargetSuper) await trx('users').where({ id: userId }).update({ role: this.legacyRoleForAssignedRole(assignedRole.name, updateData.role), use_custom_permissions: false });
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

    const target = { id: userId };
    if (currentUser.role !== 'superadmin') target.shop_id = currentUser.shop_id;
    const userToDelete = await db('users').where(target).first();
    if (!userToDelete) {
      const error = new Error('User not found');
      error.status = 404;
      throw error;
    }
    if (userToDelete.role === 'superadmin') throw new Error('The Master Owner account cannot be deleted');

    await db.transaction(async (trx) => {
      await trx('users').where(target).delete();
      if (userToDelete.shop_id) {
        await trx('shops').where({ id: userToDelete.shop_id }).decrement('user_count', 1);
      }
    });
  }
}

module.exports = new UserService();
