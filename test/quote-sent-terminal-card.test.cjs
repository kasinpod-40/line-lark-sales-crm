const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildQuoteSentCard } = require('../.tmp-test/providers/lark/quote-terminal.card.js');

function walk(value, visit) {
  if (!value || typeof value !== 'object') return;
  visit(value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  for (const child of Object.values(value)) walk(child, visit);
}

test('sent quote card is green terminal with no buttons', () => {
  const card = buildQuoteSentCard({
    quotation_no: 'QT-20260823',
    items: [
      { description: 'สินค้า A', quantity: 2, unit_price: 7500, line_total: 15000 },
      { description: 'สินค้า B', quantity: 1, unit_price: 15000, line_total: 15000 },
    ],
    subtotal: 30000,
    discount: 0,
    vat_rate: 7,
    vat_amount: 2100,
    shipping_fee: 0,
    total_amount: 32100,
  });

  assert.equal(card.schema, '2.0');
  assert.equal(card.header.template, 'green');
  assert.match(card.header.title.content, /ส่งใบเสนอราคาแล้ว/);
  assert.match(JSON.stringify(card), /QT-20260823/);
  assert.match(JSON.stringify(card), /32,100/);
  assert.match(JSON.stringify(card), /Sales_Deals/);

  const buttons = [];
  walk(card, (node) => { if (node.tag === 'button') buttons.push(node); });
  assert.deepEqual(buttons, []);
});

test('confirm quote terminalizes preview only after the quote draft is completed', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'card-action.service.ts'), 'utf8');
  const start = source.indexOf('case "confirm_quote"');
  assert.ok(start >= 0);
  const finish = source.indexOf('await this.operational.finishDraft(draft.draft_id);', start);
  const patch = source.indexOf('buildQuoteSentCard(draft.payload)', start);
  assert.ok(finish >= 0);
  assert.ok(patch > finish);
});
