const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('dine-in table cards show an escaped floor name with an unassigned fallback', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
  assert.match(source, /const floor = _posFloors\.find\(item => Number\(item\.id\) === Number\(table\.floor_id\)\)/);
  assert.match(source, /const floorName = floor\?\.name \|\| 'Other Tables'/);
  assert.match(source, /Floor: \$\{escapeOrderValue\(floorName\)\}/);
});
