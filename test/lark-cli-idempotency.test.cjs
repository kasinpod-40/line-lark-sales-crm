const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const helperUrl = pathToFileURL(path.resolve(__dirname, '../scripts/lark-cli-idempotency.mjs')).href;

async function loadHelpers() {
  return import(helperUrl);
}

test('recognizes the official Lark CLI persisted-state no-op failure as recoverable', async () => {
  const { isNoOpMutationFailure } = await loadHelpers();
  const raw = JSON.stringify({
    error: {
      type: 'api',
      subtype: 'unknown',
      message: 'no operation produced',
      hint: 'The requested mutation did not change any persisted state. If the current resource already matches the desired state, treat this as a no-op and skip the write.'
    }
  });
  assert.equal(isNoOpMutationFailure(raw), true);
  assert.equal(isNoOpMutationFailure('{"error":{"message":"permission denied"}}'), false);
});

test('view property readback matcher tolerates Lark CLI response wrappers but preserves array order', async () => {
  const { viewPropertyMatches } = await loadHelpers();
  const payload = {
    ok: true,
    visible_fields: {
      visible_fields: ['customer_id', 'display_name', 'lead_quality']
    }
  };
  assert.equal(viewPropertyMatches(payload, { visible_fields: ['customer_id', 'display_name', 'lead_quality'] }), true);
  assert.equal(viewPropertyMatches(payload, { visible_fields: ['display_name', 'customer_id', 'lead_quality'] }), false);
});

test('view property readback matcher accepts nested filter/group/sort envelopes from current CLI', async () => {
  const { viewPropertyMatches } = await loadHelpers();
  assert.equal(viewPropertyMatches({ ok: true, filter: { logic: 'and', conditions: [['hot_lead', '==', true]] } }, { logic: 'and', conditions: [['hot_lead', '==', true]] }), true);
  assert.equal(viewPropertyMatches({ ok: true, group: { group_config: [{ field: 'customer_stage', desc: false }] } }, { group_config: [{ field: 'customer_stage', desc: false }] }), true);
  assert.equal(viewPropertyMatches({ ok: true, sort: { sort_config: [{ field: 'updated_at', desc: true }] } }, { sort_config: [{ field: 'updated_at', desc: true }] }), true);
});
