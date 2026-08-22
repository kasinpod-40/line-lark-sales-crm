const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.resolve(__dirname, '../scripts/lark-base-visible-fields-ui-server.mjs'), 'utf8');
const browser = fs.readFileSync(path.resolve(__dirname, '../scripts/lark-base-visible-fields-ui.browser.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));

test('visible-field fallback is a local Base JS SDK runner pinned to the repository dependency', () => {
  assert.equal(pkg.dependencies['@lark-base-open/js-sdk'], '1.0.2');
  assert.equal(pkg.scripts['lark:base:ux:visible-ui'], 'node scripts/lark-base-visible-fields-ui-server.mjs');
  assert.match(server, /node_modules\/@lark-base-open\/js-sdk\/dist/);
  assert.match(browser, /getVisibleFieldIdList/);
  assert.match(browser, /hideField/);
  assert.match(browser, /showField/);
});

test('visible-field fallback reconciles membership without retrying unsupported order-only drift', () => {
  assert.match(browser, /execute && !sameMembership\(beforeIds, desiredIds\)/);
  assert.match(browser, /const hideIds = beforeIds\.filter\(\(id\) => id !== primaryId && !desiredSet\.has\(id\)\)/);
  assert.match(browser, /const showIds = desiredIds\.filter\(\(id\) => id !== primaryId && !beforeSet\.has\(id\)\)/);
  assert.match(browser, /const membershipExact = sameMembership\(afterIds, desiredIds\)/);
  assert.match(browser, /const orderExact = membershipExact && sameArray\(afterIds, desiredIds\)/);
  assert.match(browser, /VISIBLE_FIELDS_MEMBERSHIP_PASS_ORDER_UI_REQUIRED/);
  assert.match(browser, /order_manual_views/);
  assert.match(browser, /MANUAL_UI_PASS_REQUIRED/);
  assert.doesNotMatch(browser, /hide every other currently-visible field/);
});

test('visible-field fallback reports presentation-only mutations and no business-data mutation', () => {
  assert.match(browser, /table_mutation_count: 0/);
  assert.match(browser, /field_schema_mutation_count: 0/);
  assert.match(browser, /record_mutation_count: 0/);
  assert.doesNotMatch(browser, /EWrubbprw|tblpv0icWMgX66wQ|tbl0H0zavzG6EmXm|tblc0zJSoGCtxnJT/);
});
