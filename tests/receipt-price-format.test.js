const test = require('node:test');
const assert = require('node:assert/strict');
const { renderSaleReceiptPage } = require('../services/ReceiptPrintService');

test('receipt uses whole numbers for products and decimals for calculated totals', () => {
  const html = renderSaleReceiptPage({
    sale: {
      id: 1,
      order_number: 1,
      total: 107.25,
      discount: 2.5,
      tax_percentage: 10,
      amount_received: 107.25,
      payment_method: 'cash',
      order_type: 'takeaway',
      created_at: '2026-09-13 12:00:00',
    },
    items: [{ product_name: 'Tea', quantity: 1, price_at_sale: 100 }],
    shop: {},
  }, { autoPrint: false });

  assert.match(html, /<td class="text-right">100<\/td>/);
  assert.doesNotMatch(html, /<td class="text-right">100\.00<\/td>/);
  assert.match(html, /Subtotal: Rs\. 100<\/div>/);
  assert.match(html, /Discount: -Rs\. 2\.50/);
  assert.match(html, /Tax \(10%\): Rs\. 9\.75/);
  assert.match(html, /GRAND TOTAL: Rs\. 107\.25/);
});
