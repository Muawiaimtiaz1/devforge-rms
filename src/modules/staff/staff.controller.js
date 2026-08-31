const service = require('./staff.service');

async function list(req, res) {
  res.json(await service.listStaff(req.session.user, req.query));
}

async function get(req, res) {
  res.json(await service.getStaff(req.session.user, req.params.id));
}

async function accounts(req, res) {
  res.json(await service.listAvailableAccounts(req.session.user, req.query.profile_id));
}

async function create(req, res) {
  res.status(201).json(await service.createStaff(req.session.user, req.body));
}

async function update(req, res) {
  res.json(await service.updateStaff(req.session.user, req.params.id, req.body));
}

module.exports = { list, accounts, get, create, update };
