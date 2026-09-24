const db = require('../db/knex');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { ORDER_TYPES, RESTAURANT_ORDER_TYPES, normalizeOrderTypes } = require('./OrderTypePermissionService');

const shopSchema = z.object({
  name: z.string().min(1),
  shop_type: z.enum(['restaurant', 'retail', 'retail_restaurant']).default('restaurant'),
  allowed_order_types: z.array(z.enum(ORDER_TYPES)).min(1).optional().default(RESTAURANT_ORDER_TYPES),
  allowed_panels: z.array(z.string()).optional().default([]),
  adminUsername: z.string().min(3),
  adminPassword: z.string().min(6),
  employees: z.array(z.object({
    name: z.string(),
    username: z.string(),
    password: z.string().optional(),
    role: z.string().optional(),
    allowed_panels: z.array(z.string()).optional()
  })).optional(),
  kitchens: z.array(z.object({
    name: z.string(),
    username: z.string(),
    password: z.string().optional(),
    allowed_panels: z.array(z.string()).optional()
  })).optional(),
});

function ensureShopPanels(panels = []) {
  return [...new Set([...(Array.isArray(panels) ? panels : []), 'notifications'])];
}

class ShopService {
  async listShops() {
    const shops = await db('shops').orderBy('created_at', 'desc');
    return shops.map(s => ({
      ...s,
      allowed_panels: typeof s.allowed_panels === 'string' ? JSON.parse(s.allowed_panels) : (s.allowed_panels || []),
      allowed_order_types: normalizeOrderTypes(s.allowed_order_types, s.shop_type)
    }));
  }

  async createShop(payload) {
    const data = shopSchema.parse(payload);
    const panelsJson = JSON.stringify(ensureShopPanels(data.allowed_panels));

    const shopId = await db.transaction(async (trx) => {
      // 1. Create Restaurant
      const [idObj] = await trx('shops').insert({
        name: data.name,
        shop_type: data.shop_type,
        allowed_order_types: JSON.stringify(data.allowed_order_types),
        allowed_panels: panelsJson,
        status: 'active'
      }).returning('id');
      
      const sid = typeof idObj === 'object' ? idObj.id : idObj;

      // 2. Create Admin User
      const adminHash = bcrypt.hashSync(data.adminPassword, 10);
      await trx('users').insert({
        name: `${data.name} Admin`,
        username: data.adminUsername,
        password_hash: adminHash,
        role: 'admin',
        shop_id: sid,
        allowed_panels: panelsJson
      });

      // 3. Create Employees
      if (data.employees) {
        for (const emp of data.employees) {
          const empHash = emp.password ? bcrypt.hashSync(emp.password, 10) : null;
          await trx('users').insert({
            name: emp.name,
            username: emp.username,
            password_hash: empHash,
            role: emp.role || 'user',
            shop_id: sid,
            allowed_panels: JSON.stringify(emp.allowed_panels || [])
          });
        }
      }

      // 4. Create Kitchens
      if (data.kitchens) {
        for (const kit of data.kitchens) {
          const kitHash = kit.password ? bcrypt.hashSync(kit.password, 10) : null;
          await trx('users').insert({
            name: kit.name,
            username: kit.username,
            password_hash: kitHash,
            role: 'kitchen',
            shop_id: sid,
            allowed_panels: JSON.stringify(kit.allowed_panels || [])
          });
        }
      }

      // 5. Update counts
      let totalUsers = 1; // Start with 1 for the admin
      if (data.employees) totalUsers += data.employees.length;
      if (data.kitchens) totalUsers += data.kitchens.length;

      await trx('shops').where({ id: sid }).update({ user_count: totalUsers });

      // 6. Log activity
      await trx('activity_logs').insert({
        shop_id: sid,
        action: 'Restaurant Created',
        details: `Restaurant ${data.name} created with ${totalUsers} initial staff.`
      });

      return sid;
    });

    return shopId;
  }

  async updateShop(id, updates) {
    const { name, status, allowed_panels } = updates;
    const upData = {};
    if (name) upData.name = name;
    if (status) upData.status = status;
    if (allowed_panels) upData.allowed_panels = JSON.stringify(ensureShopPanels(allowed_panels));
    if (updates.allowed_order_types !== undefined) {
      upData.allowed_order_types = JSON.stringify(z.array(z.enum(ORDER_TYPES)).min(1).parse(updates.allowed_order_types));
    }

    if (Object.keys(upData).length === 0) return;

    await db('shops').where({ id }).update(upData);
  }

  async deleteShop(id) {
    if (Number(id) === 1) throw new Error("Cannot delete main restaurant");
    await db('shops').where({ id }).delete();
  }
}

module.exports = new ShopService();
