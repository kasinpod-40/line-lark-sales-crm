const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const provisioner = path.join(root, 'scripts/provision-lark-base.mjs');

test('resume recognizes current Lark CLI id fields for existing table and primary field', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'line-crm-lark-id-shape-'));
  const fakeCli = path.join(tempDir, 'lark-cli');

  fs.writeFileSync(fakeCli, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--version') {
  console.log('1.0.89');
  process.exit(0);
}
if (args[0] === 'auth' && args[1] === 'status') {
  console.log(JSON.stringify({ appId: 'cli_test', brand: 'lark', identity: 'user', verified: true }));
  process.exit(0);
}
if (args[0] === 'base' && args[1] === '+table-list') {
  console.log(JSON.stringify({ ok: true, tables: [{ id: 'tbl_customers', name: 'Customers' }], total: 1 }));
  process.exit(0);
}
if (args[0] === 'base' && args[1] === '+field-list') {
  console.log(JSON.stringify({ ok: true, fields: [{ id: 'fld_customer_id', name: 'customer_id', type: 'text' }], total: 1 }));
  process.exit(0);
}
if (args[0] === 'base' && args[1] === '+table-create') {
  const nameIndex = args.indexOf('--name');
  const name = nameIndex >= 0 ? args[nameIndex + 1] : '<missing>';
  console.error(JSON.stringify({ error: { type: 'validation', subtype: 'sentinel', message: 'reached ' + name } }));
  process.exit(2);
}
console.error('unexpected fake lark-cli call: ' + args.join(' '));
process.exit(2);
`);
  fs.chmodSync(fakeCli, 0o755);

  try {
    const result = spawnSync(process.execPath, [provisioner, '--apply', '--base-token', 'bas_test'], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${tempDir}${path.delimiter}${process.env.PATH || ''}`,
      },
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Create table Chat_Tracking failed/);
    assert.doesNotMatch(result.stderr, /Create table Customers failed/);
    assert.doesNotMatch(result.stderr, /does not have required primary field customer_id/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
