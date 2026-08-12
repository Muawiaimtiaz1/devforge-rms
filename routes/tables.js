const express = require("express");
const infraService = require("../services/InfrastructureService");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();

function requireTableManager(req, res, next) {
  if (!['admin', 'superadmin', 'manager'].includes(String(req.session?.user?.role || '').toLowerCase())) {
    return res.status(403).json({ error: 'Only managers can configure table assignments.' });
  }
  next();
}

// GET /api/tables/floors
router.get("/floors", requireAuth, async (req, res) => {
  const shopId = req.session.user.shop_id;
  const floors = await infraService.listFloors(shopId);
  res.json(floors);
});

// POST /api/tables/floors
router.post("/floors", requireAuth, async (req, res) => {
  const shopId = req.session.user.shop_id;
  const id = await infraService.createFloor(req.body.name, shopId);
  res.json({ id, shop_id: shopId, name: req.body.name });
});

// DELETE /api/tables/floors/:id
router.delete("/floors/:id", requireAuth, async (req, res) => {
  const shopId = req.session.user.shop_id;
  await infraService.deleteFloor(req.params.id, shopId);
  res.json({ success: true });
});

// GET /api/tables
router.get("/", requireAuth, async (req, res) => {
  const shopId = req.session.user.shop_id;
  const tables = await infraService.listTables(shopId, req.session.user);
  res.json(tables);
});

router.get("/access-config", requireAuth, requireTableManager, async (req, res) => {
  res.json(await infraService.getTableAccessConfig(req.session.user.shop_id));
});

router.patch("/access-config", requireAuth, requireTableManager, async (req, res) => {
  await infraService.setTableVisibilityMode(req.session.user.shop_id, req.body.mode);
  res.json({ success: true, mode: req.body.mode });
});

router.patch("/:id/assignment", requireAuth, requireTableManager, async (req, res) => {
  const waiterId = req.body.waiter_id === null || req.body.waiter_id === '' ? null : Number(req.body.waiter_id);
  if (waiterId !== null && !Number.isInteger(waiterId)) return res.status(400).json({ error: 'Invalid waiter / order taker' });
  await infraService.assignTable(req.params.id, waiterId, req.session.user.shop_id);
  res.json({ success: true, waiter_id: waiterId });
});

// POST /api/tables
router.post("/", requireAuth, async (req, res) => {
  const shopId = req.session.user.shop_id;
  const id = await infraService.createTable(req.body, shopId);
  res.json({ id, shop_id: shopId, ...req.body, status: 'available' });
});

// PATCH /api/tables/:id/status
router.patch("/:id/status", requireAuth, async (req, res) => {
  const shopId = req.session.user.shop_id;
  await infraService.updateTableStatus(req.params.id, req.body.status, shopId);
  res.json({ success: true, status: req.body.status });
});

module.exports = router;
