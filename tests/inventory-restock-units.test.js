const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeUsageRestock, usageToStockQuantity } = require('../src/modules/inventory/restock-units');
const { quantity, isActiveQuantity, addQuantity, subtractQuantity } = require('../src/modules/inventory/inventory-quantity');

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
    assert.equal(usageToStockQuantity(800.002, 1000), 0.8);
});

test('inventory quantities use one three-decimal boundary rule', () => {
    assert.equal(quantity(1.23456), 1.235);
    assert.equal(quantity(0.0004), 0);
    assert.equal(quantity(0.0005), 0.001);
    assert.equal(quantity(0.000000000023), 0);
    assert.equal(isActiveQuantity(0.0004), false);
    assert.equal(isActiveQuantity(0.001), true);
    assert.equal(subtractQuantity(0.3, 0.2), 0.1);
    assert.equal(addQuantity(0.1, 0.2), 0.3);
});

test('sub-minimum restocks and waste conversions are rejected', () => {
    assert.throws(() => usageToStockQuantity(0.4, 1000), /below the minimum measurable quantity/);
});
