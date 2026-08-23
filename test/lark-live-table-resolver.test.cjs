const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');

async function helper() {
  return await import(pathToFileURL(path.join(root, 'scripts/lark-cli-resource-list.mjs')).href);
}

test('canonical table resolver maps emoji-prefixed golden Base names to exact live IDs', async () => {
  const { resourceMapFromList, resolveCanonicalNamedResource } = await helper();
  const map = resourceMapFromList({
    tables: [
      { table_id: 'tblCustomers', name: '👥 Customers' },
      { table_id: 'tblChat', name: '💬 Chat_Tracking' },
      { table_id: 'tblDeals', name: '💰 Sales_Deals' },
    ],
  }, {
    collectionKeys: ['tables', 'items'],
    nameKeys: ['name', 'table_name'],
    idKeys: ['id', 'table_id'],
    label: 'table',
  });

  assert.deepEqual(resolveCanonicalNamedResource(map, 'Customers', 'table'), {
    displayName: '👥 Customers', id: 'tblCustomers', raw: { table_id: 'tblCustomers', name: '👥 Customers' },
  });
  assert.equal(resolveCanonicalNamedResource(map, 'Chat_Tracking', 'table').id, 'tblChat');
  assert.equal(resolveCanonicalNamedResource(map, 'Sales_Deals', 'table').id, 'tblDeals');
});

test('canonical table resolver accepts exact schema names and fails closed on ambiguous suffixes', async () => {
  const { resolveCanonicalNamedResource } = await helper();
  assert.equal(resolveCanonicalNamedResource(new Map([
    ['Customers', { id: 'tblExact', raw: {} }],
  ]), 'Customers', 'table').id, 'tblExact');

  assert.throws(() => resolveCanonicalNamedResource(new Map([
    ['👥 Customers', { id: 'tblA', raw: {} }],
    ['Archive Customers', { id: 'tblB', raw: {} }],
  ]), 'Customers', 'table'), /Could not uniquely resolve table Customers; matches=2/);
});

test('lifecycle reconcile and QR recovery operators use resolved concrete table IDs', () => {
  const reconcile = fs.readFileSync(path.join(root, 'scripts/reconcile-lark-base-lifecycle-options.mjs'), 'utf8');
  const recovery = fs.readFileSync(path.join(root, 'scripts/recover-failed-qr-case.mjs'), 'utf8');

  for (const source of [reconcile, recovery]) {
    assert.match(source, /resolveCanonicalNamedResource/);
    assert.match(source, /\+table-list/);
    assert.match(source, /live_table_resolution: "exact_id_from_table_list"/);
  }

  assert.match(reconcile, /"--table-id", table\.id/);
  assert.match(reconcile, /"--field-id", field\.id/);
  assert.doesNotMatch(reconcile, /"--table-id", target\.table/);

  assert.match(recovery, /"--table-id", table\.id/);
  assert.doesNotMatch(recovery, /listByFilter\(args\.baseToken, "Customers"/);
  assert.doesNotMatch(recovery, /batchUpdate\(args\.baseToken, "Sales_Deals"/);
});
