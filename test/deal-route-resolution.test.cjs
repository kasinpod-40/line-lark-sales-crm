const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('src/storage/lark-base.repository.ts', 'utf8');

test('deal lookup prefers persisted case route record before scanning Base', () => {
  const methodStart = source.indexOf('async getLatestDealForCase');
  assert.notEqual(methodStart, -1);
  const method = source.slice(methodStart, source.indexOf('async markQrState', methodStart));
  assert.match(method, /SELECT deal_record_id FROM case_routes WHERE case_id=\? LIMIT 1/);
  assert.match(method, /preferredRecordId/);
  assert.match(method, /encodeURIComponent\(preferredRecordId\)/);
  assert.ok(method.indexOf('preferredRecordId') < method.indexOf('const all = await this.listAll'));
});

test('deal numeric cells accept numeric strings and currency numbers', () => {
  assert.match(source, /function numericCell\(value: unknown\)/);
  assert.match(source, /total_amount: numericCell\(f\.total_amount\) \?\? numericCell\(f\.deal_value_thb\)/);
  assert.match(source, /payment_amount: numericCell\(f\.payment_amount\)/);
});
