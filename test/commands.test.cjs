const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSalesCommand } = require('../.tmp-test/core/commands.js');

test('parses explicit close deal command variants', () => {
  assert.deepEqual(parseSalesCommand('ปิดยอด 45,000'), { type: 'close_deal', amount: 45000, source: 'explicit' });
  assert.deepEqual(parseSalesCommand('ยอดเงิน 150000'), { type: 'close_deal', amount: 150000, source: 'explicit' });
});

test('bare amount is only a close candidate for contextual confirmation', () => {
  assert.deepEqual(parseSalesCommand('30000'), { type: 'close_amount_candidate', amount: 30000 });
});

test('parses campaign commands and broadcast aliases', () => {
  assert.deepEqual(parseSalesCommand('ยิงโปร vip'), { type: 'campaign', segment: 'vip' });
  assert.deepEqual(parseSalesCommand('ยิงโปร retarget'), { type: 'campaign', segment: 'retarget' });
  assert.deepEqual(parseSalesCommand('บรอดแคสต์ vip'), { type: 'campaign', segment: 'vip' });
  assert.deepEqual(parseSalesCommand('บรอดแคสต์ รีทาร์เก็ต'), { type: 'campaign', segment: 'retarget' });
  assert.deepEqual(parseSalesCommand('บรอดแคสต์'), { type: 'campaign_menu' });
});

test('normal sales reply is not a command', () => {
  assert.deepEqual(parseSalesCommand('มีของพร้อมส่งครับ'), { type: 'none' });
});
