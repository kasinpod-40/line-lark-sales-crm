const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const manifest = JSON.parse(fs.readFileSync('deploy/product-manifest.json', 'utf8'));

test('product manifest locks reusable three-table contract and migration order', () => {
  assert.equal(manifest.release, '0.3.0');
  assert.deepEqual(manifest.business_tables, ['Customers', 'Chat_Tracking', 'Sales_Deals']);
  assert.equal(manifest.base_schema_contract, 'docs/lark-base-schema.md');
  assert.equal(manifest.base_machine_contract, 'deploy/lark-base-contract.json');
  assert.equal(manifest.base_provisioner, 'scripts/provision-lark-base.mjs');
  for (const file of [manifest.base_schema_contract, manifest.base_machine_contract, manifest.base_provisioner]) {
    assert.equal(fs.existsSync(file), true, file);
  }
  assert.deepEqual(manifest.d1_migrations, [
    'migrations/0001_operational_state.sql',
    'migrations/0002_srs_media_and_campaign_observability.sql',
  ]);
  for (const migration of manifest.d1_migrations) assert.equal(fs.existsSync(migration), true, migration);
  assert.equal(manifest.media_authority, 'lark_message_resources');
  assert.equal(manifest.r2_required, false);
  assert.equal(Object.hasOwn(manifest.cloudflare_bindings, 'r2'), false);
});

test('product manifest contains no credential values and requires customer-specific installation keys', () => {
  const serialized = JSON.stringify(manifest);
  assert.doesNotMatch(serialized, /Bearer\s+[A-Za-z0-9._-]+/i);
  for (const key of [
    'LINE_CHANNEL_SECRET',
    'LINE_CHANNEL_ACCESS_TOKEN',
    'LARK_APP_ID',
    'LARK_APP_SECRET',
    'PROMPTPAY_TARGET',
    'LARK_BASE_APP_TOKEN',
    'LARK_BASE_CUSTOMERS_TABLE_ID',
    'LARK_BASE_CHAT_TRACKING_TABLE_ID',
    'LARK_BASE_SALES_DEALS_TABLE_ID',
  ]) {
    assert.ok(manifest.required_secrets.includes(key) || manifest.required_vars.includes(key), key);
  }
});
