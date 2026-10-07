const db = require('../../../db/knex');
const { usePostgres } = require('../../../db/runtime');

function windowStart(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - (days - 1));
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function databaseTimestamp(date) {
  const iso = date.toISOString();
  return usePostgres() ? iso : iso.replace('T', ' ').replace('Z', '');
}

async function listShops(days) {
  const shops = await db('shops as s')
    .leftJoin('printers as p', 'p.shop_id', 's.id')
    .groupBy('s.id', 's.name', 's.status', 's.realtime_printing_enabled')
    .orderBy('s.name', 'asc')
    .select('s.id', 's.name', 's.status', 's.realtime_printing_enabled')
    .countDistinct({ printer_count: 'p.id' });
  const counts = await db('print_queue')
    .where('created_at', '>=', databaseTimestamp(windowStart(days)))
    .groupBy('shop_id', 'status').select('shop_id', 'status').count({ count: '*' });
  const byShop = new Map();
  counts.forEach((row) => {
    const current = byShop.get(Number(row.shop_id)) || {};
    current[row.status || 'unknown'] = Number(row.count || 0);
    byShop.set(Number(row.shop_id), current);
  });
  return shops.map((shop) => ({
    ...shop,
    printer_count: Number(shop.printer_count || 0),
    counts: byShop.get(Number(shop.id)) || {},
  }));
}

const findShop = (shopId) => db('shops').where({ id: shopId })
  .first('id', 'name', 'status', 'realtime_printing_enabled');
const shopPrinters = (shopId) => db('printers').where({ shop_id: shopId })
  .orderBy('display_name').select('id', 'display_name', 'system_name');
const shopJobs = (shopId, days) => db('print_queue').where({ shop_id: shopId })
  .where('created_at', '>=', databaseTimestamp(windowStart(days)))
  .orderBy('created_at', 'asc')
  .select('id', 'station_name', 'status', 'attempts', 'claimed_at', 'printed_at', 'last_error', 'created_at', 'updated_at');

module.exports = { listShops, findShop, shopPrinters, shopJobs, windowStart };
