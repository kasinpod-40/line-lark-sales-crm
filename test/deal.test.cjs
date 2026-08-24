const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDirectCloseQuote } = require('../.tmp-test/core/deal.js');

test('direct close creates an auditable one-line deal snapshot', () => {
  const quote = buildDirectCloseQuote(45000, 'DIRECT-case-1');
  assert.equal(quote.quotation_no, 'DIRECT-case-1');
  assert.equal(quote.total_amount, 45000);
  assert.equal(quote.subtotal, 45000);
  assert.equal(quote.items.length, 1);
  assert.equal(quote.items[0].line_total, 45000);
  assert.match(quote.note, /no quotation was sent/i);
});

test('direct close rejects zero or negative amount', () => {
  assert.throws(() => buildDirectCloseQuote(0, 'DIRECT-1'));
  assert.throws(() => buildDirectCloseQuote(-1, 'DIRECT-1'));
});
