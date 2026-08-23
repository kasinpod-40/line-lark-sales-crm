const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const script = path.join(root, 'scripts/reconcile-lark-base-reporting.mjs');
const source = fs.readFileSync(script, 'utf8');

test('reporting reconcile plan is zero-mutation and covers SLA plus both golden dashboards', () => {
  const output = execFileSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  const result = JSON.parse(output);
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'plan');
  assert.equal(result.mutation_count, 0);
  assert.equal(result.sla_formulas.length, 2);
  assert.deepEqual(result.sla_formulas.map((field) => field.name).sort(), ['sla_minutes', 'sla_status']);
  assert.equal(result.dashboard_count, 2);
  assert.equal(result.dashboard_block_count, 23);
});

test('reporting reconcile updates only SLA formulas then reuses UX reconciler and refreshes dashboard blocks', () => {
  assert.match(source, /\+field-update/);
  assert.match(source, /sla_minutes/);
  assert.match(source, /sla_status/);
  assert.match(source, /provision-lark-base-ux\.mjs/);
  assert.match(source, /\+dashboard-block-update/);
  assert.match(source, /--position/);
  assert.match(source, /no_table_create:\s*true/);
  assert.match(source, /no_record_mutation:\s*true/);
  assert.match(source, /no_worker_deploy:\s*true/);
  assert.doesNotMatch(source, /\+table-create|wrangler deploy|DELETE FROM|INSERT INTO/);
});
