const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeByRules } = require('../.tmp-test/ai/rule-engine.js');
const { actionGuidance, intentLabel, leadQuality } = require('../.tmp-test/ai/presentation.js');

test('payment language is a hot closing lead', () => {
  const result = analyzeByRules('ขอ QR พร้อมเพย์ครับ จะชำระเงินเลย');
  assert.equal(result.intent, 'payment_request');
  assert.equal(result.customer_stage, 'Closing');
  assert.equal(result.hot_lead, true);
  assert.equal(leadQuality(result.lead_score), '🔥 Hot Lead');
});

test('price inquiry is purchase intent with quotation guidance', () => {
  const result = analyzeByRules('ขอใบเสนอราคาตัวนี้หน่อยครับ');
  assert.equal(result.intent, 'ask_price');
  assert.equal(result.buyer_intent, 'Purchase Intent');
  assert.match(intentLabel(result.intent), /Price Inquiry/);
  assert.match(actionGuidance(result), /ใบเสนอราคา/);
});

test('demo request and technical support are explicit SRS intents', () => {
  const demo = analyzeByRules('ขอนัดเดโม่ระบบวันพรุ่งนี้ได้ไหม');
  assert.equal(demo.intent, 'demo_request');
  assert.match(intentLabel(demo.intent), /Demo Request/);

  const support = analyzeByRules('ระบบมีปัญหา ขอทีมเทคนิคช่วยหน่อย');
  assert.equal(support.intent, 'support');
  assert.match(intentLabel(support.intent), /Technical Support/);
});
