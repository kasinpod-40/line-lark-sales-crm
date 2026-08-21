const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPromptPayPayload, crc16CcittFalse } = require('../.tmp-test/core/promptpay.js');

test('promptpay payload has Thai QR merchant, currency, amount and valid CRC', () => {
  const payload = buildPromptPayPayload('0812345678', 45000, 'phone');
  assert.ok(payload.startsWith('000201010212'));
  assert.ok(payload.includes('A000000677010111'));
  assert.ok(payload.includes('5303764'));
  assert.ok(payload.includes('540845000.00'));
  assert.ok(payload.includes('5802TH'));
  const base = payload.slice(0, -4);
  assert.equal(payload.slice(-4), crc16CcittFalse(base));
});

test('promptpay rejects invalid amount', () => {
  assert.throws(() => buildPromptPayPayload('0812345678', 0, 'phone'));
});
