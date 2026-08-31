const service = require('./leave.service');
async function types(req, res) { res.json(await service.listTypes(req.session.user)); }
async function staffOptions(req, res) { res.json(await service.listStaffOptions(req.session.user)); }
async function createType(req, res) { res.status(201).json(await service.createType(req.session.user, req.body)); }
async function allocate(req, res) { res.status(201).json(await service.allocateBalance(req.session.user, req.body)); }
async function balances(req, res) { res.json(await service.listBalances(req.session.user, req.query.staff_profile_id)); }
async function requests(req, res) { res.json(await service.listRequests(req.session.user, req.query)); }
async function createRequest(req, res) { res.status(201).json(await service.createRequest(req.session.user, req.body)); }
async function decide(req, res) { res.json(await service.decide(req.session.user, req.params.id, req.body)); }
async function cancel(req, res) { res.json(await service.cancel(req.session.user, req.params.id)); }
module.exports = { types, staffOptions, createType, allocate, balances, requests, createRequest, decide, cancel };
