const db = require('../db/knex');
let kitchenSchemaReady;

async function ensureKitchenWorkflowSchema() {
  if (kitchenSchemaReady) return kitchenSchemaReady;
  kitchenSchemaReady = (async () => {
    if (!(await db.schema.hasColumn('sales', 'preparing_at'))) {
      await db.schema.alterTable('sales', table => table.timestamp('preparing_at').nullable());
    }
    if (!(await db.schema.hasColumn('sales', 'kitchen_completed_at'))) {
      await db.schema.alterTable('sales', table => table.timestamp('kitchen_completed_at').nullable());
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
  async listTables(shopId) {
    return db('tables').where({ shop_id: shopId }).orderBy('id', 'asc');
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
        's.guest_count', 's.created_at', 's.updated_at', 's.preparing_at', 's.kitchen_completed_at', 's.special_instructions as order_notes',
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

    const updateData = { order_status: status };
    if (status === 'preparing') updateData.preparing_at = db.fn.now();
    if (status === 'ready') updateData.kitchen_completed_at = db.fn.now();
    await db('sales')
      .where({ id: saleId, shop_id: shopId })
      .update(updateData);
  }
}

module.exports = new InfrastructureService();
