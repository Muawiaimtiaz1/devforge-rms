const express = require('express');
const db = require('../db/knex');
const { requirePanel } = require('../middleware/auth');

const router = express.Router();
const requireDelivery = requirePanel('delivery');
const DELIVERY_STATUSES = new Set(['pending', 'preparing', 'ready', 'completed']);
const PAYMENT_METHODS = new Set(['cash', 'card', 'online']);

async function getAcceptingShift(shopId, userId) {
  const shift = await db('shifts')
    .where({ shop_id: shopId, user_id: userId, status: 'open' })
    .first();
  if (!shift) {
    const error = new Error('Open your register before accepting a delivery payment.');
    error.status = 400;
    throw error;
  }
  return shift;
}

function deliveryPaymentMethod(value, fallback = 'cash') {
  const method = String(value || fallback).trim().toLowerCase();
  if (!PAYMENT_METHODS.has(method)) {
    const error = new Error('Invalid payment method.');
    error.status = 400;
    throw error;
  }
  return method;
}

router.get('/', requireDelivery, async (req, res) => {
  const shopId = req.session.user.shop_id;
  const rows = await db('sales as s')
    .select(
      's.*',
      'creator.name as served_by_name',
      'receiver.name as payment_receiver_name',
      'rider.name as rider_name',
      'kitchen.name as kitchen_name'
    )
    .leftJoin('users as creator', 's.user_id', 'creator.id')
    .leftJoin('users as receiver', 's.payment_receiver_id', 'receiver.id')
    .leftJoin('users as rider', 's.rider_id', 'rider.id')
    .leftJoin('users as kitchen', 's.kitchen_id', 'kitchen.id')
    .where({ 's.shop_id': shopId, 's.order_type': 'delivery' })
    .orderBy('s.created_at', 'desc')
    .limit(200);
  res.json(rows);
});

router.patch('/:id/status', requireDelivery, async (req, res) => {
  const shopId = req.session.user.shop_id;
  const userId = req.session.user.id;
  const status = String(req.body.status || '').trim();
  if (!DELIVERY_STATUSES.has(status)) return res.status(400).json({ error: 'Invalid delivery status.' });

  const sale = await db('sales').where({ id: req.params.id, shop_id: shopId, order_type: 'delivery' }).first();
  if (!sale) return res.status(404).json({ error: 'Delivery order not found.' });

  const update = { order_status: status, updated_at: db.fn.now() };
  if (status === 'completed' && Object.prototype.hasOwnProperty.call(req.body, 'money_received')) {
    const received = req.body.money_received === true;
    const alreadyAttributed = Number(sale.amount_received || 0) > 0.01 && sale.payment_receiver_id;
    update.amount_received = received ? Number(sale.total || 0) : 0;
    if (received && !alreadyAttributed) {
      const activeShift = await getAcceptingShift(shopId, userId);
      update.shift_id = activeShift.id;
      update.payment_receiver_id = userId;
      update.payment_received_at = db.fn.now();
      update.payment_method = deliveryPaymentMethod(req.body.payment_method, sale.payment_method);
    } else if (!received) {
      update.payment_receiver_id = null;
      update.payment_received_at = null;
    }
  }

  await db('sales').where({ id: sale.id, shop_id: shopId }).update(update);
  res.json({ success: true, status, money_received: Number(update.amount_received ?? sale.amount_received) > 0.01 });
});

router.patch('/:id/payment', requireDelivery, async (req, res) => {
  const shopId = req.session.user.shop_id;
  const userId = req.session.user.id;
  const sale = await db('sales').where({ id: req.params.id, shop_id: shopId, order_type: 'delivery' }).first();
  if (!sale) return res.status(404).json({ error: 'Delivery order not found.' });

  const received = req.body.money_received === true;
  const alreadyAttributed = Number(sale.amount_received || 0) > 0.01 && sale.payment_receiver_id;
  const update = {
    amount_received: received ? Number(sale.total || 0) : 0,
    updated_at: db.fn.now()
  };
  if (received && !alreadyAttributed) {
    const activeShift = await getAcceptingShift(shopId, userId);
    update.shift_id = activeShift.id;
    update.payment_method = deliveryPaymentMethod(req.body.payment_method, sale.payment_method);
    update.payment_receiver_id = userId;
    update.payment_received_at = db.fn.now();
  } else if (!received) {
    update.payment_receiver_id = null;
    update.payment_received_at = null;
  }
  await db('sales').where({ id: sale.id, shop_id: shopId }).update(update);
  res.json({ success: true, money_received: received });
});

module.exports = router;
