const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

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

test('sales Person apply accepts bare record-list and batch-update outputs and verifies readback', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'line-crm-person-owner-'));
  const fakeCli = path.join(tempDir, 'lark-cli');
  fs.writeFileSync(fakeCli, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : ''; };
const flags = (name) => args.flatMap((value, index) => value === name ? [args[index + 1]] : []);
if (args[0] === 'auth' && args[1] === 'status') {
  console.log(JSON.stringify({ identity: 'user', verified: true }));
  process.exit(0);
}
if (args[0] === 'base' && args[1] === '+field-list') {
  console.log(JSON.stringify({ ok: true, data: { items: [{ name: 'sales', type: 'user', multiple: false }] } }));
  process.exit(0);
}
if (args[0] === 'base' && args[1] === '+record-list') {
  const output = flag('--output');
  const table = flag('--table-id');
  const sourceField = flags('--field-id')[0];
  const state = path.join(__dirname, 'updated-' + table);
  const sales = fs.existsSync(state) ? [{ id: 'ou_owner', name: 'Owner' }] : [];
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({ record_id: 'rec_' + table, [sourceField]: 'ou_owner', sales }) + '\\n');
  console.log(JSON.stringify({
    record_file: output,
    manifest_file: output.replace(/\\.ndjson$/, '.manifest.json'),
    record_file_size_bytes: fs.statSync(output).size,
    records_count: 1,
    has_more: false
  }));
  process.exit(0);
}
if (args[0] === 'base' && args[1] === '+record-batch-update') {
  const table = flag('--table-id');
  fs.writeFileSync(path.join(__dirname, 'updated-' + table), '1');
  console.log(JSON.stringify({}));
  process.exit(0);
}
console.error('unexpected fake lark-cli call: ' + args.join(' '));
process.exit(2);
`);
  fs.chmodSync(fakeCli, 0o755);

  try {
    const result = spawnSync(process.execPath, [
      operator,
      '--apply',
      '--base-token', 'base_test',
      '--customers-table-id', 'tbl_customers',
      '--chat-table-id', 'tbl_chat',
      '--deals-table-id', 'tbl_deals',
    ], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${tempDir}${path.delimiter}${process.env.PATH || ''}`,
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);
    assert.equal(output.mode, 'apply');
    assert.equal(output.results.length, 3);
    assert.ok(output.results.every((item) => item.owned === 1 && item.updated === 1 && item.verified === 1));
    assert.equal(output.totals.field_create_count, 0);
    assert.equal(output.totals.record_update_count, 3);
    assert.equal(output.totals.verified_owner_count, 3);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
