const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (relative) => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8')

test('customer-facing order labels prefer the permanent order number', () => {
  const register = read('public/js/register-payments.js')
  const app = read('public/js/app.js')
  const sales = read('frontend/src/modules/sales/SalesPage.jsx')
  const kitchen = read('public/js/kitchen.js')

  assert.ok(register.includes('row.order_number || row.order_id'))
  assert.equal((app.match(/sale\.order_number \|\| sale\.id/g) || []).length >= 2, true)
  assert.ok(app.includes('payment.order_number || payment.sale_id'))
  assert.ok(sales.includes('modal.sale.order_number || modal.sale.id'))
  assert.ok(sales.includes('data.sale?.order_number || ret.sale_id'))
  assert.ok(kitchen.includes('sale.order_number || sale.id'))
  assert.ok(kitchen.includes('ret.order_number || ret.sale_id'))
})

test('APIs provide order numbers to logs, customer ledgers, and waste views', () => {
  const logs = read('routes/activity-logs.js')
  const customers = read('routes/customers.js')
  const waste = read('services/WasteService.js')
  const sales = read('services/SalesService.js')

  assert.ok(logs.includes("'s.order_number'"))
  assert.ok(logs.includes("COALESCE(s.order_number, we.sale_id)"))
  assert.ok(customers.includes('s.order_number'))
  assert.ok(customers.includes('entry.order_number || entry.sale_id'))
  assert.ok(waste.includes("'s.order_number'"))
  assert.ok(waste.includes('sale.order_number || sale.id'))
  assert.ok(sales.includes('Payment received for SALE-'))
  assert.ok(sales.includes('Refund for sale SALE-'))
})