const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const provisionerPath = path.join(root, 'scripts/provision-lark-base-ux.mjs');
const ux = JSON.parse(fs.readFileSync(path.join(root, 'deploy/lark-base-ux-contract.json'), 'utf8'));

function expectedVisibleViews() {
  return ux.tables.reduce(
    (sum, table) => sum + table.views.filter((view) => Array.isArray(view.visible_fields)).length,
    0,
  );
}

test('server UX provisioner never mutates or final-verifies visible_fields after live capability failure', () => {
  const source = fs.readFileSync(provisionerPath, 'utf8');

  assert.doesNotMatch(source, /reconcileViewProperty\([^\n]+"visible_fields"/);
  assert.doesNotMatch(source, /verifyViewPropertyEventually\([^\n]+"visible_fields"/);
  assert.doesNotMatch(source, /visible_fields:\s*\{\s*get:\s*"\+view-get-visible-fields",\s*set:\s*"\+view-set-visible-fields"/);
  assert.match(source, /BASE_JS_SDK_UI_REQUIRED/);
  assert.match(source, /server_mutation_count:\s*0/);
  assert.match(source, /visible_fields_deferred/);
});

test('plan declares the UI visible-field lane before runtime mutation', () => {
  const output = execFileSync(process.execPath, [provisionerPath], { cwd: root, encoding: 'utf8' });
  const result = JSON.parse(output);

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'plan');
  assert.equal(result.mutation_count, 0);
  assert.equal(result.visible_fields.delivery, 'base_js_sdk_ui');
  assert.equal(result.visible_fields.expected_views, expectedVisibleViews());
  assert.equal(result.visible_fields.expected_views, 22);
  assert.equal(result.visible_fields.command, 'npm run lark:base:ux:visible-ui');
});
