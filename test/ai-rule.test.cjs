const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeByRules } = require('../.tmp-test/ai/rule-engine.js');

test('payment language is a hot closing lead', () => {
  const result = analyzeByRules('ขอ QR พร้อมเพย์ครับ จะชำระเงินเลย');
  assert.equal(result.intent, 'payment_request');
  assert.equal(result.customer_stage, 'Closing');
  assert.equal(result.hot_lead, true);
});

test('price inquiry is purchase intent', () => {
  const result = analyzeByRules('ตัวนี้ราคาเท่าไหร่ครับ');
  assert.equal(result.intent, 'ask_price');
  assert.equal(result.buyer_intent, 'Purchase Intent');
});
