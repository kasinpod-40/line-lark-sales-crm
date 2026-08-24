const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'scripts/reorder-lark-base-visible-fields.mjs'), 'utf8');
const ux = JSON.parse(fs.readFileSync(path.join(root, 'deploy/lark-base-ux-contract.json'), 'utf8'));

const viewCount = ux.tables.reduce((sum, table) => sum + table.views.length, 0);

test('view ordering operator covers all curated views and is disabled by default', () => {
  assert.equal(viewCount, 22);
  assert.match(script, /const WRITE_GATE = "VIEW_ORDER_ONLY"/);
  assert.match(script, /--enable-view-order-write/);
  assert.match(script, /Apply is disabled by default/);
  assert.match(script, /if \(!args\.apply\)/);
});

test('view ordering reads current visible fields and verifies exact order after writes', () => {
  assert.match(script, /\+view-get-visible-fields/);
  assert.match(script, /\+view-set-visible-fields/);
  assert.match(script, /arraysEqual/);
  assert.match(script, /UPDATED_DIRECT/);
  assert.match(script, /UPDATED_STAGED/);
  assert.match(script, /FAILED_RESTORED/);
  assert.match(script, /staged-primary/);
  assert.match(script, /rollback/);
  assert.match(script, /800070003\|no operation produced/);
});

test('view ordering preserves current visible membership and excludes unrelated mutation surfaces', () => {
  assert.match(script, /desiredOrder\(current, schema\.primary_field\)/);
  assert.match(script, /current visible membership is preserved exactly/);
  assert.match(script, /no_record_mutation:\s*true/);
  assert.match(script, /no_field_schema_mutation:\s*true/);
  assert.match(script, /no_filter_mutation:\s*true/);
  assert.match(script, /no_view_name_mutation:\s*true/);
  assert.match(script, /no_view_create_delete:\s*true/);
  assert.doesNotMatch(script, /\+record-|\+field-create|\+field-delete|\+view-delete|\+view-create|\+view-set-filter|wrangler deploy/);
});

test('ordering priority keeps primary/readable business fields ahead of IDs and audit fields', () => {
  assert.match(script, /\["display_name", 100\]/);
  assert.match(script, /\["customer_stage", 400\]/);
  assert.match(script, /\["deal_value_thb", 520\]/);
  assert.match(script, /\["case_id", 900\]/);
  assert.match(script, /\["updated_at", 1030\]/);
  assert.match(script, /left === primaryField \? 0/);
});
