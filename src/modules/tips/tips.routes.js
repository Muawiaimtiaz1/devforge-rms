const express = require('express');
const { requireAuth } = require('../../../middleware/auth');
const activityLogService = require('../../../services/ActivityLogService');
const publishOrderChange = require('../../../utils/publish-order-change');
const tipsService = require('./tips.service');

const router = express.Router();

router.get('/options', requireAuth, async (req, res) => {
  const result = await tipsService.listEligibleOrders(req.session.user.shop_id, req.session.user, {
    search: req.query.search,
    tableId: req.query.table_id,
    period: req.query.period,
    from: req.query.from,
    to: req.query.to
  });
  res.json(result);
});

router.post('/:saleId', requireAuth, async (req, res) => {
  const result = await tipsService.recordStandalone({
    saleId: Number(req.params.saleId),
    shopId: req.session.user.shop_id,
    user: req.session.user,
    amount: req.body.amount,
    paymentMethod: req.body.payment_method
  });
  await activityLogService.log(req.session.user.shop_id, req.session.user.id, 'TIP_COLLECTED', result, result.sale_id, 'sale');
  void publishOrderChange('order.tip_collected', result.sale_id, req.session.user.shop_id);
  res.json({ ok: true, ...result });
});

module.exports = router;
