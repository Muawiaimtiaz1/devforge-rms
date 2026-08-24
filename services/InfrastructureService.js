const db = require('../db/knex');
const notificationService = require('./NotificationService');
const pushNotificationService = require('./PushNotificationService');
const cashDrawerService = require('./CashDrawerService');
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
    if (!(await db.schema.hasTable('kitchen_order_statuses'))) {
      await db.schema.createTable('kitchen_order_statuses', table => {
        table.increments('id').primary();
        table.integer('shop_id').notNullable().references('id').inTable('shops').onDelete('CASCADE');
        table.integer('sale_id').notNullable().references('id').inTable('sales').onDelete('CASCADE');
        table.integer('kitchen_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.string('status').notNullable().defaultTo('pending');
        table.timestamp('updated_at').defaultTo(db.fn.now());
        table.unique(['sale_id', 'kitchen_id']);
      });
    }
    const hasUpdatedAt = await db.schema.hasColumn('sales', 'updated_at');
    await db('sales')
      .whereIn('order_status', ['ready', 'served', 'completed'])
      .whereNull('kitchen_completed_at')
      .update({ kitchen_completed_at: hasUpdatedAt ? db.raw('COALESCE(updated_at, created_at)') : db.ref('created_at') });
  })().catch(error => { kitchenSchemaReady = null; throw error; });
  return kitchenSchemaReady;
}

class InfrastructureService {
  async notifyOrderReady(sale, saleId, shopId, userId) {
    const recipientIds = [...new Set([sale.user_id, sale.waiter_id].filter(Boolean).map(Number))];
    const table = sale.table_id ? await db('tables').where({ id: sale.table_id, shop_id: shopId }).first() : null;
    const context = table ? ` for Table ${table.table_number}` : '';
    const displayOrderNumber = sale.order_number || saleId;
    const title = `Order #${displayOrderNumber} completed by kitchen`;
    const message = `Order #${displayOrderNumber}${context} is ready to serve.`;

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
    const table_number = String(payload.table_number || '').trim();
    const capacity = Number(payload.capacity || 4);
    const floor_id = payload.floor_id ? Number(payload.floor_id) : null;
    if (!table_number) { const error = new Error('Table number / name is required'); error.status = 400; throw error; }
    if (!Number.isInteger(capacity) || capacity < 1) { const error = new Error('Capacity must be at least 1'); error.status = 400; throw error; }
    if (floor_id) {
      const floor = await db('floors').where({ id: floor_id, shop_id: shopId }).first();
      if (!floor) { const error = new Error('Selected floor was not found'); error.status = 400; throw error; }
    }
    const [idObj] = await db('tables').insert({
      shop_id: shopId,
      table_number,
      capacity,
      floor_id,
      status: 'available'
    }).returning('id');
    return typeof idObj === 'object' ? idObj.id : idObj;
  }

  async updateTable(id, payload, shopId) {
    const table = await db('tables').where({ id, shop_id: shopId }).first();
    if (!table) { const error = new Error('Table not found'); error.status = 404; throw error; }
    const tableNumber = String(payload.table_number || '').trim();
    const capacity = Number(payload.capacity);
    const floorId = payload.floor_id ? Number(payload.floor_id) : null;
    if (!tableNumber) { const error = new Error('Table number / name is required'); error.status = 400; throw error; }
    if (!Number.isInteger(capacity) || capacity < 1) { const error = new Error('Capacity must be at least 1'); error.status = 400; throw error; }
    if (floorId) {
      const floor = await db('floors').where({ id: floorId, shop_id: shopId }).first();
      if (!floor) { const error = new Error('Selected floor was not found'); error.status = 400; throw error; }
    }
    await db('tables').where({ id: table.id, shop_id: shopId }).update({
      table_number: tableNumber,
      capacity,
      floor_id: floorId
    });
  }

  async deleteTable(id, shopId) {
    const table = await db('tables').where({ id, shop_id: shopId }).first();
    if (!table) { const error = new Error('Table not found'); error.status = 404; throw error; }
    const linkedOrder = await db('sales').where({ table_id: table.id, shop_id: shopId }).first();
    if (linkedOrder) {
      const error = new Error('This table has linked order history and cannot be deleted. Edit or mark it available instead.');
      error.status = 409;
      throw error;
    }
    await db('tables').where({ id: table.id, shop_id: shopId }).del();
  }

  async updateTableStatus(id, status, shopId) {
    await db('tables').where({ id, shop_id: shopId }).update({ status });
  }

  // --- Kitchen Display System (KDS) ---
  async listActiveKitchenOrders(shopId, kitchenUserId = null, options = {}) {
    await ensureKitchenWorkflowSchema();
    const view = ['new', 'updated', 'preparing', 'completed'].includes(options.view) ? options.view : 'all';
    const query = db('sales as s')
      .leftJoin('tables as t', 's.table_id', 't.id')
      .leftJoin('users as u', 's.waiter_id', 'u.id')
      .leftJoin('users as cb', 's.user_id', 'cb.id')
      .where('s.shop_id', shopId)
      .select(
        's.id', 's.order_number', 's.user_id as punched_by_user_id', 's.kitchen_id', 's.order_type', 's.order_status', 's.table_id', 's.token_number',
        's.guest_count', 's.created_at', 's.updated_at', 's.preparing_at', 's.kitchen_completed_at', 's.served_at', 's.special_instructions as order_notes',
        't.table_number', 'u.name as waiter_name', 'cb.name as punched_by_name', 'cb.username as punched_by_username',
        db.raw(`(
          SELECT kou.changes_json
          FROM kitchen_order_updates kou
          WHERE kou.sale_id = s.id AND kou.shop_id = s.shop_id
          ORDER BY kou.updated_at DESC
          LIMIT 1
        ) as kitchen_changes`),
        db.raw(`(
          SELECT kou.updated_at
          FROM kitchen_order_updates kou
          WHERE kou.sale_id = s.id AND kou.shop_id = s.shop_id
          ORDER BY kou.updated_at DESC
          LIMIT 1
        ) as kitchen_updated_at`)
      );

    let effectiveStatusSql = 's.order_status';
    if (kitchenUserId) {
      query.leftJoin('kitchen_order_statuses as selected_kos', function () {
        this.on('selected_kos.sale_id', '=', 's.id')
          .andOn('selected_kos.kitchen_id', '=', db.raw('?', [kitchenUserId]));
      });
      effectiveStatusSql = `CASE
        WHEN s.order_status IN ('ready', 'served', 'completed') THEN s.order_status
        WHEN selected_kos.status = 'completed' THEN 'ready'
        ELSE COALESCE(selected_kos.status, s.order_status)
      END`;
    }

    if (view === 'new') {
      query.whereRaw(`${effectiveStatusSql} = ?`, ['pending'])
        .whereNotExists(function () {
          this.select(db.raw('1'))
            .from('kitchen_order_updates as new_kou')
            .whereRaw('new_kou.sale_id = s.id')
            .whereRaw('new_kou.shop_id = s.shop_id');
        });
    }
    else if (view === 'updated') {
      query.whereRaw(`${effectiveStatusSql} = ?`, ['pending'])
        .whereExists(function () {
          this.select(db.raw('1'))
            .from('kitchen_order_updates as updated_kou')
            .whereRaw('updated_kou.sale_id = s.id')
            .whereRaw('updated_kou.shop_id = s.shop_id');
        });
    }
    else if (view === 'preparing') query.whereRaw(`${effectiveStatusSql} = ?`, ['preparing']);
    else if (view === 'completed') {
      query.whereRaw(`${effectiveStatusSql} IN (?, ?, ?)`, ['ready', 'served', 'completed']);
      const period = ['today', 'yesterday', '7days', '30days', 'all'].includes(options.completedPeriod)
        ? options.completedPeriod
        : 'today';
      if (period !== 'all') {
        const requestedStart = new Date(options.completedFrom || '');
        const requestedEnd = new Date(options.completedTo || '');
        const hasValidRange = Number.isFinite(requestedStart.getTime()) && Number.isFinite(requestedEnd.getTime()) && requestedStart < requestedEnd;
        const now = new Date();
        const start = hasValidRange ? requestedStart : new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const end = hasValidRange ? requestedEnd : new Date(start.getTime() + 86400000);
        if (!hasValidRange) {
          if (period === 'yesterday') {
            start.setDate(start.getDate() - 1);
            end.setDate(end.getDate() - 1);
          } else if (period === '7days') start.setDate(start.getDate() - 6);
          else if (period === '30days') start.setDate(start.getDate() - 29);
        }
        query.whereRaw('COALESCE(s.kitchen_completed_at, s.updated_at, s.created_at) >= ?', [start])
          .andWhereRaw('COALESCE(s.kitchen_completed_at, s.updated_at, s.created_at) < ?', [end]);
      }
    }
    else query.whereIn('s.order_status', ['pending', 'preparing', 'ready', 'served', 'completed']);

    const orders = await query.orderBy('s.created_at', 'asc');
    const hasRouteTargets = await db.schema.hasColumn('product_categories', 'route_targets');
    const categoryRoutes = kitchenUserId
      ? await db('product_categories')
        .where({ shop_id: shopId })
        .select('name', 'printer_station', ...(hasRouteTargets ? ['route_targets'] : []))
      : [];
    const categoryRouteMap = new Map(categoryRoutes.map(category => {
      let targets = [];
      try {
        targets = Array.isArray(category.route_targets)
          ? category.route_targets
          : JSON.parse(category.route_targets || '[]');
      } catch (e) {
        targets = [];
      }
      targets = [...new Set((Array.isArray(targets) ? targets : []).map(String).map(value => value.trim()).filter(Boolean))];
      if (!targets.length && category.printer_station) targets.push(String(category.printer_station).trim());
      return [String(category.name || '').trim(), targets];
    }));
    const kitchenRouteKey = kitchenUserId ? `KITCHEN:${Number(kitchenUserId)}` : null;
    const visibleOrders = [];

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
          'p.category as product_category',
          db.raw('COALESCE(p.name, si.custom_name) as product_name')
        );

      let visibleItems = items;
      const routedKitchenIds = [...new Set(items.flatMap(item =>
        (categoryRouteMap.get(String(item.product_category || '').trim()) || [])
          .filter(route => route.startsWith('KITCHEN:'))
          .map(route => Number(route.replace('KITCHEN:', '')))
          .filter(Boolean)
      ))];
      const orderAlreadyFinished = ['ready', 'served', 'completed'].includes(order.order_status);
      const initialKitchenStatus = orderAlreadyFinished ? 'completed' : (order.order_status === 'preparing' ? 'preparing' : 'pending');
      for (const routedKitchenId of routedKitchenIds) {
        await db('kitchen_order_statuses').insert({ shop_id: shopId, sale_id: order.id, kitchen_id: routedKitchenId, status: initialKitchenStatus })
          .onConflict(['sale_id', 'kitchen_id']).ignore();
      }
      if (orderAlreadyFinished && routedKitchenIds.length) {
        await db('kitchen_order_statuses')
          .where({ shop_id: shopId, sale_id: order.id })
          .whereIn('kitchen_id', routedKitchenIds)
          .whereNot('status', 'completed')
          .update({ status: 'completed', updated_at: db.fn.now() });
      }
      if (kitchenUserId) {
        const hasCategoryKitchenRouting = items.some(item =>
          (categoryRouteMap.get(String(item.product_category || '').trim()) || [])
            .some(route => route.startsWith('KITCHEN:'))
        );

        if (hasCategoryKitchenRouting) {
          visibleItems = items.filter(item =>
            (categoryRouteMap.get(String(item.product_category || '').trim()) || []).includes(kitchenRouteKey)
          );
        } else if (Number(order.kitchen_id) !== Number(kitchenUserId)) {
          visibleItems = [];
        }
      }

      if (kitchenUserId && routedKitchenIds.includes(Number(kitchenUserId))) {
        const kitchenStatus = await db('kitchen_order_statuses').where({ sale_id: order.id, kitchen_id: kitchenUserId }).first();
        if (kitchenStatus && !['served', 'completed'].includes(order.order_status)) {
          order.order_status = kitchenStatus.status === 'completed' ? 'ready' : kitchenStatus.status;
        }
      }

      order.items = visibleItems.map(item => ({
        ...item,
        variants: typeof item.variants_json === 'string' ? JSON.parse(item.variants_json) : (item.variants_json || null),
        addons: typeof item.addons_json === 'string' ? JSON.parse(item.addons_json) : (item.addons_json || null)
      }));
      try {
        const changes = Array.isArray(order.kitchen_changes)
          ? order.kitchen_changes
          : JSON.parse(order.kitchen_changes || '[]');
        order.kitchen_changes = changes.filter(change => {
          if (!kitchenUserId) return true;
          const targets = categoryRouteMap.get(String(change.product_category || '').trim()) || [];
          const kitchenTargets = targets.filter(route => route.startsWith('KITCHEN:'));
          if (kitchenTargets.length) return kitchenTargets.includes(kitchenRouteKey);
          return Number(order.kitchen_id) === Number(kitchenUserId);
        });
      } catch (_) {
        order.kitchen_changes = [];
      }
      if (kitchenUserId && visibleItems.length === 0 && !(view === 'updated' && order.kitchen_changes.length)) continue;
      if (view === 'updated' && order.kitchen_changes.length === 0) continue;
      visibleOrders.push(order);
    }

    return visibleOrders;
  }

  async updateOrderStatus(saleId, status, shopId, userId = null) {
    await ensureKitchenWorkflowSchema();
    const allowedStatuses = new Set(['pending', 'preparing', 'ready', 'served', 'completed']);
    if (!allowedStatuses.has(status)) throw new Error('Invalid order status');

    const actor = userId ? await db('users').where({ id: userId, shop_id: shopId }).first() : null;
    const routedKitchenStatus = actor?.role === 'kitchen'
      ? await db('kitchen_order_statuses').where({ sale_id: saleId, kitchen_id: userId, shop_id: shopId }).first()
      : null;
    if (routedKitchenStatus && ['pending', 'preparing', 'ready'].includes(status)) {
      const portionStatus = status === 'ready' ? 'completed' : status;
      await db('kitchen_order_statuses').where({ id: routedKitchenStatus.id }).update({ status: portionStatus, updated_at: db.fn.now() });
      const portions = await db('kitchen_order_statuses').where({ sale_id: saleId, shop_id: shopId });
      if (status === 'preparing') {
        await db('sales').where({ id: saleId, shop_id: shopId }).where('order_status', 'pending').update({ order_status: 'preparing', preparing_at: db.fn.now() });
        return;
      }
      if (status !== 'ready' || portions.some(portion => portion.status !== 'completed')) return;
      // Every routed kitchen is ready; continue through the existing final-ready
      // path below so the order is promoted and its recipients are notified once.
    }

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
      await db('kitchen_order_statuses')
        .where({ sale_id: saleId, shop_id: shopId })
        .whereNot({ status: 'completed' })
        .update({ status: 'completed', updated_at: db.fn.now() });
      await cashDrawerService.queueForPaidCompletedSale(saleId, shopId);

      if (sale && sale.table_id) {
        const otherActiveOrder = await db('sales')
          .where({ shop_id: shopId, table_id: sale.table_id, order_type: 'dine_in' })
          .whereNot({ id: saleId })
          .whereIn('order_status', ['pending', 'preparing', 'ready', 'served', 'payment_pending'])
          .first();
        await db('tables')
          .where({ id: sale.table_id, shop_id: shopId })
          .update({ status: otherActiveOrder ? 'occupied' : 'available' });
      }
      return;
    }

    const sale = status === 'ready'
      ? await db('sales').where({ id: saleId, shop_id: shopId }).first()
      : null;
    const updateData = { order_status: status };
    if (status === 'preparing') updateData.preparing_at = db.fn.now();
    if (status === 'ready') updateData.kitchen_completed_at = db.fn.now();
    const statusUpdateQuery = db('sales').where({ id: saleId, shop_id: shopId });
    if (status === 'ready') statusUpdateQuery.whereNotIn('order_status', ['ready', 'served', 'completed']);
    const promotedCount = await statusUpdateQuery.update(updateData);

    if (status === 'ready' && sale && promotedCount > 0) {
      // Notification persistence and device delivery must never delay the KDS
      // status response. The atomic promotion above ensures this runs once even
      // when two kitchens finish at nearly the same time.
      setImmediate(() => this.notifyOrderReady(sale, saleId, shopId, userId)
        .catch(error => console.error(`Order #${saleId} ready notification failed:`, error.message)));
    }
  }
}

module.exports = new InfrastructureService();
