const { positiveQuantity } = require('./inventory-quantity');

function positiveNumber(value, label) {
    if (value === '' || value === null || value === undefined) throw new Error(`${label} is required.`);
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} must be greater than zero.`);
    return number;
}

function nonNegativeNumber(value, label) {
    if (value === '' || value === null || value === undefined) throw new Error(`${label} is required.`);
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) throw new Error(`${label} cannot be negative.`);
    return number;
}

function normalizeUsageRestock({ quantityUsageUnit, totalCost, conversionFactor }) {
    const usageQuantity = positiveNumber(quantityUsageUnit, 'Restock quantity');
    const cost = nonNegativeNumber(totalCost, 'Total purchase price');
    const factor = positiveNumber(conversionFactor, 'Ingredient conversion factor');
    const quantity = positiveQuantity(usageQuantity / factor, 'Restock quantity is below the minimum measurable quantity of 0.001.');
    const buyingPrice = cost / quantity;
    if (!Number.isFinite(quantity) || !Number.isFinite(buyingPrice)) throw new Error('Restock values are too large.');
    return { quantity, buyingPrice, totalCost: cost, usageQuantity };
}

function usageToStockQuantity(quantityUsageUnit, conversionFactor) {
    const usageQuantity = positiveNumber(quantityUsageUnit, 'Quantity');
    const factor = positiveNumber(conversionFactor, 'Ingredient conversion factor');
    const quantity = positiveQuantity(usageQuantity / factor, 'Quantity is below the minimum measurable quantity of 0.001.');
    if (!Number.isFinite(quantity)) throw new Error('Quantity is too large.');
    return quantity;
}

module.exports = { normalizeUsageRestock, usageToStockQuantity };
