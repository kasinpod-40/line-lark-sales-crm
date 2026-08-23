const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const operator = path.join(root, 'scripts/ensure-sales-person-fields.mjs');

test('field-only Person operator defaults to zero-mutation plan', () => {
  const stdout = execFileSync(process.execPath, [operator], { cwd: root, encoding: 'utf8' });
  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'plan');
  assert.equal(result.mutation_count, 0);
  assert.deepEqual(result.field, { name: 'sales', type: 'user', multiple: false });
  assert.ok(result.behavior.includes('zero record reads and zero record mutations'));
});

test('field-only Person apply reuses Customers.sales and creates only missing fields without record calls', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'line-crm-person-fields-'));
  const fakeCli = path.join(tempDir, 'lark-cli');
  const stateFile = path.join(tempDir, 'state.json');
  fs.writeFileSync(stateFile, JSON.stringify({ tbl_customers: true, tbl_chat: false, tbl_deals: false }));
  fs.writeFileSync(fakeCli, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : ''; };
const stateFile = ${JSON.stringify(stateFile)};
const read = () => JSON.parse(fs.readFileSync(stateFile, 'utf8'));
const write = (value) => fs.writeFileSync(stateFile, JSON.stringify(value));
if (args[0] === 'auth' && args[1] === 'status') {
  console.log(JSON.stringify({ identity: 'user', verified: true }));
  process.exit(0);
}
if (args[0] === 'base' && args[1] === '+field-list') {
  const table = flag('--table-id');
  const state = read();
  const items = state[table] ? [{ name: 'sales', type: 'user', multiple: false }] : [];
  console.log(JSON.stringify({ ok: true, data: { items } }));
  process.exit(0);
}
if (args[0] === 'base' && args[1] === '+field-create') {
  const table = flag('--table-id');
  const state = read();
  state[table] = true;
  write(state);
  console.log(JSON.stringify({ ok: true }));
  process.exit(0);
}
if (args[0] === 'base' && args[1].includes('record')) {
  console.error('record command must never be called');
  process.exit(9);
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
      env: { ...process.env, PATH: `${tempDir}${path.delimiter}${process.env.PATH || ''}` },
    });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);
    assert.equal(output.contract, 'lark_sales_person_field_only_v1');
    assert.equal(output.record_mutation_count, 0);
    assert.equal(output.totals.field_create_count, 2);
    assert.equal(output.totals.field_verified_count, 3);
    assert.equal(output.totals.record_mutation_count, 0);
    assert.deepEqual(output.results.map((item) => item.field_created), [false, true, true]);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
