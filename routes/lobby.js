const express = require('express');
const { requireAuth } = require('../middleware/auth');
const lobbyService = require('../services/LobbyService');
const authService = require('../services/AuthService');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const freshUser = await authService.getProfile(req.session.user.id);
  if (!freshUser) return res.status(401).json({ error: 'User no longer exists' });
  req.session.user = { ...req.session.user, ...freshUser };
  res.json(await lobbyService.getLobby(req.session.user, freshUser.permissions));
});

module.exports = router;
