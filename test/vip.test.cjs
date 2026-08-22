const test = require('node:test');
const assert = require('node:assert/strict');
const { vipStatusForSpend } = require('../.tmp-test/storage/lark-base.repository.js');

test('VIP status is preserved when thresholds are intentionally unset', () => {
  assert.equal(vipStatusForSpend(500000, '🥇 Gold VIP', '', ''), '🥇 Gold VIP');
  assert.equal(vipStatusForSpend(500000, '', undefined, undefined), 'Standard');
});

test('VIP thresholds upgrade deterministically without hard-coded business assumptions', () => {
  assert.equal(vipStatusForSpend(49999, 'Standard', '50000', '200000'), 'Standard');
  assert.equal(vipStatusForSpend(50000, 'Standard', '50000', '200000'), '🥇 Gold VIP');
  assert.equal(vipStatusForSpend(200000, '🥇 Gold VIP', '50000', '200000'), '💎 Diamond VIP');
});
