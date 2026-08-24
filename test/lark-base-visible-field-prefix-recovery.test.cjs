const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'scripts/recover-lark-base-visible-field-order.mjs'), 'utf8');
const ux = JSON.parse(fs.readFileSync(path.join(root, 'deploy/lark-base-ux-contract.json'), 'utf8'));
const viewCount = ux.tables.reduce((sum, table) => sum + table.views.length, 0);

test('prefix recovery is manual-only and covers the 22 curated Views', () => {
  assert.equal(viewCount, 22);
  assert.match(script, /const WRITE_GATE = "VIEW_ORDER_PREFIX_ONLY"/);
  assert.match(script, /--enable-view-order-write/);
  assert.match(script, /Apply is disabled by default/);
  assert.match(script, /if \(!args\.apply\)/);
});

test('prefix recovery builds desired visible order one exact prefix at a time', () => {
  assert.match(script, /prefix-1/);
  assert.match(script, /for \(let size = 2; size <= desired\.length; size \+= 1\)/);
  assert.match(script, /desired\.slice\(0, size\)/);
  assert.match(script, /arraysEqual\(readback, prefix\)/);
  assert.match(script, /UPDATED_PREFIX/);
  assert.match(script, /exact_readback_verified/);
});

test('prefix recovery restores original visible fields on every failed staged recovery', () => {
  assert.match(script, /function rollbackExact/);
  assert.match(script, /FAILED_RESTORED/);
  assert.match(script, /rollback did not restore original visible_fields/);
  assert.match(script, /arraysEqual\(restored, original\)/);
  assert.match(script, /current visible membership is restored on every failed recovery/);
});

test('prefix recovery excludes unrelated Base and runtime mutation surfaces', () => {
  assert.match(script, /no_record_mutation:\s*true/);
  assert.match(script, /no_field_schema_mutation:\s*true/);
  assert.match(script, /no_filter_mutation:\s*true/);
  assert.match(script, /no_view_name_mutation:\s*true/);
  assert.match(script, /no_view_create_delete:\s*true/);
  assert.doesNotMatch(script, /\+record-|\+field-create|\+field-delete|\+view-delete|\+view-create|\+view-set-filter|wrangler deploy/);
});
