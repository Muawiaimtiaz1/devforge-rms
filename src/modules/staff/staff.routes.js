const express = require('express');
const { requirePermission } = require('../../../authorization/middleware');
const { usePostgres } = require('../../../db/runtime');
const controller = require('./staff.controller');
const accessController = require('./access/staff-access.controller');
const organizationRoutes = require('./organization/staff-organization.routes');

const router = express.Router();

router.use((req, res, next) => {
  if (!usePostgres()) return res.status(503).json({ error: 'Staff Management is available in PostgreSQL mode only.' });
  return next();
});

router.get('/', requirePermission('users.view'), controller.list);
router.use('/', organizationRoutes);
router.get('/options/accounts', requirePermission('users.view'), controller.accounts);
router.get('/:id/access', requirePermission('users.view'), accessController.get);
router.post('/:id/access', requirePermission('users.create', 'users.update'), accessController.create);
router.patch('/:id/access', requirePermission('users.update', 'users.assign_roles'), accessController.update);
router.post('/:id/access/reset-password', requirePermission('users.update'), accessController.resetPassword);
router.get('/:id', requirePermission('users.view'), controller.get);
router.post('/', requirePermission('users.create'), controller.create);
router.put('/:id', requirePermission('users.update'), controller.update);

module.exports = router;
