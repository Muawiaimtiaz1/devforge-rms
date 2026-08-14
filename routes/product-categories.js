const express = require('express');
const { getSqlite, getPostgres, usePostgres } = require('../db/runtime');
const db = require('../db/knex');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
let routeTargetsSchemaReady;

async function ensureRouteTargetsSchema() {
    if (!routeTargetsSchemaReady) {
        routeTargetsSchemaReady = (async () => {
            if (!(await db.schema.hasColumn('product_categories', 'route_targets'))) {
                await db.schema.alterTable('product_categories', table => table.text('route_targets').nullable());
            }
        })().catch(error => { routeTargetsSchemaReady = null; throw error; });
    }
    return routeTargetsSchemaReady;
}

function normalizeRouteTargets(value, legacyRoute = null) {
    const values = Array.isArray(value) ? value : [];
    const targets = [...new Set(values
        .map(target => String(target || '').trim())
        .filter(target => /^(PRINTER|KITCHEN):\d+$/.test(target)))];
    if (!targets.length && legacyRoute) targets.push(String(legacyRoute).trim());
    return targets;
}

// GET /api/product-categories
router.get('/', requireAuth, async (req, res) => {
    const shopId = req.session.user.shop_id;
    const isPostgres = usePostgres();
    try {
        const query = isPostgres ? 'SELECT * FROM product_categories WHERE shop_id = $1 ORDER BY id ASC' : 'SELECT * FROM product_categories WHERE shop_id = ? ORDER BY id ASC';
        let categories;
        if (isPostgres) categories = (await getPostgres().query(query, [shopId])).rows;
        else categories = getSqlite().prepare(query).all(shopId);
        res.json(categories);
    } catch (err) {
        console.error("Fetch categories error:", err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/product-categories
router.post('/', requireAuth, async (req, res) => {
    const { name, printer_station, route_targets } = req.body;
    const shopId = req.session.user.shop_id;
    if (!name) return res.status(400).json({ error: 'name is required' });

    try {
        await ensureRouteTargetsSchema();
        const isPostgres = usePostgres();
        if (isPostgres) {
            const targets = normalizeRouteTargets(route_targets, printer_station);
            const query = 'INSERT INTO product_categories (shop_id, name, printer_station, route_targets) VALUES ($1, $2, $3, $4) RETURNING id';
            const { rows } = await getPostgres().query(query, [shopId, name, targets[0] || null, JSON.stringify(targets)]);
            res.json({ ok: true, id: rows[0].id });
        } else {
            const targets = normalizeRouteTargets(route_targets, printer_station);
            const query = 'INSERT INTO product_categories (shop_id, name, printer_station, route_targets) VALUES (?, ?, ?, ?)';
            const result = getSqlite().prepare(query).run(shopId, name, targets[0] || null, JSON.stringify(targets));
            res.json({ ok: true, id: result.lastInsertRowid });
        }
    } catch (err) {
        console.error("Create category error:", err);
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/product-categories/:id
router.patch('/:id', requireAuth, async (req, res) => {
    const { name, printer_station, route_targets } = req.body;
    const catId = parseInt(req.params.id);
    const shopId = req.session.user.shop_id;
    const isPostgres = usePostgres();
    try {
        await ensureRouteTargetsSchema();
        await db.transaction(async trx => {
            const category = await trx('product_categories').where({ id: catId, shop_id: shopId }).first();
            if (!category) {
                const error = new Error('Category not found');
                error.status = 404;
                throw error;
            }
            const updates = {};
            if (name !== undefined) {
                const nextName = String(name || '').trim();
                if (!nextName) throw new Error('Category name is required');
                const duplicate = await trx('product_categories').where({ shop_id: shopId }).whereNot({ id: catId }).whereRaw('LOWER(name) = ?', [nextName.toLowerCase()]).first();
                if (duplicate) throw new Error('A category with this name already exists');
                updates.name = nextName;
                await trx('products').where({ shop_id: shopId, category: category.name }).update({ category: nextName });
            }
            if (route_targets !== undefined || printer_station !== undefined) {
                const targets = normalizeRouteTargets(route_targets, route_targets === undefined ? printer_station : null);
                updates.printer_station = targets[0] || null;
                updates.route_targets = JSON.stringify(targets);
            }
            if (Object.keys(updates).length) await trx('product_categories').where({ id: catId, shop_id: shopId }).update(updates);
        });
        
        res.json({ ok: true });
    } catch (err) {
        console.error("Update category error:", err);
        res.status(err.status || 400).json({ error: err.message });
    }
});

// DELETE /api/product-categories/:id
router.delete('/:id', requireAuth, async (req, res) => {
    const catId = parseInt(req.params.id);
    const shopId = req.session.user.shop_id;
    const isPostgres = usePostgres();
    try {
        let cat;
        if (isPostgres) cat = (await getPostgres().query('SELECT id, name FROM product_categories WHERE id = $1 AND shop_id = $2', [catId, shopId])).rows[0];
        else cat = getSqlite().prepare('SELECT id, name FROM product_categories WHERE id = ? AND shop_id = ?').get(catId, shopId);
        
        if (!cat) return res.status(404).json({ error: 'Category not found' });

        const countQ = isPostgres 
            ? 'SELECT COUNT(*)::int as count FROM products WHERE category = $1 AND shop_id = $2'
            : 'SELECT COUNT(*) as count FROM products WHERE category = ? AND shop_id = ?';
        let count;
        if (isPostgres) count = (await getPostgres().query(countQ, [cat.name, shopId])).rows[0].count;
        else count = getSqlite().prepare(countQ).get(cat.name, shopId).count;

        if (count > 0) return res.status(400).json({ error: 'Category is in use by products and cannot be deleted.' });

        const delQ = isPostgres ? 'DELETE FROM product_categories WHERE id = $1 AND shop_id = $2' : 'DELETE FROM product_categories WHERE id = ? AND shop_id = ?';
        if (isPostgres) await getPostgres().query(delQ, [catId, shopId]);
        else getSqlite().prepare(delQ).run(catId, shopId);
        res.json({ ok: true });
    } catch (err) {
        console.error("Delete category error:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
