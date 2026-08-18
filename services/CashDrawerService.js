const db = require('../db/knex');

class CashDrawerService {
  async queueForPaidCompletedSale(saleId, shopId, trx = null) {
    const dbInstance = trx || db;
    const sale = await dbInstance('sales').where({ id: saleId, shop_id: shopId }).first();
    if (!sale) return { queued: 0, reason: 'sale_not_found' };

    const isFullyPaid = Number(sale.amount_received || 0) >= Number(sale.total || 0) - 0.01;
    if (sale.order_status !== 'completed' || !isFullyPaid || sale.payment_method !== 'cash') {
      return { queued: 0, reason: 'not_completed_paid_cash' };
    }

    const shop = await dbInstance('shops').where({ id: shopId }).select('customer_bill_printer').first();
    const route = String(shop?.customer_bill_printer || '').trim();
    if (!route) return { queued: 0, reason: 'printer_not_configured' };

    const printer = route.startsWith('PRINTER:')
      ? await dbInstance('printers').where({ shop_id: shopId, id: Number(route.slice(8)) }).first()
      : await dbInstance('printers').where({ shop_id: shopId, system_name: route }).first();
    if (!printer) return { queued: 0, reason: 'printer_not_found' };

    const drawerEventKey = `sale-paid-${sale.id}`;
    const existing = await dbInstance('print_queue')
      .where({ shop_id: shopId })
      .andWhere('content_json', 'like', `%"drawer_event_key":"${drawerEventKey}"%`)
      .first('id');
    if (existing) return { queued: 0, reason: 'already_queued' };

    await dbInstance('print_queue').insert({
      shop_id: shopId,
      station_name: printer.system_name,
      content_json: JSON.stringify({
        type: 'CASH_DRAWER',
        sale_id: sale.id,
        order_number: sale.order_number || sale.id,
        drawer_event_key: drawerEventKey,
        station_name: printer.system_name,
        printer_label: printer.display_name,
      }),
      status: 'pending',
    });
    return { queued: 1 };
  }
}

module.exports = new CashDrawerService();
