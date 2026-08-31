const service = require('./staff-organization.service');

async function options(req, res) { res.json(await service.getOptions(req.session.user)); }
async function hierarchy(req, res) { res.json(await service.getHierarchy(req.session.user)); }
async function assignment(req, res) { res.json(await service.getAssignment(req.session.user, req.params.id)); }
async function createCatalog(req, res) { res.status(201).json(await service.createCatalogItem(req.session.user, req.body)); }
async function updateCatalog(req, res) { res.json(await service.updateCatalogItem(req.session.user, req.params.kind, req.params.catalogId, req.body)); }
async function updateAssignment(req, res) { res.json(await service.updateAssignment(req.session.user, req.params.id, req.body)); }
async function transfer(req, res) { res.json(await service.transferStaff(req.session.user, req.params.id, req.body)); }

module.exports = { options, hierarchy, assignment, createCatalog, updateCatalog, updateAssignment, transfer };
