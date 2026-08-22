const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const contract = JSON.parse(fs.readFileSync(path.join(root, 'deploy/lark-base-contract.json'), 'utf8'));
const { larkUserCell } = require('../.tmp-test/storage/lark-base.repository.js');

function table(name) {
  const value = contract.tables.find((item) => item.name === name);
  assert.ok(value, `missing table ${name}`);
  return value;
}

test('all three business tables expose a single-person sales field', () => {
  for (const name of ['Customers', 'Chat_Tracking', 'Sales_Deals']) {
    const field = table(name).fields.find((item) => item.name === 'sales');
    assert.ok(field, `missing ${name}.sales`);
    assert.equal(field.type, 'user');
    assert.equal(field.multiple, false);
  }
});

test('Lark Person cell uses callback open_id without display-name duplication', () => {
  assert.deepEqual(larkUserCell('ou_sales_123'), [{ id: 'ou_sales_123' }]);
  assert.deepEqual(larkUserCell('  ou_sales_123  '), [{ id: 'ou_sales_123' }]);
  assert.deepEqual(larkUserCell(''), []);
  assert.deepEqual(larkUserCell(undefined), []);
});
