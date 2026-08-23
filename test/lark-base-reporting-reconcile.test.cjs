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
  assert.equal(result.pipeline_distribution_metric, 'SUM(deal_value_thb) grouped by pipeline_stage');
  assert.match(result.live_table_resolution, /exact live table ID\/display name/);
  assert.match(result.excluded_scope, /no view mutation/);
});

test('reporting reconcile is emoji-safe and scopes mutation to SLA formulas plus dashboards', () => {
  assert.match(source, /resolveCanonicalNamedResource/);
  assert.match(source, /\+table-list/);
  assert.match(source, /\+field-update/);
  assert.match(source, /sla_minutes/);
  assert.match(source, /sla_status/);
  assert.match(source, /chatTable\.id/);
  assert.match(source, /liveDashboardDataConfig/);
  assert.match(source, /config\.table_name = table\.displayName/);
  assert.match(source, /\+dashboard-create/);
  assert.match(source, /\+dashboard-block-create/);
  assert.match(source, /\+dashboard-block-update/);
  assert.match(source, /--position/);
  assert.match(source, /no_table_create:\s*true/);
  assert.match(source, /no_record_mutation:\s*true/);
  assert.match(source, /no_view_mutation:\s*true/);
  assert.match(source, /no_worker_deploy:\s*true/);
  assert.doesNotMatch(source, /provision-lark-base-ux\.mjs/);
  assert.doesNotMatch(source, /\+table-create|wrangler deploy|DELETE FROM|INSERT INTO/);
});

test('pipeline distribution bypasses the live COUNTA rendering gap with deal value SUM', () => {
  assert.match(source, /PIPELINE_DISTRIBUTION_BLOCK = "📈 Pipeline Distribution"/);
  assert.match(source, /delete config\.count_all/);
  assert.match(source, /field_name: "deal_value_thb", rollup: "SUM"/);
  assert.match(source, /grouped by pipeline_stage/);
});
