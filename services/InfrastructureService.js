const db = require('../db/knex');
const notificationService = require('./NotificationService');
const pushNotificationService = require('./PushNotificationService');
let kitchenSchemaReady;
let tableAccessSchemaReady;

async function ensureTableAccessSchema() {
  if (tableAccessSchemaReady) return tableAccessSchemaReady;
  tableAccessSchemaReady = (async () => {
    if (!(await db.schema.hasColumn('shops', 'table_visibility_mode'))) {
      await db.schema.alterTable('shops', table => table.string('table_visibility_mode').notNullable().defaultTo('all'));
    }
    if (!(await db.schema.hasColumn('tables', 'assigned_waiter_id'))) {
      await db.schema.alterTable('tables', table => table.integer('assigned_waiter_id').nullable().references('id').inTable('users').onDelete('SET NULL'));
    }
  })().catch(error => { tableAccessSchemaReady = null; throw error; });
  return tableAccessSchemaReady;
}

async function ensureKitchenWorkflowSchema() {
  if (kitchenSchemaReady) return kitchenSchemaReady;
  kitchenSchemaReady = (async () => {
    if (!(await db.schema.hasColumn('sales', 'preparing_at'))) {
      await db.schema.alterTable('sales', table => table.timestamp('preparing_at').nullable());
    }
    if (!(await db.schema.hasColumn('sales', 'kitchen_completed_at'))) {
      await db.schema.alterTable('sales', table => table.timestamp('kitchen_completed_at').nullable());
    }
    if (!(await db.schema.hasColumn('sales', 'served_at'))) {
      await db.schema.alterTable('sales', table => table.timestamp('served_at').nullable());
    }
    const hasUpdatedAt = await db.schema.hasColumn('sales', 'updated_at');
    await db('sales')
      .whereIn('order_status', ['ready', 'completed'])
      .whereNull('kitchen_completed_at')
      .update({ kitchen_completed_at: hasUpdatedAt ? db.raw('COALESCE(updated_at, created_at)') : db.ref('created_at') });
  })().catch(error => { kitchenSchemaReady = null; throw error; });
  return kitchenSchemaReady;
}

class InfrastructureService {
  // --- Floors ---
  async listFloors(shopId) {
    return db('floors').where({ shop_id: shopId }).orderBy('id', 'asc');
  }

  async createFloor(name, shopId) {
    const [idObj] = await db('floors').insert({ name, shop_id: shopId }).returning('id');
    return typeof idObj === 'object' ? idObj.id : idObj;
  }

  async deleteFloor(id, shopId) {
    await db('floors').where({ id, shop_id: shopId }).delete();
  }

  // --- Tables ---
  async listTables(shopId, actor = null) {
    await ensureTableAccessSchema();
    let query = db('tables as t')
      .leftJoin('users as aw', 't.assigned_waiter_id', 'aw.id')
      .where('t.shop_id', shopId)
      .select('t.*', 'aw.name as assigned_waiter_name', 'aw.username as assigned_waiter_username');
    const role = String(actor?.role || '').toLowerCase();
    const isOrderTaker = ['waiter', 'order_taker'].includes(role);
    if (isOrderTaker) {
      const shop = await db('shops').select('table_visibility_mode').where({ id: shopId }).first();
      if ((shop?.table_visibility_mode || 'all') === 'assigned') {
        query = query.where('t.assigned_waiter_id', actor.id);
      }
    }
    return query.orderBy('t.id', 'asc');
  }

  async getTableAccessConfig(shopId) {
    await ensureTableAccessSchema();
    const shop = await db('shops').select('table_visibility_mode').where({ id: shopId }).first();
    const orderTakers = await db('users')
      .select('id', 'name', 'username', 'role')
      .where({ shop_id: shopId })
      .whereIn('role', ['waiter', 'order_taker'])
      .where(function () { this.whereNull('status').orWhere('status', 'active'); })
      .orderBy('name', 'asc');
    return { mode: shop?.table_visibility_mode || 'all', order_takers: orderTakers };
  }

  async setTableVisibilityMode(shopId, mode) {
    await ensureTableAccessSchema();
    if (!['all', 'assigned'].includes(mode)) throw new Error('Invalid table visibility mode');
    await db('shops').where({ id: shopId }).update({ table_visibility_mode: mode });
  }

  async assignTable(id, waiterId, shopId) {
    await ensureTableAccessSchema();
    if (waiterId !== null) {
      const user = await db('users').where({ id: waiterId, shop_id: shopId }).whereIn('role', ['waiter', 'order_taker']).first();
      if (!user) { const error = new Error('Select a valid waiter / order taker'); error.status = 400; throw error; }
    }
    const updated = await db('tables').where({ id, shop_id: shopId }).update({ assigned_waiter_id: waiterId });
    if (!updated) { const error = new Error('Table not found'); error.status = 404; throw error; }
  }

  async assertTableAccess(shopId, tableId, userId) {
    await ensureTableAccessSchema();
    const actor = await db('users').select('id', 'role').where({ id: userId, shop_id: shopId }).first();
    const role = String(actor?.role || '').toLowerCase();
    if (!['waiter', 'order_taker'].includes(role)) return;
    const shop = await db('shops').select('table_visibility_mode').where({ id: shopId }).first();
    if ((shop?.table_visibility_mode || 'all') !== 'assigned') return;
    const table = await db('tables').where({ id: tableId, shop_id: shopId, assigned_waiter_id: userId }).first();
    if (!table) { const error = new Error('This table is not assigned to you'); error.status = 403; throw error; }
  }

  async createTable(payload, shopId) {
    const { table_number, capacity, floor_id } = payload;
    const [idObj] = await db('tables').insert({
      shop_id: shopId,
      table_number,
      capacity: capacity || 4,
      floor_id: floor_id || null,
      status: 'available'
    }).returning('id');
    return typeof idObj === 'object' ? idObj.id : idObj;
  }

  async updateTableStatus(id, status, shopId) {
    await db('tables').where({ id, shop_id: shopId }).update({ status });
  }

  // --- Kitchen Display System (KDS) ---
  async listActiveKitchenOrders(shopId, kitchenUserId = null) {
    await ensureKitchenWorkflowSchema();
    let query = db('sales as s')
      .leftJoin('tables as t', 's.table_id', 't.id')
      .leftJoin('users as u', 's.waiter_id', 'u.id')
      .leftJoin('users as cb', 's.user_id', 'cb.id')
      .where('s.shop_id', shopId)
      .whereIn('s.order_status', ['pending', 'preparing', 'ready', 'completed'])
      .select(
        's.id', 's.user_id as punched_by_user_id', 's.order_type', 's.order_status', 's.table_id', 's.token_number',
        's.guest_count', 's.created_at', 's.updated_at', 's.preparing_at', 's.kitchen_completed_at', 's.served_at', 's.special_instructions as order_notes',
        't.table_number', 'u.name as waiter_name', 'cb.name as punched_by_name', 'cb.username as punched_by_username'
      );

    if (kitchenUserId) {
      query = query.where('s.kitchen_id', kitchenUserId);
    }

    const orders = await query.orderBy('s.created_at', 'asc');

    for (let order of orders) {
      if (!String(order.punched_by_name || '').trim() && !String(order.punched_by_username || '').trim() && order.punched_by_user_id) {
        const creator = await db('users')
          .select('name', 'username')
          .where({ id: order.punched_by_user_id })
          .first();
        if (creator) {
          order.punched_by_name = String(creator.name || '').trim() || null;
          order.punched_by_username = String(creator.username || '').trim() || null;
        }
      }
      const items = await db('sale_items as si')
        .leftJoin('products as p', 'si.product_id', 'p.id')
        .where('si.sale_id', order.id)
        .select(
          'si.id', 'si.quantity', 'si.custom_name', 'si.special_instructions', 
          'si.variants_json', 'si.addons_json',
          db.raw('COALESCE(p.name, si.custom_name) as product_name')
        );

      order.items = items.map(item => ({
        ...item,
        variants: typeof item.variants_json === 'string' ? JSON.parse(item.variants_json) : (item.variants_json || null),
        addons: typeof item.addons_json === 'string' ? JSON.parse(item.addons_json) : (item.addons_json || null)
      }));
    }

    return orders;
  }

  async updateOrderStatus(saleId, status, shopId, userId = null) {
    await ensureKitchenWorkflowSchema();
    const allowedStatuses = new Set(['pending', 'preparing', 'ready', 'served', 'completed']);
    if (!allowedStatuses.has(status)) throw new Error('Invalid order status');

    if (status === 'served') {
      const sale = await db('sales').where({ id: saleId, shop_id: shopId }).first();
      if (!sale) throw new Error('Sale not found');
      const actor = userId ? await db('users').where({ id: userId, shop_id: shopId }).first() : null;
      const isOrderCreator = Number(sale.user_id) === Number(userId);
      const isAssignedOrderTaker = Number(sale.waiter_id) === Number(userId);
      const isReceptionist = String(actor?.role || '').toLowerCase() === 'receptionist';
      if (!isOrderCreator && !isAssignedOrderTaker && !isReceptionist) {
        const error = new Error('Only the order creator, assigned order taker, or a receptionist can mark this order served.');
        error.status = 403;
        throw error;
      }
      if (!['ready', 'served'].includes(sale.order_status)) {
        throw new Error('Only a ready order can be marked as served.');
      }
      await db('sales')
        .where({ id: saleId, shop_id: shopId })
        .update({ order_status: 'served', served_at: sale.served_at || db.fn.now() });
      return;
    }

    if (status === 'completed') {
      const sale = await db('sales')
        .where({ id: saleId, shop_id: shopId })
        .first();
      if (!sale) throw new Error('Sale not found');

      const updateData = { order_status: status, kitchen_completed_at: db.fn.now() };
      if (!sale.shift_id) {
        const activeShift = userId
          ? await db('shifts')
            .where({ shop_id: shopId, user_id: userId, status: 'open' })
            .first()
          : null;
        if (!activeShift) throw new Error('Open a register shift before completing this order.');
        updateData.shift_id = activeShift.id;
      }

      await db('sales')
        .where({ id: saleId, shop_id: shopId })
        .update(updateData);

      if (sale && sale.table_id) {
        await db('tables')
          .where({ id: sale.table_id, shop_id: shopId })
          .update({ status: 'available' });
      }
      return;
    }

    const sale = status === 'ready'
      ? await db('sales').where({ id: saleId, shop_id: shopId }).first()
      : null;
    const updateData = { order_status: status };
    if (status === 'preparing') updateData.preparing_at = db.fn.now();
    if (status === 'ready') updateData.kitchen_completed_at = db.fn.now();
    await db('sales')
      .where({ id: saleId, shop_id: shopId })
      .update(updateData);

    if (status === 'ready' && sale && !['ready', 'completed'].includes(sale.order_status)) {
      // The creator owns the in-shop workflow, while waiter_id identifies the
      // assigned waiter/order taker. Notify both without creating duplicates.
      const recipientIds = [...new Set([sale.user_id, sale.waiter_id].filter(Boolean).map(Number))];
      const table = sale.table_id ? await db('tables').where({ id: sale.table_id, shop_id: shopId }).first() : null;
      const context = table ? ` for Table ${table.table_number}` : '';
      const title = `Order #${saleId} completed by kitchen`;
      const message = `Order #${saleId}${context} is ready to serve.`;

      await Promise.all(recipientIds.map(async targetUserId => {
        try {
          await notificationService.create({
            shop_id: shopId,
            target_user_id: targetUserId,
            type: 'system',
            priority: 'high',
            title,
            message,
            action_label: 'View order',
            action_url: '/dashboard',
            status: 'active',
          }, { id: userId || sale.user_id || targetUserId });
        } catch (error) {
          console.error(`Order ready in-app notification failed for user ${targetUserId}:`, error.message);
          return;
        }

        // Background device push is optional; the in-app notification above
        // works even when the user has not granted Android notification access.
        try {
          await pushNotificationService.sendToUser(targetUserId, {
            title,
            body: message,
            tag: `order-ready-${saleId}-${targetUserId}`,
            orderId: saleId,
            url: '/dashboard',
            requireInteraction: true,
          });
        } catch (error) {
          console.error(`Order ready device push failed for user ${targetUserId}:`, error.message);
        }
      }));
    }
  }
}

module.exports = new InfrastructureService();
