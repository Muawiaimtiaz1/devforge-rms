const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeUsageRestock, usageToStockQuantity } = require('../src/modules/inventory/restock-units');

test('normalizes 1000 g and total cost to one kg batch', () => {
    assert.deepEqual(normalizeUsageRestock({ quantityUsageUnit: 1000, totalCost: 500, conversionFactor: 1000 }), { quantity: 1, buyingPrice: 500, totalCost: 500, usageQuantity: 1000 });
});

test('preserves total value for a partial large unit', () => {
    const result = normalizeUsageRestock({ quantityUsageUnit: 500, totalCost: 300, conversionFactor: 1000 });
    assert.equal(result.quantity, 0.5);
    assert.equal(result.buyingPrice, 600);
    assert.equal(result.quantity * result.buyingPrice, 300);
});

test('rejects invalid restock values', () => {
    assert.throws(() => normalizeUsageRestock({ quantityUsageUnit: 0, totalCost: 500, conversionFactor: 1000 }), /greater than zero/);
    assert.throws(() => normalizeUsageRestock({ quantityUsageUnit: 1000, totalCost: -1, conversionFactor: 1000 }), /cannot be negative/);
    assert.throws(() => normalizeUsageRestock({ quantityUsageUnit: 1000, totalCost: 500, conversionFactor: 0 }), /greater than zero/);
});

test('converts waste entered in a usage unit to stock units without display noise', () => {
    assert.equal(usageToStockQuantity(800.002, 1000), 0.800002);
    assert.equal(Number(usageToStockQuantity(800.002, 1000).toFixed(3)), 0.8);
});
