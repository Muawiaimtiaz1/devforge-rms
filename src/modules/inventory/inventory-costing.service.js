const { MIN_ACTIVE_QUANTITY, quantity: normalizeQuantity, positiveQuantity, subtractQuantity, addQuantity } = require('./inventory-quantity');

const EPSILON = MIN_ACTIVE_QUANTITY / 2;
const money = (value) => Number(Number(value || 0).toFixed(2));

function planFifoAllocations(batches, requestedQuantity) {
  let remaining = positiveQuantity(requestedQuantity, 'FIFO quantity must be greater than zero.');
  const allocations = [];
  for (const batch of batches) {
    if (remaining <= EPSILON) break;
    const batchQuantity = normalizeQuantity(batch.quantity);
    const take = normalizeQuantity(Math.min(remaining, batchQuantity));
    if (take <= EPSILON) continue;
    const unitCost = Number(batch.buying_price || 0);
    allocations.push({ batchId: batch.id, quantity: take, unitCost, totalCost: money(take * unitCost) });
    remaining = subtractQuantity(remaining, take);
  }
  return { allocations, remaining };
}

class InventoryCostingService {
  async consumeRawFifo(trx, { shopId, saleId, saleItemId, rawStockId, quantity }) {
    const requested = positiveQuantity(quantity, 'FIFO quantity must be greater than zero.');
    if (!Number.isInteger(Number(shopId)) || Number(shopId) <= 0) throw new Error('Shop is required for FIFO consumption.');
    if (!Number.isInteger(Number(rawStockId)) || Number(rawStockId) <= 0) throw new Error('Ingredient is required for FIFO consumption.');

    const raw = await trx('raw_stocks').where({ id: rawStockId, shop_id: shopId, is_deleted: 0 }).forUpdate().first();
    if (!raw) throw new Error('Raw ingredient not found.');
    if (Number(raw.current_stock) + EPSILON < requested) throw new Error(`Not enough stock of ${raw.name}.`);

    const batches = await trx('raw_stock_batches')
      .where({ raw_stock_id: rawStockId, shop_id: shopId })
      .andWhere('quantity', '>', 0)
      .orderBy([{ column: 'created_at', order: 'asc' }, { column: 'id', order: 'asc' }])
      .forUpdate();

    const { allocations, remaining } = planFifoAllocations(batches, requested);
    if (remaining > EPSILON) throw new Error(`Batch stock for ${raw.name} does not match its inventory total. Reconcile stock before selling.`);

    for (const allocation of allocations) {
      await trx('raw_stock_batches')
        .where({ id: allocation.batchId, raw_stock_id: rawStockId, shop_id: shopId })
        .update({ quantity: subtractQuantity(batches.find((batch) => Number(batch.id) === Number(allocation.batchId)).quantity, allocation.quantity) });
    }
    await trx('raw_stocks').where({ id: rawStockId, shop_id: shopId }).update({ current_stock: subtractQuantity(raw.current_stock, requested) });

    if (saleId && saleItemId) {
      await trx('sale_inventory_consumptions').insert(allocations.map((allocation) => ({
        shop_id: shopId,
        sale_id: saleId,
        sale_item_id: saleItemId,
        raw_stock_id: rawStockId,
        raw_stock_batch_id: allocation.batchId,
        quantity: allocation.quantity,
        unit_cost: allocation.unitCost,
        total_cost: allocation.totalCost
      })));
    }
    return { totalCost: money(allocations.reduce((sum, allocation) => sum + allocation.totalCost, 0)), allocations };
  }

  async restoreSaleItem(trx, { shopId, saleItemId }) {
    const allocations = await trx('sale_inventory_consumptions')
      .where({ shop_id: shopId, sale_item_id: saleItemId })
      .orderBy('id', 'asc')
      .forUpdate();
    if (!allocations.length) return false;

    for (const allocation of allocations) {
      if (!allocation.raw_stock_id || !allocation.raw_stock_batch_id) throw new Error('An original FIFO batch is unavailable; this order cannot be safely edited.');
      const restored = await trx('raw_stock_batches')
        .where({ id: allocation.raw_stock_batch_id, raw_stock_id: allocation.raw_stock_id, shop_id: shopId })
        .forUpdate()
        .first();
      if (!restored) throw new Error('An original FIFO batch is unavailable; this order cannot be safely edited.');
      const restoredBatchQuantity = addQuantity(restored.quantity, allocation.quantity);
      await trx('raw_stock_batches')
        .where({ id: allocation.raw_stock_batch_id, raw_stock_id: allocation.raw_stock_id, shop_id: shopId })
        .update({ quantity: restoredBatchQuantity });
      const raw = await trx('raw_stocks').where({ id: allocation.raw_stock_id, shop_id: shopId }).forUpdate().first();
      if (!raw) throw new Error('Raw ingredient not found while restoring inventory.');
      await trx('raw_stocks').where({ id: allocation.raw_stock_id, shop_id: shopId }).update({ current_stock: addQuantity(raw.current_stock, allocation.quantity) });
    }
    return true;
  }
}

const inventoryCostingService = new InventoryCostingService();
module.exports = inventoryCostingService;
module.exports.planFifoAllocations = planFifoAllocations;
