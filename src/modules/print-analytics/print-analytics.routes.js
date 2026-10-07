const express = require('express');
const { requireSuperAdmin } = require('../../../middleware/auth');
const controller = require('./print-analytics.controller');
const router = express.Router();
router.use(requireSuperAdmin);
router.get('/shops', controller.shops);
router.get('/shops/:shopId', controller.detail);
module.exports = router;
