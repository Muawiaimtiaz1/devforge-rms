const express = require('express');
const userService = require('../services/UserService');
const db = require('../db/knex');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../authorization/middleware');
const router = express.Router();

// GET /api/users/assignable — minimal same-shop users for order assignment
router.get('/assignable', requireAuth, async (req, res) => {
    const shopId = req.session.user.shop_id;
    if (!shopId) return res.json([]);

    const users = await db('users')
        .select('id', 'name', 'role', 'phone')
        .where({ shop_id: shopId })
        .whereNot('role', 'superadmin')
        .where(function () {
            this.whereNull('status').orWhere('status', 'active');
        })
        .orderBy('name', 'asc');

    res.json(users);
});

// GET /api/users
router.get('/', requirePermission('users.view'), async (req, res) => {
    const users = await userService.listUsers(req.session.user);
    res.json(users);
});

// POST /api/users
router.post('/', requirePermission('users.create'), async (req, res) => {
    const id = await userService.createUser(req.body, req.session.user);
    res.json({ ok: true, id });
});

// PUT /api/users/:id
router.put('/:id', requirePermission('users.update', 'users.assign_roles'), async (req, res) => {
    await userService.updateUser(req.params.id, req.body, req.session.user, req.permissions);
    res.json({ ok: true });
});

// DELETE /api/users/:id
router.delete('/:id', requirePermission('users.delete'), async (req, res) => {
    await userService.deleteUser(req.params.id, req.session.user);
    res.json({ ok: true });
});

module.exports = router;
