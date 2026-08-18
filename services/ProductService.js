const db = require('../db/knex');
const { z } = require('zod');

const ingredientSchema = z.object({
  raw_stock_id: z.number().int().positive(),
  quantity: z.number().positive()
});
const variantSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  price: z.number().positive(),
  is_default: z.boolean().optional().default(false),
  ingredients: z.array(ingredientSchema).default([])
});
const addonSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  raw_stock_id: z.number().int().positive().nullable().optional(),
  quantity: z.number().nonnegative().optional().default(0),
  price: z.number().nonnegative()
});
const stockVariantSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1),
  sku: z.string().trim().min(1),
  barcode: z.string().trim().nullable().optional(),
  buying_price: z.number().nonnegative(),
  selling_price: z.number().positive(),
  stock: z.number().nonnegative(),
  min_stock_level: z.number().nonnegative().default(0),
  is_default: z.boolean().optional().default(false),
  is_on_menu: z.boolean().optional().default(false)
});

// Validation Schemas
const productSchema = z.object({
  sku: z.string().min(1, "SKU is required"),
  name: z.string().min(1, "Name is required"),
  category: z.string().min(1, "Category is required"),
  barcode: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  brand_id: z.number().int().positive("Brand is required"),
  buying_price: z.number().nonnegative().optional().default(0),
  selling_price: z.number().positive("Selling price must be greater than 0"),
  stock: z.number().int().default(0),
  min_stock_level: z.number().int().default(0),
  image_path: z.string().nullable().optional(),
  product_type: z.enum(['recipe_based', 'stock_based']).optional().default('stock_based'),
  components: z.array(z.any()).nullable().optional(),
  ingredients: z.array(z.any()).nullable().optional(),
  variants: z.array(variantSchema).nullable().optional(),
  addons: z.array(addonSchema).nullable().optional(),
  stock_variants: z.array(stockVariantSchema).nullable().optional(),
});

function parseConfig(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try { return JSON.parse(value); } catch (_) { return []; }
}


class ProductService {
  async validateMenuOptions(trx, variants, addons, shopId) {
    const variantList = variants || [];
    const addonList = addons || [];
    const unique = (values) => new Set(values).size === values.length;
    if (!unique(variantList.map(v => v.id)) || !unique(variantList.map(v => v.name.toLowerCase()))) throw new Error('Variant names and identifiers must be unique');
    if (!unique(addonList.map(a => a.id)) || !unique(addonList.map(a => a.name.toLowerCase()))) throw new Error('Add-on names and identifiers must be unique');
    if (variantList.length) {
      const selectedDefault = variantList.findIndex(v => v.is_default);
      variantList.forEach((variant, index) => { variant.is_default = index === (selectedDefault >= 0 ? selectedDefault : 0); });
    }
    const rawStockIds = [...new Set([
      ...variantList.flatMap(v => (v.ingredients || []).map(i => Number(i.raw_stock_id))),
      ...addonList.filter(a => a.raw_stock_id).map(a => Number(a.raw_stock_id))
    ])].filter(Number.isFinite);
    if (rawStockIds.length) {
      const rows = await trx('raw_stocks').where({ shop_id: shopId }).whereIn('id', rawStockIds).select('id');
      if (rows.length !== rawStockIds.length) throw new Error('One or more selected inventory ingredients are invalid');
    }
  }

  /**
   * Get all products for a shop with their brands, components, ingredients, and batches.
   */
  async getAllProducts(shopId, options = {}) {
    const isPostgres = db.client.config.client === 'pg';

    // Helper for JSON aggregation based on database engine
    const jsonAgg = (sql, alias) => {
      return isPostgres 
        ? db.raw(`(SELECT json_agg(row_to_json(t)) FROM (${sql}) t) as ${alias}`)
        : db.raw(`(SELECT json_group_array(json(t)) FROM (${sql}) t) as ${alias}`);
    };

    // Note: Due to the complexity of the existing subqueries, we'll start with clean Knex queries 
    // but keep the same data structure.
    
    const baseQuery = db('products as p')
      .select('p.*', 'b.name as brand_name')
      .leftJoin('brands as b', 'p.brand_id', 'b.id')
      .where('p.shop_id', shopId)
      .where('p.is_deleted', 0);

    const search = String(options.search || '').trim().toLowerCase();
    if (search) {
      baseQuery.andWhere(builder => builder
        .whereRaw('LOWER(p.name) LIKE ?', [`%${search}%`])
        .orWhereRaw('LOWER(p.category) LIKE ?', [`%${search}%`])
        .orWhereRaw('LOWER(COALESCE(p.barcode, ?)) LIKE ?', ['', `%${search}%`])
        .orWhereRaw('LOWER(p.sku) LIKE ?', [`%${search}%`])
        .orWhereExists(function () {
          this.select(db.raw('1'))
            .from('product_stock_variants as search_variant')
            .whereRaw('search_variant.product_id = p.id')
            .andWhere(function () {
              this.whereRaw('LOWER(search_variant.name) LIKE ?', [`%${search}%`])
                .orWhereRaw('LOWER(search_variant.sku) LIKE ?', [`%${search}%`])
                .orWhereRaw('LOWER(COALESCE(search_variant.barcode, ?)) LIKE ?', ['', `%${search}%`]);
            });
        }));
    }
    if (options.category) baseQuery.andWhere('p.category', options.category);
    if (options.productType) baseQuery.andWhere('p.product_type', options.productType);
    if (options.excludeComponents) baseQuery.andWhere(builder => builder.whereNull('p.is_component').orWhere('p.is_component', '!=', 1));
    if (options.stockFilter === 'out') baseQuery.andWhere('p.product_type', '!=', 'recipe_based').andWhere('p.stock', '<=', 0);
    if (options.stockFilter === 'low') baseQuery.andWhere('p.product_type', '!=', 'recipe_based').andWhereRaw('p.stock <= COALESCE(p.min_stock_level, 0)');
    if (options.menuOnly) {
      baseQuery.andWhere(builder => builder
        .where('p.product_type', 'recipe_based')
        .orWhereExists(function () {
          this.select(db.raw('1')).from('product_stock_variants as psv')
            .whereRaw('psv.product_id = p.id').andWhere('psv.is_active', true).andWhere('psv.is_on_menu', true);
        }));
    }

    const page = Math.max(1, Number(options.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(options.pageSize) || 20));
    const productsQuery = baseQuery.orderBy('p.name', 'asc');
    if (options.paginate) productsQuery.limit(pageSize).offset((page - 1) * pageSize);
    let total = null;
    let products;
    if (options.paginate) {
      const [countRow, productRows] = await Promise.all([
        baseQuery.clone().clearSelect().clearOrder().countDistinct('p.id as total').first(),
        productsQuery
      ]);
      total = Number(countRow?.total || 0);
      products = productRows;
    } else {
      products = await productsQuery;
    }

    const productIds = products.map(product => product.id);
    const [stockVariantRows, componentRows, ingredientRows, batchRows] = productIds.length ? await Promise.all([
      db('product_stock_variants')
        .where({ shop_id: shopId, is_active: true })
        .whereIn('product_id', productIds)
        .orderBy([{ column: 'is_default', order: 'desc' }, { column: 'name', order: 'asc' }]),
      db('product_compositions as pc')
        .select('pc.parent_product_id', 'pc.component_product_id as id', db.raw('COALESCE(cp.name, pc.custom_name) as name'), 'pc.quantity', 'pc.price', 'cp.sku', 'cp.stock')
        .leftJoin('products as cp', 'pc.component_product_id', 'cp.id')
        .whereIn('pc.parent_product_id', productIds),
      db('product_recipe_links as prl')
        .select('prl.product_id', 'ri.raw_stock_id as id', 'rs.name', 'rs.unit', 'rs.usage_unit', 'rs.conversion_factor', 'ri.quantity')
        .join('recipe_ingredients as ri', 'prl.recipe_id', 'ri.recipe_id')
        .join('raw_stocks as rs', 'ri.raw_stock_id', 'rs.id')
        .whereIn('prl.product_id', productIds),
      db('product_batches').whereIn('product_id', productIds).where('quantity', '>', 0).orderBy('created_at', 'asc')
    ]) : [[], [], [], []];
    const stockVariantsByProduct = new Map();
    for (const variant of stockVariantRows) {
      if (!stockVariantsByProduct.has(variant.product_id)) stockVariantsByProduct.set(variant.product_id, []);
      stockVariantsByProduct.get(variant.product_id).push(variant);
    }

    const groupByProduct = (rows, key) => rows.reduce((map, row) => {
      const productId = row[key];
      if (!map.has(productId)) map.set(productId, []);
      map.get(productId).push(row);
      return map;
    }, new Map());
    const componentsByProduct = groupByProduct(componentRows, 'parent_product_id');
    const ingredientsByProduct = groupByProduct(ingredientRows, 'product_id');
    const batchesByProduct = groupByProduct(batchRows, 'product_id');

    // To prevent the "n+1" query problem while maintaining the complex structure, 
    // we'll fetch related data in separate queries and merge them.
    // In a mature ERP, we'd use more optimized joins or specialized views.

    for (let p of products) {
      p.variants = parseConfig(p.variants_config);
      p.addons = parseConfig(p.addons_config);
      delete p.variants_config;
      delete p.addons_config;
      p.stock_variants = stockVariantsByProduct.get(p.id) || [];
      p.components = (componentsByProduct.get(p.id) || []).map(({ parent_product_id, ...component }) => component);
      p.ingredients = (ingredientsByProduct.get(p.id) || []).map(({ product_id, ...ingredient }) => ingredient);
      p.batches = batchesByProduct.get(p.id) || [];
      
      // Formatting
      if (p.image_path) p.image_url = p.image_path;
    }

    if (!options.paginate) return products;
    return {
      items: products,
      pagination: { page, page_size: pageSize, total, total_pages: Math.max(1, Math.ceil(total / pageSize)) }
    };
  }

  /**
   * Create a new product with its related entities (batches, recipes, compositions).
   */
  async createProduct(data, shopId, userId) {
    const validatedData = productSchema.parse(data);
    
    return await db.transaction(async (trx) => {
      const { components, ingredients, variants, addons, stock_variants, ...productData } = validatedData;
      await this.validateMenuOptions(trx, variants, addons, shopId);
      if (productData.product_type === 'recipe_based') {
        if (!variants?.length) throw new Error('Recipe-based products require at least one variant');
        productData.buying_price = 0;
        productData.stock = 0;
        productData.min_stock_level = 0;
      }
      if (productData.product_type === 'stock_based' && !stock_variants?.length) throw new Error('Stock-based products require at least one variant');
      productData.variants_config = JSON.stringify(variants || []);
      productData.addons_config = JSON.stringify(addons || []);
      if (productData.product_type === 'stock_based' && stock_variants?.length) {
        const defaultVariant = stock_variants.find(v => v.is_default) || stock_variants[0];
        productData.buying_price = defaultVariant.buying_price;
        productData.selling_price = defaultVariant.selling_price;
        productData.stock = stock_variants.reduce((sum, v) => sum + Number(v.stock), 0);
        productData.min_stock_level = 0;
      }
      
      // 1. Insert Product
      const [productIdObj] = await trx('products')
        .insert({
          ...productData,
          shop_id: shopId,
          user_id: userId,
          is_deleted: 0
        })
        .returning('id');
      
      const productId = typeof productIdObj === 'object' ? productIdObj.id : productIdObj;

      if (productData.product_type === 'stock_based' && stock_variants?.length) {
        const defaultIndex = Math.max(stock_variants.findIndex(v => v.is_default), 0);
        await trx('product_stock_variants').insert(stock_variants.map((variant, index) => ({
          shop_id: shopId, product_id: productId, name: variant.name, sku: variant.sku,
          barcode: variant.barcode || null, buying_price: variant.buying_price,
          selling_price: variant.selling_price, stock: variant.stock,
          min_stock_level: variant.min_stock_level, is_default: index === defaultIndex,
          is_on_menu: !!variant.is_on_menu, is_active: true
        })));
      }

      // 2. Initial Batch
      if (productData.stock > 0 && !(productData.product_type === 'stock_based' && stock_variants?.length)) {
        await trx('product_batches').insert({
          product_id: productId,
          shop_id: shopId,
          buying_price: productData.buying_price,
          quantity: productData.stock
        });
      }

      // 3. Recipes/Ingredients
      if (ingredients && ingredients.length > 0) {
        const [recipeIdObj] = await trx('recipes')
          .insert({ shop_id: shopId, name: `Recipe: ${productData.name}` })
          .returning('id');
        const recipeId = typeof recipeIdObj === 'object' ? recipeIdObj.id : recipeIdObj;

        await trx('product_recipe_links').insert({
          shop_id: shopId,
          product_id: productId,
          recipe_id: recipeId
        });

        const ingredientRows = ingredients.map(ing => ({
          recipe_id: recipeId,
          raw_stock_id: ing.raw_stock_id,
          quantity: ing.quantity
        }));
        await trx('recipe_ingredients').insert(ingredientRows);
      }

      // 4. Composite Products
      if (components && components.length > 0) {
        for (const comp of components) {
          let linkedId = comp.id || null;
          if (!linkedId && comp.name) {
            const uniquePartName = `${productData.name} - ${comp.name}`;
            const existing = await trx('products')
              .where({ name: uniquePartName, shop_id: shopId, is_deleted: 0 })
              .first();
            
            if (existing) {
              linkedId = existing.id;
            } else {
              const partSku = `PART-${comp.name.toUpperCase().replace(/\s+/g, '-')}-${Math.floor(Math.random() * 10000)}`;
              const [newPartIdObj] = await trx('products')
                .insert({
                  sku: partSku,
                  name: uniquePartName,
                  category: productData.category,
                  brand_id: productData.brand_id,
                  user_id: userId,
                  shop_id: shopId,
                  buying_price: comp.cost || 0,
                  selling_price: comp.price || 0,
                  stock: 0,
                  is_component: 1
                })
                .returning('id');
              linkedId = typeof newPartIdObj === 'object' ? newPartIdObj.id : newPartIdObj;
            }
          }

          if (linkedId) {
            await trx('product_compositions').insert({
              parent_product_id: productId,
              component_product_id: linkedId,
              custom_name: comp.name || '',
              quantity: comp.quantity || 1,
              price: comp.price || 0,
              cost: comp.cost || 0
            });
          }
        }
      }

      await trx('shops').where({ id: shopId }).increment('product_count', 1);

      return productId;
    });
  }

  async setDeleted(productId, shopId) {
    return await db.transaction(async (trx) => {
      const affected = await trx('products')
        .where({ id: productId, shop_id: shopId, is_deleted: 0 })
        .update({ is_deleted: 1 });
      
      if (affected > 0) {
        await trx('shops').where({ id: shopId }).decrement('product_count', 1);
      }
      return affected;
    });
  }

  /**
   * Update an existing product.
   */
  async updateProduct(productId, data, shopId, userId) {
    const validatedData = productSchema.partial().parse(data);
    
    return await db.transaction(async (trx) => {
      const { components, ingredients, variants, addons, stock_variants, ...productData } = validatedData;
      await this.validateMenuOptions(trx, variants, addons, shopId);
      if (variants !== undefined) productData.variants_config = JSON.stringify(variants || []);
      if (addons !== undefined) productData.addons_config = JSON.stringify(addons || []);
      const product = await trx('products').where({ id: productId, shop_id: shopId }).first();
      if (!product) throw new Error('Product not found');
      if (productData.product_type === 'recipe_based') {
        if (!variants?.length) throw new Error('Recipe-based products require at least one variant');
        productData.buying_price = 0;
        productData.stock = 0;
        productData.min_stock_level = 0;
        await trx('product_batches').where({ product_id: productId, shop_id: shopId }).delete();
        await trx('product_stock_variants').where({ product_id: productId, shop_id: shopId }).update({ is_active: false, is_on_menu: false });
      }
      if (productData.product_type === 'stock_based' && stock_variants !== undefined && !stock_variants.length) throw new Error('Stock-based products require at least one variant');
      if (productData.product_type === 'stock_based' && stock_variants !== undefined) {
        if (!stock_variants.length) throw new Error('Stock-based products require at least one variant');
        const defaultIndex = Math.max(stock_variants.findIndex(v => v.is_default), 0);
        const retainedIds = [];
        for (let index = 0; index < stock_variants.length; index++) {
          const variant = stock_variants[index];
          const values = {
            name: variant.name, sku: variant.sku, barcode: variant.barcode || null,
            buying_price: variant.buying_price, selling_price: variant.selling_price,
            stock: variant.stock, min_stock_level: variant.min_stock_level,
            is_default: index === defaultIndex, is_on_menu: !!variant.is_on_menu,
            is_active: true, updated_at: db.fn.now()
          };
          if (variant.id) {
            const affected = await trx('product_stock_variants').where({ id: variant.id, product_id: productId, shop_id: shopId }).update(values);
            if (!affected) throw new Error('Invalid stock variant');
            retainedIds.push(variant.id);
          } else {
            const [created] = await trx('product_stock_variants').insert({ ...values, product_id: productId, shop_id: shopId }).returning('id');
            retainedIds.push(typeof created === 'object' ? created.id : created);
          }
        }
        await trx('product_stock_variants').where({ product_id: productId, shop_id: shopId }).whereNotIn('id', retainedIds).update({ is_active: false, is_on_menu: false });
        const defaultVariant = stock_variants[defaultIndex];
        productData.buying_price = defaultVariant.buying_price;
        productData.selling_price = defaultVariant.selling_price;
        productData.stock = stock_variants.reduce((sum, v) => sum + Number(v.stock), 0);
        productData.min_stock_level = 0;
      }

      // Update basic fields
      await trx('products')
        .where({ id: productId })
        .update({
          ...productData
        });

      // Handle Ingredients/Recipes
      if (ingredients !== undefined) {
        const existingLink = await trx('product_recipe_links').where({ product_id: productId }).first();
        let recipeId;
        
        if (existingLink) {
          recipeId = existingLink.recipe_id;
          await trx('recipe_ingredients').where({ recipe_id: recipeId }).delete();
        } else if (ingredients.length > 0) {
          const [rIdObj] = await trx('recipes').insert({ shop_id: shopId, name: `Recipe: ${product.name}` }).returning('id');
          recipeId = typeof rIdObj === 'object' ? rIdObj.id : rIdObj;
          await trx('product_recipe_links').insert({ shop_id: shopId, product_id: productId, recipe_id: recipeId });
        }

        if (recipeId && ingredients.length > 0) {
          const rows = ingredients.map(ing => ({ recipe_id: recipeId, raw_stock_id: ing.raw_stock_id, quantity: ing.quantity }));
          await trx('recipe_ingredients').insert(rows);
        } else if (recipeId && ingredients.length === 0) {
          await trx('product_recipe_links').where({ product_id: productId }).delete();
        }
      }

      // Handle Compositions (Composite products)
      if (components !== undefined) {
        await trx('product_compositions').where({ parent_product_id: productId }).delete();
        for (const comp of components) {
          let linkedId = comp.id || null;
          if (!linkedId && comp.name) {
            const uniquePartName = `${product.name} - ${comp.name}`;
            const existing = await trx('products').where({ name: uniquePartName, shop_id: shopId, is_deleted: 0 }).first();
            if (existing) linkedId = existing.id;
            else {
              const partSku = `PART-${comp.name.toUpperCase().replace(/\s+/g, '-')}-${Math.floor(Math.random() * 10000)}`;
              const [newIdObj] = await trx('products').insert({
                sku: partSku, name: uniquePartName, category: productData.category || product.category,
                brand_id: productData.brand_id || product.brand_id, user_id: userId, shop_id: shopId,
                buying_price: comp.cost || 0, selling_price: comp.price || 0, stock: 0, is_component: 1
              }).returning('id');
              linkedId = typeof newIdObj === 'object' ? newIdObj.id : newIdObj;
            }
          }
          if (linkedId) {
            await trx('product_compositions').insert({
              parent_product_id: productId, component_product_id: linkedId,
              custom_name: comp.name || '', quantity: comp.quantity || 1, price: comp.price || 0, cost: comp.cost || 0
            });
          }
        }
      }
    });
  }


  /**
   * Adjust stock manually with FIFO batch handling.
   */
  async adjustStock(productId, shopId, { delta, buying_price }) {
    return await db.transaction(async (trx) => {
      const product = await trx('products').where({ id: productId, shop_id: shopId }).first();
      if (!product) throw new Error('Product not found');

      const diff = parseInt(delta || 0);
      const nBP = buying_price !== undefined ? parseFloat(buying_price) : product.buying_price;

      if (diff > 0) {
        await trx('product_batches').insert({ product_id: productId, shop_id: shopId, buying_price: nBP, quantity: diff });
      } else if (diff < 0) {
        let toRemove = Math.abs(diff);
        const batches = await trx('product_batches').where({ product_id: productId, shop_id: shopId }).where('quantity', '>', 0).orderBy('created_at', 'asc');
        for (const b of batches) {
          if (toRemove <= 0) break;
          const take = Math.min(b.quantity, toRemove);
          await trx('product_batches').where({ id: b.id }).update({ quantity: db.raw('quantity - ?', [take]) });
          toRemove -= take;
        }
      }

      await trx('products').where({ id: productId }).update({
        stock: db.raw('stock + ?', [diff]),
        buying_price: nBP
      });

      const updated = await trx('products').select('stock').where({ id: productId }).first();
      return updated.stock;
    });
  }

  async adjustStockVariant(productId, variantId, shopId, { delta, buying_price }) {
    return db.transaction(async (trx) => {
      const variant = await trx('product_stock_variants').where({ id: variantId, product_id: productId, shop_id: shopId, is_active: true }).forUpdate().first();
      if (!variant) throw new Error('Stock variant not found');
      const adjustment = Number(delta);
      if (!Number.isFinite(adjustment) || adjustment === 0) throw new Error('A non-zero stock adjustment is required');
      if (Number(variant.stock) + adjustment < 0) throw new Error('Stock cannot become negative');
      const nextCost = buying_price !== undefined && buying_price !== null && buying_price !== '' ? Number(buying_price) : Number(variant.buying_price);
      if (!Number.isFinite(nextCost) || nextCost < 0) throw new Error('Invalid buying price');
      await trx('product_stock_variants').where({ id: variant.id }).update({
        stock: db.raw('stock + ?', [adjustment]), buying_price: nextCost, updated_at: db.fn.now()
      });
      const total = await trx('product_stock_variants').where({ product_id: productId, shop_id: shopId, is_active: true }).sum('stock as total').first();
      await trx('products').where({ id: productId, shop_id: shopId }).update({ stock: Number(total?.total || 0) });
      return trx('product_stock_variants').where({ id: variant.id }).first();
    });
  }

  async setStockVariantMenuStatus(productId, variantId, shopId, isOnMenu) {
    const affected = await db('product_stock_variants')
      .where({ id: variantId, product_id: productId, shop_id: shopId, is_active: true })
      .update({ is_on_menu: !!isOnMenu, updated_at: db.fn.now() });
    if (!affected) throw new Error('Stock variant not found');
    return db('product_stock_variants').where({ id: variantId }).first();
  }

  /**
   * Record damage loss.
   */
  async recordLoss(productId, shopId, { damage_count, manual_loss_amount, batch_id }) {
    return await db.transaction(async (trx) => {
      const product = await trx('products').where({ id: productId, shop_id: shopId }).first();
      if (!product) throw new Error('Product not found');

      const count = parseInt(damage_count) || 0;
      const manualLoss = parseFloat(manual_loss_amount) || 0;
      let actualLossCost = manualLoss;

      if (count > 0) {
        if (product.stock < count) throw new Error('Not enough stock');
        if (batch_id) {
          const batch = await trx('product_batches').where({ id: batch_id }).first();
          if (!batch || batch.quantity < count) throw new Error('Not enough stock in batch');
          await trx('product_batches').where({ id: batch_id }).update({
            quantity: db.raw('quantity - ?', [count]),
            damaged_quantity: db.raw('damaged_quantity + ?', [count])
          });
          actualLossCost += (count * batch.buying_price);
        } else {
          let toRemove = count;
          const batches = await trx('product_batches').where({ product_id: productId, shop_id: shopId }).where('quantity', '>', 0).orderBy('created_at', 'asc');
          for (const b of batches) {
            if (toRemove <= 0) break;
            const take = Math.min(b.quantity, toRemove);
            await trx('product_batches').where({ id: b.id }).update({
              quantity: db.raw('quantity - ?', [take]),
              damaged_quantity: db.raw('damaged_quantity + ?', [take])
            });
            actualLossCost += (take * b.buying_price);
            toRemove -= take;
          }
        }
      }

      await trx('products').where({ id: productId }).update({
        stock: db.raw('stock - ?', [count]),
        damage_stock: db.raw('damage_stock + ?', [count]),
        manual_damage_loss: db.raw('manual_damage_loss + ?', [actualLossCost])
      });
    });
  }

  /**
   * Record recovery from damage.
   */
  async recordRecovery(productId, shopId, { recovery_count, recovery_amount, batch_id, is_restocking }) {
    return await db.transaction(async (trx) => {
      const product = await trx('products').where({ id: productId, shop_id: shopId }).first();
      if (!product) throw new Error('Product not found');

      const count = parseInt(recovery_count) || 0;
      const amount = parseFloat(recovery_amount) || 0;
      const shouldRestock = is_restocking === true;
      let costReduction = 0;

      if (count > 0) {
        if (product.damage_stock < count) throw new Error('Not enough damaged stock');
        if (batch_id) {
          const batch = await trx('product_batches').where({ id: batch_id }).first();
          if (!batch || batch.damaged_quantity < count) throw new Error('Not enough damaged stock in batch');
          if (shouldRestock) await trx('product_batches').where({ id: batch_id }).update({ 
            quantity: db.raw('quantity + ?', [count]), 
            damaged_quantity: db.raw('damaged_quantity - ?', [count]) 
          });
          else await trx('product_batches').where({ id: batch_id }).update({ damaged_quantity: db.raw('damaged_quantity - ?', [count]) });
          costReduction = (count * batch.buying_price);
        } else {
          const newest = await trx('product_batches').where({ product_id: productId, shop_id: shopId }).orderBy('created_at', 'desc').first();
          if (newest) {
            if (shouldRestock) await trx('product_batches').where({ id: newest.id }).update({ quantity: db.raw('quantity + ?', [count]) });
            costReduction = (count * newest.buying_price);
          }
        }
      }

      await trx('products').where({ id: productId }).update({
        stock: db.raw('stock + ?', [shouldRestock ? count : 0]),
        damage_stock: db.raw('damage_stock - ?', [count]),
        manual_damage_loss: db.raw('manual_damage_loss - ?', [costReduction]),
        recovered_damage_amount: db.raw('recovered_damage_amount + ?', [amount]),
        recovered_damage_quantity: db.raw('recovered_damage_quantity + ?', [count])
      });
    });
  }

  /**
   * Harvest units into components.
   */
  async harvest(productId, shopId, { count = 1 }) {
    return await db.transaction(async (trx) => {
      const product = await trx('products').where({ id: productId, shop_id: shopId }).first();
      if (!product) throw new Error('Product not found');
      if (product.stock < count) throw new Error(`Not enough stock of "${product.name}"`);

      let toRemove = count, totalCost = 0;
      const batches = await trx('product_batches').where({ product_id: productId, shop_id: shopId }).where('quantity', '>', 0).orderBy('created_at', 'asc');
      for (const b of batches) {
        if (toRemove <= 0) break;
        const take = Math.min(b.quantity, toRemove);
        await trx('product_batches').where({ id: b.id }).update({ quantity: db.raw('quantity - ?', [take]) });
        totalCost += (take * b.buying_price);
        toRemove -= take;
      }
      await trx('products').where({ id: productId }).update({ stock: db.raw('stock - ?', [count]) });

      const avgCost = count > 0 ? (totalCost / count) : product.buying_price;
      const components = await trx('product_compositions').where({ parent_product_id: productId });
      for (const comp of components) {
        if (comp.component_product_id) {
          const qty = count * comp.quantity;
          const cost = comp.cost || (avgCost / (comp.quantity || 1));
          await trx('products').where({ id: comp.component_product_id }).update({ stock: db.raw('stock + ?', [qty]) });
          await trx('product_batches').insert({ product_id: comp.component_product_id, shop_id: shopId, buying_price: cost, quantity: qty });
        }
      }
      return product.stock - count;
    });
  }
}

module.exports = new ProductService();
