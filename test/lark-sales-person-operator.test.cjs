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

test('sales Person apply accepts current bare record-list minimal stdout without ok=true', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'line-crm-person-owner-'));
  const fakeCli = path.join(tempDir, 'lark-cli');
  fs.writeFileSync(fakeCli, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : ''; };
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
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, '');
  console.log(JSON.stringify({
    record_file: output,
    manifest_file: output.replace(/\\.ndjson$/, '.manifest.json'),
    record_file_size_bytes: 0,
    records_count: 0,
    has_more: false
  }));
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
    assert.equal(output.totals.field_create_count, 0);
    assert.equal(output.totals.record_update_count, 0);
    assert.equal(output.totals.verified_owner_count, 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
