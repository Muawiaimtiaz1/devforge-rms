const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (relative) => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8')

test('inventory owns stock product add and edit forms without menu redirect', () => {
  const page = read('frontend/src/modules/inventory/InventoryPage.jsx')
  assert.match(page, /StockProductFormModal/)
  assert.match(page, /setModal\(\{ type: 'add-product' \}\)/)
  assert.match(page, /setModal\(\{ type: 'edit-product', product \}\)/)
  assert.doesNotMatch(page, /inventory_product_editor|dashboard#products|legacyProductEditor/)
})

test('stock product form preserves dedicated stock adjustment flow on edit', () => {
  const form = read('frontend/src/modules/inventory/components/StockProductFormModal.jsx')
  assert.match(form, /product_type', 'stock_based'/)
  assert.match(form, /disabled=\{editing && Boolean\(variant\.id\)\}/)
  assert.match(form, /Use Add Stock to change existing quantities/)
  assert.match(form, /client_request_id/)
  assert.match(form, /stock_variants/)
  assert.match(form, /api\('\/api\/product-categories'\)/)
  assert.match(form, /Select category/)
})
