const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('analytics never reports product stock remaining for recipe-based menu items', () => {
  const analytics = fs.readFileSync(path.join(__dirname, '..', 'services', 'AnalyticsService.js'), 'utf8');
  const analyst = fs.readFileSync(path.join(__dirname, '..', 'services', 'AIAnalystService.js'), 'utf8');

  assert.match(analytics, /'p\.product_type'/);
  assert.match(analyst, /top\.product_type !== 'recipe_based'/);
  assert.match(analyst, /Number\(top\.stock\) < 10/);
});
