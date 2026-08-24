const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('premium UX provisioner uses concrete table/view IDs for property reads and writes', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../scripts/provision-lark-base-ux.mjs'), 'utf8');

  assert.match(source, /function requireResourceId\(/);
  assert.match(source, /const tableId = requireResourceId\(tables, tableContract\.name, "Table"\)/);
  assert.match(source, /const viewId = requireResourceId\(existing, view\.name, `View \$\{tableContract\.name\}`\)/);
  assert.match(source, /"--table-id", tableId,/);
  assert.match(source, /"--view-id", viewId,/);
  assert.match(source, /existing\.set\(view\.name, meta\)/);
  assert.doesNotMatch(source, /existing\.set\(view\.name, \{ id: "" \}\)/);
});
