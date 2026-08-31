const express = require('express');
const authService = require('../services/AuthService');
const db = require('../db/knex');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');
const router = express.Router();
const sessionSecurity = require('../src/modules/session-security/session-security.service');
const SESSION_COOKIE_NAME = 'rms.sid';
const secureCookie = String(process.env.SESSION_COOKIE_SECURE || (process.env.NODE_ENV === 'production' ? 'true' : 'false')).toLowerCase() === 'true';

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await authService.login(username, password);
        await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
        req.session.user = user;
        await new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
        await sessionSecurity.registerLogin(req, user);
        res.json({ ok: true, user });
    } catch (error) {
        await sessionSecurity.recordLoginFailure(req, username).catch(() => {});
        throw error;
    }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
    await sessionSecurity.recordLogout(req);
    await new Promise((resolve, reject) => req.session.destroy((error) => error ? reject(error) : resolve()));
    res.clearCookie(SESSION_COOKIE_NAME, { httpOnly: true, secure: secureCookie, sameSite: 'lax', path: '/' });
    res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
    
    const freshUser = await authService.getProfile(req.session.user.id);
    if (!freshUser) return res.status(401).json({ error: 'User no longer exists' });

    // Sync session
    req.session.user = {
        ...req.session.user,
        allowed_panels: freshUser.allowed_panels,
        shop_name: freshUser.shop_name,
        shop_type: freshUser.shop_type,
        shop_status: freshUser.shop_status,
        shop_created_at: freshUser.shop_created_at,
        shop_phone: freshUser.shop_phone,
        shop_address: freshUser.shop_address,
        subscription: freshUser.subscription,
        name: freshUser.name,
        role: freshUser.role,
        can_manage_register: freshUser.can_manage_register,
        permissions: freshUser.permissions,
        roles: freshUser.roles,
        must_change_password: Boolean(freshUser.must_change_password)
    };

    // Statistical counts for dashboard
    const counts = { total_users: 0, total_brands: 0 };
    const shopId = req.session.user.shop_id;

    const userCount = await db('users')
        .modify(qb => shopId ? qb.where({ shop_id: shopId }) : qb)
        .count('* as c').first();
    counts.total_users = parseInt(userCount.c);

    const brandCount = await db('brands')
        .modify(qb => shopId ? qb.where({ shop_id: shopId }) : qb)
        .count('* as c').first();
    counts.total_brands = parseInt(brandCount.c);

    res.json({ user: req.session.user, ...counts });
});

// POST /api/auth/forgot-password
router.post('/forgot-password', requireSuperAdmin, async (req, res) => {
    const tempPassword = await authService.resetPassword(req.body.username);
    res.json({ ok: true, tempPassword, message: 'Password reset successful.' });
});

router.post('/change-password', requireAuth, async (req, res) => {
    await authService.changePassword(req.session.user.id, req.body.current_password, req.body.new_password);
    await sessionSecurity.revokeOtherSessions(req.session.user.id, req.sessionID);
    req.session.user.must_change_password = false;
    res.json({ ok: true });
});

module.exports = router;
