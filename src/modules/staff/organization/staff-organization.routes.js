const express = require('express');
const { requirePermission } = require('../../../../authorization/middleware');
const controller = require('./staff-organization.controller');

const router = express.Router();
router.get('/organization/options', requirePermission('staff.view'), controller.options);
router.get('/organization/hierarchy', requirePermission('staff.view'), controller.hierarchy);
router.post('/organization/catalog', requirePermission('staff.manage_organization'), controller.createCatalog);
router.patch('/organization/catalog/:kind/:catalogId', requirePermission('staff.manage_organization'), controller.updateCatalog);
router.get('/:id/assignment', requirePermission('staff.view'), controller.assignment);
router.put('/:id/assignment', requirePermission('staff.manage_organization'), controller.updateAssignment);
router.post('/:id/transfer', requirePermission('platform_shops.update'), controller.transfer);

module.exports = router;
