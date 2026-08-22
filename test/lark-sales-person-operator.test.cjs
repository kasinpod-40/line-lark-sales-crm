const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const operator = path.join(root, 'scripts/upgrade-sales-person-owner.mjs');

test('sales Person upgrade defaults to zero-mutation plan mode', () => {
  const stdout = execFileSync(process.execPath, [operator], { cwd: root, encoding: 'utf8' });
  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'plan');
  assert.equal(result.mutation_count, 0);
  assert.deepEqual(result.field, { name: 'sales', type: 'user', multiple: false });
  assert.deepEqual(result.tables.map((item) => item.source_field), [
    'assigned_sales_id',
    'assigned_sales_id',
    'sales_id',
  ]);
  assert.ok(result.behavior.some((item) => item.includes('no table/view/formula/delete/D1/Queue/R2 mutation')));
});
