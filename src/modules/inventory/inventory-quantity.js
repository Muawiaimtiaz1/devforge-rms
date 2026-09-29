const QUANTITY_DECIMALS = 3;
const QUANTITY_SCALE = 10 ** QUANTITY_DECIMALS;
const MIN_ACTIVE_QUANTITY = 1 / QUANTITY_SCALE;

function quantity(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error('Inventory quantity must be a finite number.');
  const rounded = Math.round((parsed + Math.sign(parsed || 1) * Number.EPSILON) * QUANTITY_SCALE) / QUANTITY_SCALE;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function positiveQuantity(value, message = 'Inventory quantity must be greater than zero.') {
  const rounded = quantity(value);
  if (rounded < MIN_ACTIVE_QUANTITY) throw new Error(message);
  return rounded;
}

function isActiveQuantity(value) {
  try {
    return quantity(value) >= MIN_ACTIVE_QUANTITY;
  } catch {
    return false;
  }
}

function addQuantity(left, right) {
  return quantity(quantity(left) + quantity(right));
}

function subtractQuantity(left, right) {
  return quantity(quantity(left) - quantity(right));
}

module.exports = {
  QUANTITY_DECIMALS,
  MIN_ACTIVE_QUANTITY,
  quantity,
  positiveQuantity,
  isActiveQuantity,
  addQuantity,
  subtractQuantity,
};
