const express = require('express');
const productService = require('../services/ProductService');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db/knex');
const router = express.Router();

function parseAddonConfig(value) {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value || '[]'); } catch (_) { return []; }
}

async function syncCatalogAddonToProducts(trx, shopId, addonId, replacement) {
  const optionId = `addon-${addonId}`;
  const products = await trx('products').where({ shop_id: shopId, is_deleted: 0 }).select('id', 'addons_config');
  for (const product of products) {
    const addons = parseAddonConfig(product.addons_config);
    const index = addons.findIndex(addon => String(addon.id) === optionId);
    if (index < 0) continue;
    if (replacement) addons[index] = { id: optionId, ...replacement };
    else addons.splice(index, 1);
    await trx('products').where({ id: product.id, shop_id: shopId }).update({ addons_config: JSON.stringify(addons) });
  }
}

// MULTER CONFIG FOR PRODUCT IMAGES (Kept in routes as it's part of the HTTP transport layer)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const uploadDir = path.join(__dirname, "..", "public", "uploads", "products");
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `prod-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    if (allowed.test(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error("Only images (jpg, png, webp) allowed"));
    }
  },
});

// GET /api/products
router.get('/', requireAuth, async (req, res) => {
    const products = await productService.getAllProducts(req.session.user.shop_id);
    res.json(products);
});

// POST /api/products
router.post('/', requireAuth, (req, res, next) => {
    upload.single('image')(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        next();
    });
}, async (req, res) => {
    const { components, ingredients, variants, addons, stock_variants } = req.body;
    
    // Parse strings to arrays if needed (FormData sends strings)
    const parse = (val) => {
      if (typeof val === 'string') {
        try { return JSON.parse(val); } catch(e) { return []; }
      }
      return val || [];
    }

    const payload = {
      ...req.body,
      product_type: req.body.product_type || 'stock_based',
      barcode: req.body.barcode || null,
      brand_id: parseInt(req.body.brand_id),
      buying_price: parseFloat(req.body.buying_price),
      selling_price: parseFloat(req.body.selling_price),
      stock: parseInt(req.body.stock) || 0,
      min_stock_level: parseInt(req.body.min_stock_level) || 0,
      min_stock_level: parseInt(req.body.min_stock_level) || 0,
      components: parse(components),
      ingredients: parse(ingredients),
      variants: parse(variants),
      addons: parse(addons),
      stock_variants: parse(stock_variants),
      image_path: req.file ? "/uploads/products/" + req.file.filename : null
    };

    const productId = await productService.createProduct(payload, req.session.user.shop_id, req.session.user.id);
    res.json({ ok: true, id: productId });
});

// Restaurant-level reusable add-on catalog.
router.get('/menu-addons', requireAuth, async (req, res) => {
  const rows = await db('menu_addons as ma')
    .leftJoin('raw_stocks as rs', 'ma.raw_stock_id', 'rs.id')
    .where('ma.shop_id', req.session.user.shop_id)
    .where('ma.is_active', 1)
    .select('ma.*', 'rs.name as inventory_name')
    .orderBy('ma.name', 'asc');
  res.json(rows);
});

router.post('/menu-addons', requireAuth, async (req, res) => {
  try {
    const shopId = req.session.user.shop_id;
    const name = String(req.body.name || '').trim();
    const price = Number(req.body.price);
    const rawStockId = req.body.raw_stock_id ? Number(req.body.raw_stock_id) : null;
    const quantity = rawStockId ? Number(req.body.quantity) : 0;
    if (!name || !Number.isFinite(price) || price < 0) throw new Error('Add-on name and a valid price are required.');
    if (rawStockId && (!Number.isInteger(rawStockId) || !Number.isFinite(quantity) || quantity <= 0)) throw new Error('Select a valid inventory quantity.');
    if (rawStockId && !await db('raw_stocks').where({ id: rawStockId, shop_id: shopId, is_deleted: 0 }).first('id')) throw new Error('Selected inventory ingredient is invalid.');
    const result = await db.transaction(async trx => {
      const existing = await trx('menu_addons')
        .where({ shop_id: shopId })
        .whereRaw('LOWER(TRIM(name)) = LOWER(TRIM(?))', [name])
        .first('id', 'is_active');
      if (existing?.is_active) {
        const duplicateError = new Error('An add-on with this name already exists.');
        duplicateError.code = 'ADDON_NAME_EXISTS';
        throw duplicateError;
      }
      if (existing) {
        await trx('menu_addons').where({ id: existing.id, shop_id: shopId }).update({ name, price, raw_stock_id: rawStockId, quantity, is_active: 1, updated_at: trx.fn.now() });
        return { id: existing.id, restored: true };
      }
      const inserted = await trx('menu_addons').insert({ shop_id: shopId, name, price, raw_stock_id: rawStockId, quantity }).returning('id');
      return { id: typeof inserted[0] === 'object' ? inserted[0].id : inserted[0], restored: false };
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    const duplicate = error.code === 'ADDON_NAME_EXISTS' || error.code === '23505' || String(error.code || '').startsWith('SQLITE_CONSTRAINT');
    res.status(duplicate ? 409 : 400).json({ error: duplicate ? 'An add-on with this name already exists.' : error.message });
  }
});

router.put('/menu-addons/:addonId', requireAuth, async (req, res) => {
  try {
    const shopId = req.session.user.shop_id;
    const id = Number(req.params.addonId);
    const name = String(req.body.name || '').trim();
    const price = Number(req.body.price);
    const rawStockId = req.body.raw_stock_id ? Number(req.body.raw_stock_id) : null;
    const quantity = rawStockId ? Number(req.body.quantity) : 0;
    if (!name || !Number.isFinite(price) || price < 0) throw new Error('Add-on name and a valid price are required.');
    if (rawStockId && (!Number.isInteger(rawStockId) || !Number.isFinite(quantity) || quantity <= 0)) throw new Error('Select a valid inventory quantity.');
    if (rawStockId && !await db('raw_stocks').where({ id: rawStockId, shop_id: shopId, is_deleted: 0 }).first('id')) throw new Error('Selected inventory ingredient is invalid.');
    const updated = await db.transaction(async trx => {
      const count = await trx('menu_addons').where({ id, shop_id: shopId }).update({ name, price, raw_stock_id: rawStockId, quantity, updated_at: trx.fn.now() });
      if (count) await syncCatalogAddonToProducts(trx, shopId, id, { name, price, raw_stock_id: rawStockId, quantity });
      return count;
    });
    if (!updated) return res.status(404).json({ error: 'Add-on not found.' });
    res.json({ ok: true });
  } catch (error) {
    const duplicate = error.code === '23505' || String(error.code || '').startsWith('SQLITE_CONSTRAINT');
    res.status(duplicate ? 409 : 400).json({ error: duplicate ? 'An add-on with this name already exists.' : error.message });
  }
});

router.delete('/menu-addons/:addonId', requireAuth, async (req, res) => {
  const id = Number(req.params.addonId);
  const shopId = req.session.user.shop_id;
  const updated = await db.transaction(async trx => {
    const count = await trx('menu_addons').where({ id, shop_id: shopId }).update({ is_active: 0, updated_at: trx.fn.now() });
    if (count) await syncCatalogAddonToProducts(trx, shopId, id, null);
    return count;
  });
  if (!updated) return res.status(404).json({ error: 'Add-on not found.' });
  res.json({ ok: true });
});

// DELETE /api/products/:id
router.delete('/:id', requireAuth, async (req, res) => {
  await productService.setDeleted(req.params.id, req.session.user.shop_id);
  res.json({ ok: true });
});

// PUT /api/products/:id
router.put('/:id', requireAuth, upload.single('image'), async (req, res) => {
    const { components, ingredients, variants, addons, stock_variants } = req.body;
    const parse = (val) => {
        if (typeof val === 'string') {
            try { return JSON.parse(val); } catch(e) { return []; }
        }
        return val || [];
    }
    const payload = {
        ...req.body,
        product_type: req.body.product_type || 'stock_based',
        barcode: req.body.barcode || null,
        brand_id: parseInt(req.body.brand_id),
        buying_price: parseFloat(req.body.buying_price),
        selling_price: parseFloat(req.body.selling_price),
        stock: req.body.stock !== undefined ? parseInt(req.body.stock) : undefined,
        min_stock_level: parseInt(req.body.min_stock_level) || 0,
        min_stock_level: parseInt(req.body.min_stock_level) || 0,
        components: parse(components),
        ingredients: parse(ingredients),
        variants: parse(variants),
        addons: parse(addons),
        stock_variants: parse(stock_variants),
    };
    if (req.file) payload.image_path = "/uploads/products/" + req.file.filename;

    await productService.updateProduct(req.params.id, payload, req.session.user.shop_id, req.session.user.id);
    res.json({ ok: true });
});

// PATCH /api/products/:id/stock
router.patch('/:id/stock', requireAuth, async (req, res) => {
    const newStock = await productService.adjustStock(req.params.id, req.session.user.shop_id, req.body);
    res.json({ ok: true, stock: newStock });
});

router.patch('/:productId/variants/:variantId/stock', requireAuth, async (req, res) => {
  const variant = await productService.adjustStockVariant(req.params.productId, req.params.variantId, req.session.user.shop_id, req.body);
  res.json({ ok: true, variant });
});

router.patch('/:productId/variants/:variantId/menu', requireAuth, async (req, res) => {
  const variant = await productService.setStockVariantMenuStatus(req.params.productId, req.params.variantId, req.session.user.shop_id, req.body.is_on_menu === true);
  res.json({ ok: true, variant });
});

// POST /api/products/:id/harvest
router.post('/:id/harvest', requireAuth, async (req, res) => {
    const newStock = await productService.harvest(req.params.id, req.session.user.shop_id, req.body);
    res.json({ ok: true, new_stock: newStock });
});

// PATCH /api/products/:id/damage/loss
router.patch('/:id/damage/loss', requireAuth, async (req, res) => {
    await productService.recordLoss(req.params.id, req.session.user.shop_id, req.body);
    res.json({ ok: true });
});

// PATCH /api/products/:id/damage/recovery
router.patch('/:id/damage/recovery', requireAuth, async (req, res) => {
    await productService.recordRecovery(req.params.id, req.session.user.shop_id, req.body);
    res.json({ ok: true });
});

module.exports = router;
