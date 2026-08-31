const service = require('./staff-access.service');

async function get(req, res) {
  res.json(await service.loadAccess(req.session.user, req.params.id));
}
async function create(req, res) {
  res.status(201).json(await service.createOrLinkAccount(req.session.user, req.permissions || [], req.params.id, req.body));
}
async function update(req, res) {
  res.json(await service.updateAccess(req.session.user, req.permissions || [], req.params.id, req.body));
}
async function resetPassword(req, res) {
  res.json(await service.resetPassword(req.session.user, req.params.id));
}

module.exports = { get, create, update, resetPassword };
