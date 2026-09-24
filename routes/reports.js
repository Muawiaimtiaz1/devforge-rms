const express = require('express');
const analyticsService = require('../services/AnalyticsService');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
router.get('/summary', requireAuth, async (req, res) => {
  const user = req.session.user;
  const shopId = user.role === 'superadmin' && req.query.shop_id ? Number.parseInt(req.query.shop_id, 10) : user.shop_id;
  if (!shopId) return res.status(400).json({ error: 'Shop ID required' });
  res.json(await analyticsService.getDashboardData(shopId, req.query.period, req.query.from, req.query.to, req.query.brand_id));
});
module.exports = router;
