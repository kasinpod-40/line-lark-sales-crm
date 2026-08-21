const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSalesCommand } = require('../.tmp-test/core/commands.js');

test('parses close deal command', () => {
  assert.deepEqual(parseSalesCommand('ปิดยอด 45,000'), { type: 'close_deal', amount: 45000 });
});

test('parses campaign commands', () => {
  assert.deepEqual(parseSalesCommand('ยิงโปร vip'), { type: 'campaign', segment: 'vip' });
  assert.deepEqual(parseSalesCommand('ยิงโปร retarget'), { type: 'campaign', segment: 'retarget' });
});

test('normal sales reply is not a command', () => {
  assert.deepEqual(parseSalesCommand('มีของพร้อมส่งครับ'), { type: 'none' });
});
