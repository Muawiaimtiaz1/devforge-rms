const express = require('express');
const productService = require('../services/ProductService');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db/knex');
const router = express.Router();

// Short-lived, shop/user-scoped protection for retries of one create form.
const pendingProductCreates = new Map();
const completedProductCreates = new Map();
const PRODUCT_CREATE_RESULT_TTL_MS = 5 * 60 * 1000;

function getProductCreateKey(req) {
  const requestId = String(req.body.client_request_id || '').trim();
  if (!requestId || requestId.length > 100 || !/^[A-Za-z0-9_-]+$/.test(requestId)) return null;
  return `${req.session.user.shop_id}:${req.session.user.id}:${requestId}`;
}

function parseAddonConfig(value) {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value || '[]'); } catch (_) { return []; }
}

function parseMenuAddonIngredients(body) {
  const source = Array.isArray(body.ingredients)
    ? body.ingredients
    : (body.raw_stock_id ? [{ raw_stock_id: body.raw_stock_id, quantity: body.quantity }] : []);
  const ingredients = source.map(ingredient => ({
    raw_stock_id: Number(ingredient.raw_stock_id),
    quantity: Number(ingredient.quantity)
  }));
  if (ingredients.some(ingredient => !Number.isInteger(ingredient.raw_stock_id) || !Number.isFinite(ingredient.quantity) || ingredient.quantity <= 0)) {
    throw new Error('Select valid inventory ingredients and quantities.');
  }
  if (new Set(ingredients.map(ingredient => ingredient.raw_stock_id)).size !== ingredients.length) {
    throw new Error('The same inventory ingredient cannot be added twice.');
  }
  return ingredients;
}

async function validateMenuAddonIngredients(trx, shopId, ingredients) {
  if (!ingredients.length) return;
  const rows = await trx('raw_stocks')
    .where({ shop_id: shopId, is_deleted: 0 })
    .whereIn('id', ingredients.map(ingredient => ingredient.raw_stock_id))
    .select('id');
  if (rows.length !== ingredients.length) throw new Error('One or more selected inventory ingredients are invalid.');
}

async function replaceMenuAddonIngredients(trx, addonId, ingredients) {
  await trx('menu_addon_ingredients').where({ menu_addon_id: addonId }).del();
  if (ingredients.length) {
    await trx('menu_addon_ingredients').insert(ingredients.map(ingredient => ({ menu_addon_id: addonId, ...ingredient })));
  }
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
    const paginate = req.query.paginate === '1' || req.query.paginate === 'true';
    const products = await productService.getAllProducts(req.session.user.shop_id, {
      paginate,
      page: req.query.page,
      pageSize: req.query.page_size,
      search: req.query.search,
      category: req.query.category,
      productType: req.query.product_type,
      stockFilter: req.query.stock_filter,
      menuOnly: req.query.menu_only === '1' || req.query.menu_only === 'true',
      excludeComponents: req.query.exclude_components === '1' || req.query.exclude_components === 'true',
      includeBrandName: req.query.list_view !== 'menu_panel',
      excludeDamageStock: req.query.list_view === 'menu_panel',
      excludeBatches: req.query.list_view === 'menu_panel'
    });
    res.json(products);
});

router.get('/:id/inventory-context', requireAuth, async (req, res) => {
    const context = await productService.getInventoryActionContext(req.params.id, req.session.user.shop_id);
    if (!context) return res.status(404).json({ error: 'Product not found' });
    res.json(context);
});

// POST /api/products
router.post('/', requireAuth, (req, res, next) => {
    upload.single('image')(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        next();
    });
}, async (req, res) => {
    const { components, ingredients, variants, addons, stock_variants } = req.body;
    const createKey = getProductCreateKey(req);

    if (createKey) {
      const completed = completedProductCreates.get(createKey);
      if (completed && completed.expiresAt > Date.now()) {
        return res.json({ ok: true, id: completed.productId });
      }
      if (completed) completedProductCreates.delete(createKey);
      if (pendingProductCreates.has(createKey)) {
        const productId = await pendingProductCreates.get(createKey);
        return res.json({ ok: true, id: productId });
      }
    }
    
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

    const createPromise = productService.createProduct(payload, req.session.user.shop_id, req.session.user.id);
    if (createKey) pendingProductCreates.set(createKey, createPromise);

    try {
      const productId = await createPromise;
      if (createKey) completedProductCreates.set(createKey, {
        productId,
        expiresAt: Date.now() + PRODUCT_CREATE_RESULT_TTL_MS
      });
      if (createKey) {
        const cleanupTimer = setTimeout(() => completedProductCreates.delete(createKey), PRODUCT_CREATE_RESULT_TTL_MS);
        cleanupTimer.unref?.();
      }
      res.json({ ok: true, id: productId });
    } finally {
      if (createKey) pendingProductCreates.delete(createKey);
    }
});

// Restaurant-level reusable add-on catalog.
router.get('/menu-addons', requireAuth, async (req, res) => {
  const rows = await db('menu_addons as ma')
    .where('ma.shop_id', req.session.user.shop_id)
    .where('ma.is_active', 1)
    .select('ma.*')
    .orderBy('ma.name', 'asc');
  const ingredientRows = rows.length ? await db('menu_addon_ingredients as mai')
    .join('raw_stocks as rs', 'mai.raw_stock_id', 'rs.id')
    .whereIn('mai.menu_addon_id', rows.map(row => row.id))
    .select('mai.menu_addon_id', 'mai.raw_stock_id', 'mai.quantity', 'rs.name as ingredient_name', 'rs.unit', 'rs.usage_unit', 'rs.conversion_factor')
    .orderBy('mai.id', 'asc') : [];
  const ingredientsByAddon = ingredientRows.reduce((map, ingredient) => {
    if (!map.has(ingredient.menu_addon_id)) map.set(ingredient.menu_addon_id, []);
    map.get(ingredient.menu_addon_id).push(ingredient);
    return map;
  }, new Map());
  rows.forEach(row => {
    row.ingredients = ingredientsByAddon.get(row.id) || [];
    row.raw_stock_id = row.ingredients[0]?.raw_stock_id || null;
    row.quantity = Number(row.ingredients[0]?.quantity || 0);
    row.inventory_name = row.ingredients[0]?.ingredient_name || null;
  });
  res.json(rows);
});

router.post('/menu-addons', requireAuth, async (req, res) => {
  try {
    const shopId = req.session.user.shop_id;
    const name = String(req.body.name || '').trim();
    const price = Number(req.body.price);
    const ingredients = parseMenuAddonIngredients(req.body);
    const firstIngredient = ingredients[0] || null;
    if (!name || !Number.isFinite(price) || price < 0) throw new Error('Add-on name and a valid price are required.');
    const result = await db.transaction(async trx => {
      await validateMenuAddonIngredients(trx, shopId, ingredients);
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
        await trx('menu_addons').where({ id: existing.id, shop_id: shopId }).update({ name, price, raw_stock_id: firstIngredient?.raw_stock_id || null, quantity: firstIngredient?.quantity || 0, is_active: 1, updated_at: trx.fn.now() });
        await replaceMenuAddonIngredients(trx, existing.id, ingredients);
        return { id: existing.id, restored: true };
      }
      const inserted = await trx('menu_addons').insert({ shop_id: shopId, name, price, raw_stock_id: firstIngredient?.raw_stock_id || null, quantity: firstIngredient?.quantity || 0 }).returning('id');
      const addonId = typeof inserted[0] === 'object' ? inserted[0].id : inserted[0];
      await replaceMenuAddonIngredients(trx, addonId, ingredients);
      return { id: addonId, restored: false };
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
    const ingredients = parseMenuAddonIngredients(req.body);
    const firstIngredient = ingredients[0] || null;
    if (!name || !Number.isFinite(price) || price < 0) throw new Error('Add-on name and a valid price are required.');
    const updated = await db.transaction(async trx => {
      await validateMenuAddonIngredients(trx, shopId, ingredients);
      const count = await trx('menu_addons').where({ id, shop_id: shopId }).update({ name, price, raw_stock_id: firstIngredient?.raw_stock_id || null, quantity: firstIngredient?.quantity || 0, updated_at: trx.fn.now() });
      if (count) {
        await replaceMenuAddonIngredients(trx, id, ingredients);
        await syncCatalogAddonToProducts(trx, shopId, id, { name, price, ingredients, raw_stock_id: firstIngredient?.raw_stock_id || null, quantity: firstIngredient?.quantity || 0 });
      }
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
