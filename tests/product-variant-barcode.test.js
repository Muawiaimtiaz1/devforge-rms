const test = require('node:test');
const assert = require('node:assert/strict');
const productService = require('../services/ProductService');

function emptyBarcodeLookup() {
  return {
    where() { return this; },
    whereNot() { return this; },
    async first() { return null; }
  };
}

test('system variant barcode contains shop id, UTC date, and six random digits', () => {
  const barcode = productService.systemBarcodeCandidate(42, new Date('2026-10-08T23:59:59.000Z'));
  assert.match(barcode, /^4220261008[0-9]{6}$/);
});

test('blank variant barcode is generated and reserved for the current save', async () => {
  const trx = () => emptyBarcodeLookup();
  const reserved = new Set();
  const barcode = await productService.resolveVariantBarcode(trx, 7, '   ', reserved);

  assert.match(barcode, /^7[0-9]{14}$/);
  assert.equal(reserved.has(barcode), true);
});

test('manual variant barcode is trimmed and duplicate barcodes return a conflict', async () => {
  const trx = () => emptyBarcodeLookup();
  const reserved = new Set();
  assert.equal(await productService.resolveVariantBarcode(trx, 7, '  MANUAL-1  ', reserved), 'MANUAL-1');

  await assert.rejects(
    productService.resolveVariantBarcode(trx, 7, 'MANUAL-1', reserved),
    error => error.code === 'VARIANT_BARCODE_EXISTS' && error.status === 409
  );
});

test('the same manual barcode is allowed in a different shop save', async () => {
  const trx = () => emptyBarcodeLookup();
  const firstShop = new Set();
  const secondShop = new Set();

  assert.equal(await productService.resolveVariantBarcode(trx, 1, 'SHARED', firstShop), 'SHARED');
  assert.equal(await productService.resolveVariantBarcode(trx, 2, 'SHARED', secondShop), 'SHARED');
});