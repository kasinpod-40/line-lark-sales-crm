const test = require('node:test');
const assert = require('node:assert/strict');
const { parseQuoteForm } = require('../.tmp-test/core/quote.js');

test('quote calculator handles discount VAT shipping', () => {
  const quote = parseQuoteForm({
    quotation_no: 'QT-001',
    item_1_description: 'สินค้า A',
    item_1_quantity: '10',
    item_1_unit_price: '4000',
    item_2_description: 'บริการ B',
    item_2_quantity: '1',
    item_2_unit_price: '5000',
    discount: '1000',
    vat_rate: '7',
    shipping_fee: '500',
  });
  assert.equal(quote.subtotal, 45000);
  assert.equal(quote.discount, 1000);
  assert.equal(quote.vat_amount, 3080);
  assert.equal(quote.total_amount, 47580);
  assert.equal(quote.items.length, 2);
});

test('quote requires at least one item', () => {
  assert.throws(() => parseQuoteForm({}), /อย่างน้อย 1 รายการ/);
});
