const express = require('express');
const { requirePermission } = require('../../../../authorization/middleware');
const controller = require('./staff-organization.controller');

const router = express.Router();
router.get('/organization/options', requirePermission('users.view'), controller.options);
router.get('/organization/hierarchy', requirePermission('users.view'), controller.hierarchy);
router.post('/organization/catalog', requirePermission('users.update'), controller.createCatalog);
router.patch('/organization/catalog/:kind/:catalogId', requirePermission('users.update'), controller.updateCatalog);
router.get('/:id/assignment', requirePermission('users.view'), controller.assignment);
router.put('/:id/assignment', requirePermission('users.update'), controller.updateAssignment);
router.post('/:id/transfer', requirePermission('platform_shops.update'), controller.transfer);

module.exports = router;
