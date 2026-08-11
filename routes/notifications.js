const express = require('express');
const notificationService = require('../services/NotificationService');
const activityLogService = require('../services/ActivityLogService');
const pushNotificationService = require('../services/PushNotificationService');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/push/public-key', requireAuth, async (req, res) => {
  await pushNotificationService.ensureSchema();
  res.json({ publicKey: pushNotificationService.publicKey });
});

router.get('/push/status', requireAuth, async (req, res) => {
  await pushNotificationService.ensureSchema();
  const devices = await pushNotificationService.listDevices(req.session.user.id);
  const currentDevice = await pushNotificationService.hasDeviceEndpoint(req.session.user.id, req.query.endpoint);
  res.json({ enabled: devices.length > 0, current_device: currentDevice, devices });
});

router.post('/push/subscribe', requireAuth, async (req, res) => {
  await pushNotificationService.ensureSchema();
  await pushNotificationService.subscribe(req.session.user, req.body.subscription, req.body.device_name);
  res.json({ ok: true });
});

router.delete('/push/unsubscribe', requireAuth, async (req, res) => {
  await pushNotificationService.unsubscribe(req.session.user.id, req.body.endpoint);
  res.json({ ok: true });
});

router.post('/push/test', requireAuth, async (req, res) => {
  const delivery = await pushNotificationService.sendToUser(req.session.user.id, {
    title: 'RMS test notification',
    body: `Notifications are working for ${req.session.user.username || req.session.user.name}.`,
    tag: `rms-test-${Date.now()}`,
    url: '/dashboard',
  });
  if (!delivery.attempted) return res.status(409).json({ error: 'This user has no registered notification device.' });
  if (!delivery.delivered) return res.status(502).json({ error: 'Push providers rejected every registered device.', delivery });
  res.json({ ok: true, devices: delivery.delivered, delivery });
});

router.get('/', requireAuth, async (req, res) => {
  const notifications = await notificationService.list(req.session.user, req.query);
  res.json(notifications);
});

router.get('/unread-count', requireAuth, async (req, res) => {
  const count = await notificationService.unreadCount(req.session.user, req.query);
  res.json({ count });
});

router.post('/', requireSuperAdmin, async (req, res) => {
  const id = await notificationService.create(req.body, req.session.user);
  if (req.body.shop_id) {
    await activityLogService.log(
      req.body.shop_id,
      req.session.user.id,
      'NOTIFICATION_CREATED',
      { title: req.body.title, type: req.body.type || 'announcement' },
      id,
      'notification'
    );
  }
  res.json({ ok: true, id });
});

router.patch('/read-all', requireAuth, async (req, res) => {
  const count = await notificationService.markAllRead(req.session.user, { channel: req.body?.channel });
  res.json({ ok: true, count });
});

router.patch('/:id/read', requireAuth, async (req, res) => {
  await notificationService.markRead(req.session.user, req.params.id);
  res.json({ ok: true });
});

router.patch('/:id', requireSuperAdmin, async (req, res) => {
  await notificationService.update(req.params.id, req.body);
  res.json({ ok: true });
});

router.delete('/:id', requireSuperAdmin, async (req, res) => {
  await notificationService.update(req.params.id, { status: 'archived' });
  res.json({ ok: true });
});

module.exports = router;
