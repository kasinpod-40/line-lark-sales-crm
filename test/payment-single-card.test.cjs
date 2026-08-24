const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildPaymentCancelledCard,
  buildPaymentEditCard,
  buildPaymentSentCard,
  buildPaymentSinglePreviewCard,
} = require('../.tmp-test/providers/lark/payment.cards.js');

function walk(value, visit) {
  if (!value || typeof value !== 'object') return;
  visit(value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  for (const child of Object.values(value)) walk(child, visit);
}

function actionNames(card) {
  const names = [];
  walk(card.body && card.body.elements, (node) => {
    if (node.tag !== 'button' || !Array.isArray(node.behaviors)) return;
    for (const behavior of node.behaviors) {
      if (behavior && behavior.type === 'callback' && behavior.value && behavior.value.action) {
        names.push(behavior.value.action);
      }
    }
  });
  return names;
}

function columnSets(card) {
  const sets = [];
  walk(card.body && card.body.elements, (node) => {
    if (node.tag === 'column_set') sets.push(node);
  });
  return sets;
}

test('payment preview is one card with confirm row then edit/cancel row', () => {
  const card = buildPaymentSinglePreviewCard('case-1', 'draft-1', 32100);
  assert.equal(card.schema, '2.0');
  assert.equal(card.header.template, 'orange');
  assert.deepEqual(actionNames(card), [
    'confirm_qr_single_card',
    'edit_qr_amount',
    'cancel_qr_single_card',
  ]);

  const sets = columnSets(card);
  assert.equal(sets.length, 1);
  assert.equal(sets[0].columns.length, 2);
  assert.equal(sets[0].columns[0].weight, 1);
  assert.equal(sets[0].columns[1].weight, 1);

  const elements = card.body.elements;
  assert.equal(elements[1].tag, 'button');
  assert.equal(elements[2].tag, 'column_set');
});

test('payment edit stays on the same mutable card and returns to preview', () => {
  const card = buildPaymentEditCard('case-1', 'draft-1', 32100, 'test');
  assert.equal(card.header.template, 'purple');
  assert.deepEqual(actionNames(card), ['save_qr_amount', 'cancel_qr_edit']);
  assert.match(JSON.stringify(card), /32100/);
});

test('payment terminal cards have no actions', () => {
  const sent = buildPaymentSentCard(32100);
  const cancelled = buildPaymentCancelledCard();
  assert.equal(sent.header.template, 'green');
  assert.equal(cancelled.header.template, 'grey');
  assert.deepEqual(actionNames(sent), []);
  assert.deepEqual(actionNames(cancelled), []);
});
