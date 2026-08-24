const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateSla, formatDuration } = require('../.tmp-test/core/sla.js');

test('SLA is Fast at exactly five minutes', () => {
  const result = calculateSla({ opened_at: 1000, first_response_at: 301000, closed_at: null });
  assert.equal(result.first_response_seconds, 300);
  assert.equal(result.sla_minutes, 5);
  assert.equal(result.sla_status, '🟢 Fast (<5m)');
});

test('SLA is overdue after five minutes and resolution stays separate', () => {
  const result = calculateSla({ opened_at: 1000, first_response_at: 302000, closed_at: 602000 });
  assert.equal(result.first_response_seconds, 301);
  assert.equal(result.sla_status, '🔴 Overdue SLA');
  assert.equal(result.resolution_seconds, 601);
  assert.equal(formatDuration(result.resolution_seconds), '10 นาที 1 วินาที');
});
