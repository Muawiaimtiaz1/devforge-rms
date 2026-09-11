const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('waiter-created takeaway orders retain waiter attribution across sales views', () => {
  const sales = fs.readFileSync(path.join(__dirname, '..', 'services', 'SalesService.js'), 'utf8');
  const logs = fs.readFileSync(path.join(__dirname, '..', 'routes', 'activity-logs.js'), 'utf8');
  assert.match(sales, /\['waiter', 'order_taker'\]\.includes[\s\S]*data\.waiter_id = userId/);
  assert.match(sales, /COALESCE\(w\.name, CASE WHEN LOWER\(u\.role\) IN \('waiter', 'order_taker'\)/);
  assert.match(logs, /COALESCE\(w\.name, CASE WHEN LOWER\(u\.role\) IN \('waiter', 'order_taker'\)/);
});
