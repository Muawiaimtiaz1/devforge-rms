const express = require('express');
const { requireAuth } = require('../../../middleware/auth');
const service = require('./session-security.service');

const router = express.Router();
router.use(requireAuth);

router.get('/sessions', async (req, res) => {
  res.json(await service.listSessions(req.session.user.id, req.sessionID));
});

router.delete('/sessions/others', async (req, res) => {
  const count = await service.revokeOtherSessions(req.session.user.id, req.sessionID);
  res.json({ ok: true, revoked: count });
});

router.delete('/sessions/:deviceId', async (req, res) => {
  const result = await service.revokeDevice(req.session.user.id, req.params.deviceId, req.sessionID);
  if (result.revokedCurrent) {
    await new Promise((resolve, reject) => req.session.destroy((error) => error ? reject(error) : resolve()));
  }
  res.json({ ok: true, logged_out: result.revokedCurrent });
});

router.get('/security-events', async (req, res) => {
  res.json(await service.listSecurityEvents(req.session.user.id, req.query.limit));
});

module.exports = router;
