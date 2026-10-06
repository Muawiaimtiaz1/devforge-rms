const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

test('barcode printing is restricted to retail product rows', () => {
  const page = read('frontend/src/modules/inventory/InventoryPage.jsx')
  const row = read('frontend/src/modules/inventory/components/StockProductRow.jsx')
  assert.ok(page.includes('canPrintBarcode={session.shop_type ==='))
  assert.ok(page.includes('retail'))
  assert.ok(row.includes('canPrintBarcode &&'))
  assert.ok(row.includes('Print barcode for'))
})

test('variant modal prints a complete 30mm label with the shop-currency price', () => {
  const modal = read('frontend/src/modules/inventory/components/BarcodePrintModal.jsx')
  for (const text of ['Which variant do you want to print?', 'No barcode assigned', 'formatShopCurrency(variant.selling_price)', 'size:30mm 15mm', 'svg.outerHTML', 'class=\'name\'', 'class=\'number\'', 'class=\'price\'']) {
    assert.ok(modal.includes(text), text)
  }
})
